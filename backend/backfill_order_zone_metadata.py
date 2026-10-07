"""Backfill consumed-zone metadata on existing ``order_master`` rows.

The engine is rerun at each order's stored timestamp.  Only a setup whose
side and three prices match the persisted order is accepted.  Run without
``--apply`` first to preview; use ``--apply`` to commit updates.
"""

from __future__ import annotations

import argparse
import math
import os
import sys
from datetime import datetime
from typing import Any, Dict, Optional, Tuple

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from shared.db.dbconn import DBConnection
from shared.db.db_model import Order
from shared.config.settings import stock_logic_config
from scripts.setup_engine_new import format_calculate_setup_response, process_setup


PRICE_TOLERANCE = 0.05


def _number(value: Any) -> Optional[float]:
    try:
        result = float(value)
        return result if math.isfinite(result) else None
    except (TypeError, ValueError):
        return None


def _matches(order: Order, setup: Dict[str, Any]) -> bool:
    return all(
        _number(setup.get(field)) is not None
        and _number(getattr(order, order_field)) is not None
        and abs(_number(setup[field]) - _number(getattr(order, order_field))) <= PRICE_TOLERANCE
        for field, order_field in (
            ("entry_price", "entry_price"),
            ("stop_loss", "stoploss_price"),
            ("target_price", "target_price"),
        )
    )


def _setup_for_order(order: Order) -> Tuple[Optional[Dict[str, Any]], str]:
    time_list = getattr(stock_logic_config, f"TIME_FRAMES_{order.time_frame}")
    scan_at = order.purchased_on or datetime.now()
    raw = process_setup(order.stock_tick, list(time_list), scan_at)
    if isinstance(raw, str):
        return None, f"engine error: {raw}"

    formatted = format_calculate_setup_response(
        raw,
        stock_name=order.stock_tick,
        time_fr=order.time_frame,
        last_d_time=scan_at,
        is_future=False,
        is_cash=True,
    )
    side = str(order.order_type or "").upper()
    setup = formatted.get(side)
    if not isinstance(setup, dict):
        return None, f"no {side} setup emitted"
    if not _matches(order, setup):
        return None, "emitted setup prices do not match order"
    if not setup.get("zone_signature"):
        return None, "matched setup has no zone_signature"
    if setup.get("base_start_idx") is None or setup.get("legout_end_idx") is None:
        return None, "matched setup has incomplete candle indices"
    return setup, "matched"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--order-id", type=int, help="backfill one order")
    parser.add_argument("--limit", type=int, help="maximum rows to inspect")
    parser.add_argument("--apply", action="store_true", help="commit updates")
    args = parser.parse_args()

    db = DBConnection()
    session = db.get_session()
    try:
        query = session.query(Order).filter(Order.zone_signature.is_(None))
        if args.order_id is not None:
            query = query.filter(Order.order_id == args.order_id)
        query = query.order_by(Order.order_id.asc())
        if args.limit is not None:
            query = query.limit(args.limit)
        orders = query.all()
        updated = skipped = errors = 0

        for order in orders:
            try:
                setup, reason = _setup_for_order(order)
                if setup is None:
                    skipped += 1
                    print(f"SKIP order_id={order.order_id}: {reason}")
                    continue

                print(
                    f"MATCH order_id={order.order_id}: "
                    f"sig={setup['zone_signature']} "
                    f"base={setup['base_start_idx']} legout={setup['legout_end_idx']}"
                )
                if args.apply:
                    order.zone_signature = str(setup["zone_signature"])
                    order.base_start_idx = int(setup["base_start_idx"])
                    order.legout_end_idx = int(setup["legout_end_idx"])
                    session.commit()
                updated += 1
            except Exception as exc:
                session.rollback()
                errors += 1
                print(f"ERROR order_id={order.order_id}: {exc}")

        print({"inspected": len(orders), "matched": updated, "skipped": skipped, "errors": errors, "applied": args.apply})
        return 1 if errors else 0
    finally:
        session.close()


if __name__ == "__main__":
    raise SystemExit(main())

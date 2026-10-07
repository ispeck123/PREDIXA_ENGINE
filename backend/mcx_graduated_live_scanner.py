"""MCX single-lot proving scanner.

This is intentionally separate from ``scanner_fc``: that legacy scanner
inserts every qualifying commodity signal immediately and has no proving
policy, observation tier, or source-to-execution routing.
"""
from __future__ import annotations

import argparse
import json
import math
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Callable, Iterable

from scripts.mcx_policy import mcx_disposition
from scripts.setup_engine_new import format_calculate_setup_response, process_setup_fc
from scripts.scanner_fc import build_commodity_expiry_map
from shared.config.settings import stock_logic_config
from shared.db import db_utils
from shared.db.db_model import Commodity_Order, CommoditiesMaster, OMSOrderBucketCommodity, TradeSignal

MCX_EXCHANGE_ID = 10
MCX_PROVING_SOURCES = ("GOLDM", "CRUDEOILM", "SILVER", "SILVERM", "NATGASMINI")
# Contract units used for exactly one MCX lot in the OMS.  FIRE remains
# restricted to CRUDEOILM/GOLDGUINEA; SILVER units are needed only so valid
# observe candidates can be reviewed in the same OMS workflow.
MCX_LOT_SIZE = {"CRUDEOILM": 10, "GOLDGUINEA": 8, "SILVER": 30, "SILVERM": 3}
MIN_RR = 2.1
DEFAULT_OUTPUT = Path("outputs/mcx_graduated_live/mcx_scan.jsonl")


@dataclass(frozen=True)
class MCXScanJob:
    symbol: str
    expiry: str
    strategy_tf: int
    time_list: list[str]
    last_d_time: Any


def default_mcx_jobs(timeframes=(1, 2, 3, 4), last_d_time=None, min_expiry_days=5):
    """Yield only the approved MCX source universe and valid expiries."""
    allowed = set(MCX_PROVING_SOURCES)
    for timeframe in timeframes:
        stack = list(getattr(stock_logic_config, f"COMMODITY_TIME_FRAME_{timeframe}"))
        # Unlike the legacy commodity scanner, a live OMS scanner must revisit
        # an active contract on every cycle to withdraw a setup invalidated by
        # the latest candle.
        for item in build_commodity_expiry_map(
                min_days=min_expiry_days, time_fr=timeframe, include_existing=True):
            symbol = str(item.get("symbol", "")).upper()
            if symbol not in allowed:
                continue
            for expiry in item.get("expiry", []):
                yield MCXScanJob(symbol, str(expiry), timeframe, stack, last_d_time or datetime.now())


def classify_mcx_setup(formatted: dict, job: MCXScanJob) -> dict:
    """Produce a durable audit record; never permit a SELL candidate."""
    record = {
        "timestamp": datetime.now().isoformat(), "symbol": job.symbol,
        "expiry": job.expiry, "strategy_tf": job.strategy_tf,
        "e_regime": formatted.get("e_regime", ""),
        "a_regime": formatted.get("a_regime", ""),
        "e1_session_boundary_count": formatted.get("e1_session_boundary_count", 0),
        "setup": formatted,
    }
    buy = formatted.get("BUY")
    if not isinstance(buy, dict):
        return record | {"status": "NO_BUY_SETUP"}
    try:
        entry = float(buy["entry_price"])
        stop = float(buy["stop_loss"])
        target = float(buy["target_price"])
        if not (stop < entry < target):
            raise ValueError("invalid long price ordering")
        calculated_rr = (target - entry) / (entry - stop)
        reported_rr = float(formatted.get("BUY_RRR", 0) or 0)
        if not (math.isfinite(calculated_rr) and math.isfinite(reported_rr)):
            raise ValueError("non-finite RR")
    except (KeyError, TypeError, ValueError):
        return record | {"status": "INVALID_BUY_LEVELS"}
    record["calculated_buy_rrr"] = round(calculated_rr, 4)
    record["reported_buy_rrr"] = reported_rr
    # This is a fail-closed guard around the common engine used by futures,
    # cash, and MCX.  A disagreement is evidence that E/S/T and the displayed
    # RR do not describe the same trade; never persist it as approvable.
    if not math.isclose(calculated_rr, reported_rr, rel_tol=0.0, abs_tol=0.0001):
        return record | {"status": "RRR_MISMATCH"}
    if calculated_rr < MIN_RR:
        return record | {"status": "RRR_TOO_LOW"}
    disposition, weight, execution_symbol = mcx_disposition(
        job.symbol, formatted.get("e_regime"), formatted.get("a_regime"), job.strategy_tf)
    if disposition == "EXCLUDED":
        return record | {"status": "MCX_SIZING_EXCLUDED",
                         "reason": "MCX_SIZING_EXCLUDED e=%s,a=%s,tf=%s,sym=%s" % (
                             formatted.get("e_regime"), formatted.get("a_regime"), job.strategy_tf, job.symbol),
                         "weight": 0.0}
    if disposition == "OBSERVE":
        return record | {"status": "OBSERVE_WOULD_FIRE", "weight": weight,
                         "side": "BUY", "execution_symbol": execution_symbol,
                         "lot_size": MCX_LOT_SIZE[execution_symbol],
                         "source_symbol": job.symbol,
                         "requires_quote_translation": execution_symbol != job.symbol,
                         "entry": entry,
                         "stop_loss": stop, "target": target,
                         "BUY_RRR": round(calculated_rr, 4)}
    return record | {
        "status": "FIRE_PENDING_OPTION3", "weight": weight, "side": "BUY",
        "execution_symbol": execution_symbol, "lot_size": MCX_LOT_SIZE[execution_symbol],
        "source_symbol": job.symbol, "requires_quote_translation": execution_symbol != job.symbol,
        "entry": entry, "stop_loss": stop, "target": target,
        "BUY_RRR": round(calculated_rr, 4),
    }


def persist_mcx_candidate(candidate: dict, job: MCXScanJob, signal_result: Any) -> dict:
    """Create/reuse TradeSignal, Commodity_Order, and OMS commodity candidate.

    This function is deliberately DB-only: no broker call is reachable here.
    GOLDM candidates are marked pending quote translation, so source-series
    prices can never be submitted as GOLDGUINEA prices.
    """
    signal_id = signal_result[1] if isinstance(signal_result, tuple) and len(signal_result) > 1 else signal_result
    session = db_utils.dbc.get_session()
    try:
        signal = session.query(TradeSignal).filter(TradeSignal.id == signal_id).first() if signal_id else None
        if signal is None:
            signal = session.query(TradeSignal).filter(
                TradeSignal.stock_name == job.symbol, TradeSignal.time_fr == job.strategy_tf,
                TradeSignal.trade_type == "BUY", TradeSignal.exp_date == str(job.expiry),
            ).order_by(TradeSignal.id.desc()).first()
        if signal is None:
            raise ValueError("MCX_REJECT_TRADE_SIGNAL_NOT_PERSISTED")
        execution_symbol = candidate["execution_symbol"]
        master = session.query(CommoditiesMaster).filter(
            CommoditiesMaster.symbol == execution_symbol, CommoditiesMaster.is_active == True,
        ).first()
        if master is None:
            raise ValueError(f"MCX_REJECT_EXECUTION_SYMBOL_NOT_ACTIVE:{execution_symbol}")
        if candidate["status"] == "OBSERVE_WOULD_FIRE":
            status = "pending_observation"
        else:
            status = "pending_quote_translation" if candidate["requires_quote_translation"] else "pending"
        now = datetime.now()
        order = session.query(Commodity_Order).filter(Commodity_Order.trade_signal_id == signal.id).first()
        if order is None:
            order = Commodity_Order(
                trade_signal_id=signal.id, stock_tick=execution_symbol, stock_id=master.id,
                country_id=1, time_frame=job.strategy_tf, order_type="BUY",
                entry_price=candidate["entry"], stoploss_price=candidate["stop_loss"],
                target_price=candidate["target"], stock_quantity=int(candidate["lot_size"]),
                purchased_cmp_date=now.strftime("%Y-%m-%dT%H:%M"), purchased_on=now,
                order_status=status, is_trade_started=False, is_evaluated=False,
                expiry_date=str(job.expiry), arima_ab_model_prediction="NA", arima_ab_model_prob=0.0,
            )
            session.add(order); session.flush()
        bucket = session.query(OMSOrderBucketCommodity).filter(
            OMSOrderBucketCommodity.trade_signal_id == signal.id).first()
        if bucket is None:
            bucket = OMSOrderBucketCommodity(
                order_id=order.order_id, trade_signal_id=signal.id, stock_tick=execution_symbol,
                stock_id=master.id, country_id=1, time_frame=job.strategy_tf, order_type="BUY",
                entry_price=candidate["entry"], stoploss_price=candidate["stop_loss"],
                target_price=candidate["target"], stock_quantity=int(candidate["lot_size"]),
                purchased_cmp_date=now.strftime("%Y-%m-%dT%H:%M"), purchased_on=now,
                order_status=status, is_trade_started=0, is_evaluated=0,
                expiry_date=str(job.expiry), approval_status="pending", approved_by=None,
                approved_at=None, id_fyers=None, gtt_id=None,
                arima_ab_model_prediction="NA", arima_ab_model_prob=0.0,
            )
            session.add(bucket); session.flush()
        session.commit()
        return {"trade_signal_id": signal.id, "commodity_order_id": order.order_id,
                "bucket_id": bucket.bucket_id, "status": status,
                "execution_symbol": execution_symbol}
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def reconcile_live_mcx_candidates(job: MCXScanJob, live_status: str) -> int:
    """Withdraw unapproved candidates that a newer live scan no longer supports.

    OMS is a review queue, not a historical ledger of still-actionable setups.
    Never alter broker-linked or started orders here; those require the normal
    execution/reconciliation path.
    """
    if live_status in {"FIRE_PENDING_OPTION3", "OBSERVE_WOULD_FIRE", "PROCESSING_ERROR"}:
        return 0
    session = db_utils.dbc.get_session()
    try:
        signals = session.query(TradeSignal).filter(
            TradeSignal.exchange_id == MCX_EXCHANGE_ID,
            TradeSignal.stock_name == job.symbol,
            TradeSignal.time_fr == job.strategy_tf,
            TradeSignal.exp_date == str(job.expiry),
            TradeSignal.is_active == True,
        ).all()
        changed = 0
        for signal in signals:
            bucket = session.query(OMSOrderBucketCommodity).filter(
                OMSOrderBucketCommodity.trade_signal_id == signal.id).first()
            order = session.query(Commodity_Order).filter(
                Commodity_Order.trade_signal_id == signal.id).first()
            if bucket is None or bucket.gtt_id or bucket.id_fyers or int(bucket.is_trade_started or 0):
                continue
            if not str(bucket.order_status or "").lower().startswith("pending"):
                continue
            bucket.order_status = "stale_live_rescan"
            bucket.approval_status = "expired"
            if order is not None:
                order.order_status = "stale_live_rescan"
            signal.is_active = False
            changed += 1
        session.commit()
        return changed
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


class MCXGraduatedLiveScanner:
    """Run supplied MCX jobs and emit only long-only proving records.

    FIRE records deliberately remain pending manual approval.  For GOLDM the
    record carries source levels and explicitly requires live GOLDGUINEA quote
    translation at approval; it must never be sent to Fyers using GOLDM prices.
    """
    def __init__(self, engine: Callable = process_setup_fc, formatter: Callable = format_calculate_setup_response,
                 signal_inserter: Callable = db_utils.insert_trade_signals,
                 candidate_persister: Callable = persist_mcx_candidate,
                 candidate_reconciler: Callable = reconcile_live_mcx_candidates):
        self.engine, self.formatter = engine, formatter
        self.signal_inserter, self.candidate_persister = signal_inserter, candidate_persister
        self.candidate_reconciler = candidate_reconciler

    def run(self, jobs: Iterable[MCXScanJob], output_path: Path) -> list[dict]:
        records = []
        output_path.parent.mkdir(parents=True, exist_ok=True)
        with output_path.open("w", encoding="utf-8") as fh:
            for job in jobs:
                try:
                    # This is a live scanner: bind the engine cut-off at the
                    # moment this contract is evaluated.  A job can remain in
                    # memory while other contracts are scanned, so its
                    # construction-time timestamp must never become the data
                    # cut-off for a later live evaluation.
                    scan_time = datetime.now()
                    raw = self.engine(job.symbol, job.time_list, job.expiry, scan_time, False)
                    if isinstance(raw, str):
                        raise RuntimeError(raw)
                    formatted = self.formatter(raw, stock_name=job.symbol,
                        time_fr=job.strategy_tf, exp_num=job.expiry,
                        last_d_time=scan_time, is_future=False, is_cash=False)
                    record = classify_mcx_setup(formatted, job)
                    record["scan_timestamp"] = scan_time.isoformat()
                    if record["status"] in {"FIRE_PENDING_OPTION3", "OBSERVE_WOULD_FIRE"}:
                        signal_payload = dict(formatted)
                        # Persist the independently verified RR alongside the
                        # exact E/S/T values, never the engine's stale value.
                        signal_payload["BUY_RRR"] = record["BUY_RRR"]
                        signal_payload.update(TRADE_TYPE="BUY", PREDICTION="NA", PROBABILITY=0.0,
                                              EXP_NUM=job.expiry)
                        signal_payload["BUY"] = dict(signal_payload["BUY"], **{
                            "source_symbol": record["source_symbol"],
                            "execution_symbol": record["execution_symbol"],
                            "requires_quote_translation": record["requires_quote_translation"],
                            "mcx_weight": record["weight"],
                        })
                        inserted = self.signal_inserter(signal_payload, 1, MCX_EXCHANGE_ID, job.strategy_tf)
                        record["persistence"] = self.candidate_persister(record, job, inserted)
                    else:
                        record["reconciled_candidates"] = self.candidate_reconciler(job, record["status"])
                except Exception as exc:
                    record = {"timestamp": datetime.now().isoformat(), "symbol": job.symbol,
                              "expiry": job.expiry, "strategy_tf": job.strategy_tf,
                              "status": "PROCESSING_ERROR", "error": str(exc)}
                records.append(record)
                fh.write(json.dumps(record, default=str) + "\n")
        return records


def main() -> int:
    parser = argparse.ArgumentParser(description="MCX Option-3 single-lot proving scanner")
    parser.add_argument("--timeframe", type=int, action="append", dest="timeframes")
    parser.add_argument("--min-expiry-days", type=int, default=5)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    records = MCXGraduatedLiveScanner().run(
        default_mcx_jobs(args.timeframes or (1, 2, 3, 4), min_expiry_days=args.min_expiry_days),
        args.output,
    )
    print(json.dumps({"records": len(records),
                      "fire_candidates": sum(x.get("status") == "FIRE_PENDING_OPTION3" for x in records),
                      "observe": sum(x.get("status") == "OBSERVE_WOULD_FIRE" for x in records),
                      "output": str(args.output)}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

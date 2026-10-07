import json
import time
from dataclasses import dataclass
from datetime import datetime
from typing import List, Dict, Any, Optional, Tuple
import sys, os

# Add parent directory to path to import shared modules
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from shared.config import settings as cfg
from shared.db.dbconn import DBConnection
from shared.db.db_model import Order, TradeSignal
from shared.db.db_utils import (
    insert_trade_signals,
    check_and_insert_automated_alert,
    push_trades_to_order,
    insert_order_and_oms_bucket,
)
from shared.utils.logger import logger
from scripts.setup_engine_new import process_setup, format_calculate_setup_response
from scripts.sizing_bridge import size_for_order

dbc = DBConnection()

# Minimum RR required before inserting a trade signal.
MIN_RR_THRESHOLD = 2.0


def _zone_bounds(zone_signature: str) -> Optional[Tuple[float, float]]:
    """Extract the price range from SYMBOL:TF:proximal:distal."""
    try:
        _, _, proximal, distal = str(zone_signature).rsplit(":", 3)
        return min(float(proximal), float(distal)), max(float(proximal), float(distal))
    except (TypeError, ValueError):
        return None


def _zone_overlap_pct(new_signature: str, consumed_signature: str) -> float:
    """Mirror the engine: percentage of the new zone covered by the old zone."""
    new_bounds = _zone_bounds(new_signature)
    consumed_bounds = _zone_bounds(consumed_signature)
    if not new_bounds or not consumed_bounds:
        return 1.0

    new_low, new_high = new_bounds
    old_low, old_high = consumed_bounds
    new_height = new_high - new_low
    if new_height <= 0:
        return 0.0

    overlap = min(new_high, old_high) - max(new_low, old_low)
    return max(0.0, overlap) / new_height


def _is_reactivated_zone(setup: Dict[str, Any], consumed: Order) -> bool:
    """Apply all three doctrine conditions to a previously consumed zone."""
    new_base_start = setup.get("base_start_idx")
    consumed_legout_end = consumed.legout_end_idx
    return (
        int(setup.get("retest_count", 0) or 0) == 0
        and new_base_start is not None
        and consumed_legout_end is not None
        and int(new_base_start) > int(consumed_legout_end)
        and _zone_overlap_pct(
            setup.get("zone_signature"),
            consumed.zone_signature,
        ) < 0.50
    )


def consumed_zone_suppression(
    setup: Dict[str, Any],
    order_type: str = "BUY",
) -> Tuple[bool, Optional[str]]:
    """Return (suppress, reason) for an Execute-TF setup before insertion."""
    if not setup.get("is_execute_tf"):
        return False, None

    dead_after = int(setup.get("consumption_dead_after", 0) or 0)
    if dead_after <= 0:
        return False, None

    zone_signature = setup.get("zone_signature")
    if not zone_signature:
        logger.warning(
            "Consumed-zone check skipped: Execute-TF setup has no zone_signature"
        )
        return False, None

    session = dbc.get_session()
    try:
        query = (
            session.query(Order)
            .filter(
                Order.stock_tick == str(zone_signature).split(":", 1)[0],
                Order.is_trade_started == True,
                Order.order_type == str(order_type).upper(),
            )
            .order_by(Order.order_id.desc())
        )
        completed = query.all()
    finally:
        session.close()

    exact_completed = [
        order for order in completed
        if order.zone_signature == zone_signature
    ]
    prior = len(exact_completed)
    if prior < dead_after:
        if exact_completed:
            # The exact structural zone still has an allowed consumption left
            # (notably GDZ's single validated retest).
            return False, None
        # A changed signature can still represent the same spent inventory.
        # Contained prior zones (>=50% overlap) are treated as re-fires unless
        # all structural reactivation conditions pass.
        for consumed in completed:
            if not consumed.zone_signature:
                continue
            overlap = _zone_overlap_pct(zone_signature, consumed.zone_signature)
            if overlap >= 0.50 and not _is_reactivated_zone(setup, consumed):
                reason = (
                    "CONSUMED_ZONE_REFIRE "
                    f"(sig={zone_signature}, prior={prior}, limit={dead_after})"
                )
                return True, reason
        return False, None

    # An exact signature normally overlaps 100%; retaining the full doctrine
    # check also handles a future stable-signature implementation whose price
    # bounds can move while preserving level identity.
    if exact_completed and _is_reactivated_zone(setup, exact_completed[0]):
        return False, None

    reason = (
        "CONSUMED_ZONE_REFIRE "
        f"(sig={zone_signature}, prior={prior}, limit={dead_after})"
    )
    return True, reason


# -----------------------------------------------------------------------------
# Frozen NSE cash wet-run universe
# Exact stock_tick values resolved from the supplied ind_stock_master CSV.
# The scanner does not query Ind_StockMaster to build the scan universe.
# -----------------------------------------------------------------------------
# CASH_WETRUN_STOCKS = (
#     "icicibank",                 # ICICIBANK
#     "hdfcbank",                  # HDFCBANK
#     "bajaj_finance",             # BAJFINANCE
#     "shriram_finance",           # SHRIRAMFIN
#     "infy",                      # INFY
#     "hcl_technologies",          # HCLTECH
#     "sun_pharma",                # SUNPHARMA
#     "torrent_pharmaceuticals",   # TORNTPHARM
#     "maruti_suzuki",             # MARUTI
#     "tvs_motor",                 # TVSMOTOR
#     "hindunilvr",                # HINDUNILVR
#     "britannia_industries",      # BRITANNIA
#     "tata_steel",                # TATASTEEL
#     "hindalco_industries",       # HINDALCO
#     "larsen_toubro",             # LT
#     "hindustan_aeronautics",     # HAL
#     "ntpc",                      # NTPC
#     "ultratech_cement",          # ULTRACEMCO
#     "titan",                     # TITAN
#     "trent",                     # TRENT
#     "dlf",                       # DLF
#     "indigo",                    # INDIGO
#     "reliance",                  # RELIANCE
#     "bharti_airtel",             # BHARTIARTL
# )
CASH_WETRUN_STOCKS = (
    "abb_india",                    # ABB
    "adani_ports",                  # ADANIPORTS
    "apollo_hospitals",             # APOLLOHOSP
    "bajaj_auto",                   # BAJAJ-AUTO
    "bajaj_finance",                # BAJFINANCE
    "bank_of_baroda",               # BANKBARODA
    "bharat_electronics",           # BEL
    "bharti_airtel",                # BHARTIARTL
    "britannia_industries",         # BRITANNIA
    "cg_power_inds",                # CGPOWER
    "cholamandalam_investment",     # CHOLAFIN
    "divis_laboratories",           # DIVISLAB
    "dlf",                          # DLF
    "eicher_motors",                # EICHERMOT
    "eternal",                      # ETERNAL
    "godrej_consumer",              # GODREJCP
    "grasim_industries",            # GRASIM
    "hindustan_aeronautics",        # HAL
    "hcl_technologies",             # HCLTECH
    "hdfcbank",                     # HDFCBANK
    "hero_motocorp",                # HEROMOTOCO
    "hindalco_industries",          # HINDALCO
    "hindunilvr",                   # HINDUNILVR
    "icicibank",                    # ICICIBANK
    "icici_lombard_gic",            # ICICIGI
    "indian_hotels",                # INDHOTEL
    "indigo",                       # INDIGO
    "infy",                         # INFY
    "jindal_steel_power",           # JINDALSTEL
    "jsw_steel",                    # JSWSTEEL
    "larsen_toubro",                # LT
    "ltimindtree",                  # LTIM
    "mahindra_mahindra",            # M&M
    "maruti_suzuki",                # MARUTI
    "info_edge",                    # NAUKRI
    "ntpc",                         # NTPC
    "power_finance_corporation",    # PFC
    "pidilite_industries",          # PIDILITIND
    "reliance",                     # RELIANCE
    "shree_cement",                 # SHREECEM
    "shriram_finance",              # SHRIRAMFIN
    "siemens",                      # SIEMENS
    "sun_pharma",                   # SUNPHARMA
    "tatamotors",                   # TATAMOTORS
    "tata_steel",                   # TATASTEEL
    "titan",                        # TITAN
    "torrent_pharmaceuticals",      # TORNTPHARM
    "trent",                        # TRENT
    "tvs_motor",                    # TVSMOTOR
    "ultratech_cement",             # ULTRACEMCO
    "varun_beverages",              # VBL
    "vedanta",                      # VEDL
)

# -----------------------------------------------------------------------------
# Wet-run timeframe mapping
# These lists are read directly from shared/config/settings.py.
# Requested timeframe IDs: 1, 2, 5, 25 and 6.
# -----------------------------------------------------------------------------
CASH_WETRUN_TIMEFRAMES = {
    1: cfg.Config.TIME_FRAMES_1,
    2: cfg.Config.TIME_FRAMES_2,
    5: cfg.Config.TIME_FRAMES_5,
    25: cfg.Config.TIME_FRAMES_25,
    6: cfg.Config.TIME_FRAMES_6,
}


# Run in this exact order.
CASH_WETRUN_TIMEFRAME_ORDER = (1, 2, 5, 25, 6)


def get_all_stock_syms() -> List[str]:
    """Return only the frozen 24-symbol wet-run universe."""
    return list(CASH_WETRUN_STOCKS)


def get_available_stock_syms_by_timeframe(time_fr: int) -> List[str]:
    """
    Return all 24 wet-run symbols for an approved timeframe.

    The scan universe does not come from the database.
    """
    if time_fr not in CASH_WETRUN_TIMEFRAMES:
        raise ValueError(
            f"Unsupported wet-run timeframe: {time_fr}. "
            f"Allowed: {list(CASH_WETRUN_TIMEFRAME_ORDER)}"
        )

    return list(CASH_WETRUN_STOCKS)


def get_active_trades_by_timeframe(time_fr: int):
    """Fetch active trades only for the 24-symbol wet-run universe."""
    db = dbc.get_session()

    try:
        return (
            db.query(TradeSignal)
            .filter(TradeSignal.time_fr == time_fr)
            .filter(TradeSignal.is_active == True)
            .filter(TradeSignal.exchange_id == 8)
            .filter(TradeSignal.stock_name.in_(list(CASH_WETRUN_STOCKS)))
            .all()
        )
    finally:
        db.close()


def deactivate_trade(trade_id: int) -> bool:
    """Mark a stale trade as inactive."""
    db = dbc.get_session()

    try:
        trade = (
            db.query(TradeSignal)
            .filter(TradeSignal.id == trade_id)
            .first()
        )

        if not trade:
            return False

        trade.is_active = False
        db.commit()

        logger.info(
            f"Deactivated stale trade {trade_id} "
            f"({trade.stock_name})"
        )
        return True

    except Exception as exc:
        db.rollback()
        logger.error(
            f"Error deactivating trade {trade_id}: {exc}",
            exc_info=True,
        )
        return False

    finally:
        db.close()


@dataclass
class ScanJob:
    time_lists: List[List[str]]
    time_frame: int
    last_d_time: Any
    output_path: str = "cash_wetrun_scan_results.jsonl"
    append: bool = True


class SetupScannerOrchestrator:
    """
    Run the setup engine for the frozen cash wet-run universe and write
    one result per symbol/timeframe combination to JSONL.
    """

    def __init__(self):
        self.run_id_counter = 0

    def _new_run_id(self) -> str:
        self.run_id_counter += 1
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        return f"RUN_{timestamp}_{self.run_id_counter}"

    @staticmethod
    def _infer_execute_tf(time_list: List[str]) -> str:
        return time_list[-1]

    def run(self, job: ScanJob) -> Dict[str, Any]:
        if job.time_frame not in CASH_WETRUN_TIMEFRAMES:
            raise ValueError(
                f"Unsupported wet-run timeframe: {job.time_frame}. "
                f"Allowed: {list(CASH_WETRUN_TIMEFRAME_ORDER)}"
            )

        run_id = self._new_run_id()
        started = time.time()

        mode = "a" if job.append else "w"
        total = 0
        ok = 0
        failed = 0
        buys_generated = 0
        sells_generated = 0
        consumed_zone_suppressed = 0

        symbols = get_available_stock_syms_by_timeframe(job.time_frame)

        logger.info(
            f"Starting scan: run_id={run_id}, "
            f"time_frame={job.time_frame}, "
            f"time_lists={job.time_lists}, "
            f"symbols={len(symbols)}"
        )

        with open(job.output_path, mode, encoding="utf-8") as output_file:
            for symbol in symbols:
                for time_list in job.time_lists:
                    total += 1
                    execute_tf = self._infer_execute_tf(time_list)

                    record: Dict[str, Any] = {
                        "run_id": run_id,
                        "timestamp": datetime.now().isoformat(),
                        "symbol": symbol,
                        "time_frame": job.time_frame,
                        "time_list": time_list,
                        "execute_tf": execute_tf,
                    }

                    try:
                        logger.info(
                            f"Scanning {symbol} | "
                            f"TF ID={job.time_frame} | "
                            f"stack={time_list}"
                        )

                        raw = process_setup(
                            symbol,
                            time_list,
                            job.last_d_time,
                        )

                        if isinstance(raw, str):
                            raise RuntimeError(raw)

                        formatted = format_calculate_setup_response(
                            raw,
                            stock_name=symbol,
                            time_fr=job.time_frame,
                            last_d_time=job.last_d_time,
                            is_future=False,
                            is_cash=True
                        )

                        record["status"] = "OK"
                        record["setup"] = formatted
                        ok += 1

                        # BUY insertion flow remains unchanged.
                        if (
                            "BUY" in formatted
                            and formatted.get("BUY_RRR", 0)
                            >= MIN_RR_THRESHOLD
                        ):
                            formatted["TRADE_TYPE"] = "BUY"
                            formatted["PREDICTION"] = "NA"
                            formatted["PROBABILITY"] = 0.0
                            formatted[formatted["TRADE_TYPE"]]["e_regime"] = formatted.get("e_regime", None)
                            formatted[formatted["TRADE_TYPE"]]["a_regime"] = formatted.get("a_regime", None)

                            suppress, reason = consumed_zone_suppression(
                                formatted["BUY"],
                                order_type="BUY",
                            )
                            if suppress:
                                consumed_zone_suppressed += 1
                                record["suppressed"] = True
                                record["suppression_reason"] = reason
                                logger.warning(reason)
                            else:
                                order_type = formatted['TRADE_TYPE']
                                t_data = formatted[order_type]
                                qty = size_for_order(formatted, t_data, str(job.time_frame), "NSE_CASH")
                                if qty is None:
                                    formatted[formatted["TRADE_TYPE"]]["regime_tf_excluded "] = "yes"
                                    formatted[formatted["TRADE_TYPE"]]["order_pushed"] = ""
                                else:
                                    formatted[formatted["TRADE_TYPE"]]["regime_tf_excluded "] = ""
                                    formatted[formatted["TRADE_TYPE"]]["order_pushed"] = "yes"
                                

                                res_ins_trade, trade_id = insert_trade_signals(
                                    formatted,
                                    1,
                                    8,
                                    job.time_frame,
                                )

                                if res_ins_trade:
                                    formatted["trade_id"] = trade_id
                                    # push_trades_to_order(job.time_frame, 1, [formatted])
                                    # order_type = formatted['TRADE_TYPE']
                                    # t_data = formatted[order_type]

                                    logger.info(f"e_regime ----- {formatted.get("e_regime", "")}")
                                    logger.info(f"a_regime ----- {formatted.get("a_regime", "")}")
                                    # qty = size_for_order(formatted, t_data, str(job.time_frame), "NSE_CASH")
                                    if qty is None:
                                        # regime x TF weight = 0 (net-negative / unmapped cell) -> do NOT place this order
                                        logger.info(f"REGIME TF EXCLUDED (e_regime - {formatted.get("e_regime", " ")}, a_regime - {formatted.get("a_regime", " ")}, time_frame - {job.time_frame})")
                                        continue
                                    insert_order_and_oms_bucket(t_data, order_type, job.time_frame, formatted['STOCK_NAME'], job.last_d_time, "india", 1, "NA", 0.0, formatted['trade_id'], qty)
                                    # insert_order_and_oms_bucket(t_data, order_type, job.time_frame, formatted['STOCK_NAME'], job.last_d_time, "india", 1, "NA", 0.0, formatted['trade_id'], 1)
                                    # check_and_insert_automated_alert(
                                    #     formatted,
                                    #     8,
                                    #     1,
                                    #     job.time_frame,
                                    # )
                                    buys_generated += 1

                        # SELL insertion flow remains unchanged from scanner.py.
                        # if (
                        #     "SELL" in formatted
                        #     and formatted.get("SELL_RRR", 0)
                        #     >= MIN_RR_THRESHOLD
                        # ):
                        #     formatted["TRADE_TYPE"] = "SELL"
                        #     formatted["PREDICTION"] = "NA"
                        #     formatted["PROBABILITY"] = 0.0

                        #     res_ins_trade, trade_id = insert_trade_signals(
                        #         formatted,
                        #         1,
                        #         8,
                        #         job.time_frame,
                        #     )

                        #     if res_ins_trade:
                        #         formatted["trade_id"] = trade_id
                        #         check_and_insert_automated_alert(
                        #             formatted,
                        #             8,
                        #             1,
                        #             job.time_frame,
                        #         )
                        #         sells_generated += 1

                    except Exception as exc:
                        record["status"] = "ERROR"
                        record["error"] = str(exc)
                        failed += 1

                        logger.error(
                            f"Error processing {symbol} "
                            f"TF ID={job.time_frame} "
                            f"stack={time_list}: {exc}",
                            exc_info=True,
                            stack_info=True,
                        )

                    output_file.write(json.dumps(record, default=str))
                    output_file.write("\n")
                    output_file.flush()

        result = {
            "run_id": run_id,
            "time_frame": job.time_frame,
            "time_lists": job.time_lists,
            "symbols": len(symbols),
            "output_path": job.output_path,
            "total_jobs": total,
            "ok": ok,
            "failed": failed,
            "buys_generated": buys_generated,
            "sells_generated": sells_generated,
            "consumed_zone_suppressed": consumed_zone_suppressed,
            "duration_seconds": round(time.time() - started, 2),
        }

        logger.info(f"Completed scan: {result}")
        return result

    def revalidate_active_trades(self, job: ScanJob) -> Dict[str, Any]:
        """Revalidate active trades for one approved timeframe."""
        started = time.time()
        active_trades = get_active_trades_by_timeframe(job.time_frame)

        total = len(active_trades)
        deactivated = 0
        still_valid = 0
        errors = 0

        for trade in active_trades:
            try:
                symbol = trade.stock_name

                for time_list in job.time_lists:
                    raw = process_setup(
                        symbol,
                        time_list,
                        job.last_d_time,
                    )

                    if isinstance(raw, str):
                        deactivate_trade(trade.id)
                        deactivated += 1
                        logger.warning(
                            f"Deactivated trade {trade.id} ({symbol}): "
                            "engine error during revalidation"
                        )
                        break

                    formatted = format_calculate_setup_response(
                        raw,
                        stock_name=symbol,
                        time_fr=job.time_frame,
                        last_d_time=job.last_d_time,
                        is_future=False,
                        is_cash=True
                    )

                    trade_type = trade.trade_type
                    is_valid = False

                    if trade_type == "BUY" and "BUY" in formatted:
                        is_valid = (
                            formatted.get("BUY_RRR", 0)
                            >= MIN_RR_THRESHOLD
                        )

                    elif trade_type == "SELL" and "SELL" in formatted:
                        is_valid = (
                            formatted.get("SELL_RRR", 0)
                            >= MIN_RR_THRESHOLD
                        )

                    if is_valid:
                        still_valid += 1
                    else:
                        deactivate_trade(trade.id)
                        deactivated += 1
                        logger.info(
                            f"Deactivated stale trade {trade.id} "
                            f"({symbol} {trade_type}): "
                            "conditions no longer valid"
                        )

                    break

            except Exception as exc:
                errors += 1
                logger.error(
                    f"Error revalidating trade {trade.id} "
                    f"({trade.stock_name}): {exc}",
                    exc_info=True,
                )

        return {
            "time_frame": job.time_frame,
            "total_active": total,
            "still_valid": still_valid,
            "deactivated": deactivated,
            "errors": errors,
            "duration_seconds": round(time.time() - started, 2),
        }


def run_cash_wetrun_scanner(
    output_path: str = "cash_wetrun_scan_results.jsonl",
    append: bool = True,
) -> Dict[str, Any]:
    """
    Run all 24 hardcoded symbols against the five approved timeframe IDs:

        1  -> cfg.TIME_FRAMES_1
        2  -> cfg.TIME_FRAMES_2
        5  -> cfg.TIME_FRAMES_5
        25 -> cfg.TIME_FRAMES_25
        6  -> cfg.TIME_FRAMES_6

    Total scan jobs per complete run:
        24 symbols x 5 timeframe stacks = 120 jobs
    """
    scanner = SetupScannerOrchestrator()
    last_d_time = datetime.now()

    overall_started = time.time()
    timeframe_results: List[Dict[str, Any]] = []

    logger.info(
        "Starting complete cash wet-run scan: "
        f"symbols={len(CASH_WETRUN_STOCKS)}, "
        f"timeframes={list(CASH_WETRUN_TIMEFRAME_ORDER)}, "
        f"expected_jobs="
        f"{len(CASH_WETRUN_STOCKS) * len(CASH_WETRUN_TIMEFRAME_ORDER)}"
    )

    for index, time_frame_id in enumerate(CASH_WETRUN_TIMEFRAME_ORDER):
        timeframe_stack = list(CASH_WETRUN_TIMEFRAMES[time_frame_id])

        job = ScanJob(
            time_lists=[timeframe_stack],
            time_frame=time_frame_id,
            last_d_time=last_d_time,
            output_path=output_path,
            # If append=False, only the first timeframe clears the old file.
            append=append if index == 0 else True,
        )

        result = scanner.run(job)
        timeframe_results.append(result)

    summary = {
        "started_at": last_d_time.isoformat(),
        "completed_at": datetime.now().isoformat(),
        "symbols": len(CASH_WETRUN_STOCKS),
        "timeframes": list(CASH_WETRUN_TIMEFRAME_ORDER),
        "total_jobs": sum(item["total_jobs"] for item in timeframe_results),
        "ok": sum(item["ok"] for item in timeframe_results),
        "failed": sum(item["failed"] for item in timeframe_results),
        "buys_generated": sum(
            item["buys_generated"] for item in timeframe_results
        ),
        "sells_generated": sum(
            item["sells_generated"] for item in timeframe_results
        ),
        "consumed_zone_suppressed": sum(
            item["consumed_zone_suppressed"] for item in timeframe_results
        ),
        "duration_seconds": round(time.time() - overall_started, 2),
        "output_path": output_path,
        "timeframe_results": timeframe_results,
    }

    logger.info(f"Complete cash wet-run scan finished: {summary}")
    print(json.dumps(summary, indent=4, default=str))

    return summary


if __name__ == "__main__":
    run_cash_wetrun_scanner(
        output_path="cash_wetrun_scan_results.jsonl",
        append=True,
    )

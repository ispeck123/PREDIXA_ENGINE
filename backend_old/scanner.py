import json
import time
from dataclasses import dataclass, asdict
from datetime import datetime
from typing import List, Dict, Any, Optional
from shared.db.dbconn import DBConnection
from scripts.setup_engine_new import process_setup, format_calculate_setup_response
from scripts.side_enablement_policy import SIDE_POLICY, Side
from shared.db.db_model import Ind_StockMaster, TradeSignal
from concurrent.futures import ThreadPoolExecutor
from shared.db.db_utils import insert_trade_signals, check_and_insert_automated_alert
from shared.utils.logger import logger
from sqlalchemy.sql import exists

dbc = DBConnection()

# v3.8.9: Configurable minimum RR threshold for trade generation.
# Previously hardcoded at 2.1. Engine G9 gate uses 2.0.
# Scanner should match engine threshold to avoid 0.1 discrepancy.
MIN_RR_THRESHOLD = 2.1
# CASH_SHORT_TFS superseded by SideEnablementPolicy (single source of truth). See side_enablement_policy.py.


def get_all_stock_syms():
    db = dbc.get_session()
    res = db.query(Ind_StockMaster).filter(Ind_StockMaster.is_active == True).all()
    return [items.stock_tick for items in res]


def get_available_stock_syms_by_timeframe(time_fr: int):
    db = dbc.get_session()

    try:
        res = (
            db.query(Ind_StockMaster.stock_tick)
            .filter(Ind_StockMaster.is_active == True)
            .filter(
                ~exists().where(
                    (TradeSignal.stock_name == Ind_StockMaster.stock_tick) &
                    (TradeSignal.time_fr == time_fr) &
                    (TradeSignal.is_active == True) &
                    (TradeSignal.exchange_id == 8)
                )
            )
            .all()
        )

        return [item.stock_tick for item in res]

    finally:
        db.close()


def get_active_trades_by_timeframe(time_fr: int):
    """v3.8.9: Fetch all active trades for revalidation."""
    db = dbc.get_session()
    try:
        res = (
            db.query(TradeSignal)
            .filter(TradeSignal.time_fr == time_fr)
            .filter(TradeSignal.is_active == True)
            .filter(TradeSignal.exchange_id == 8)
            .all()
        )
        return res
    finally:
        db.close()


def deactivate_trade(trade_id: int):
    """v3.8.9: Mark a stale trade as inactive."""
    db = dbc.get_session()
    try:
        trade = db.query(TradeSignal).filter(TradeSignal.id == trade_id).first()
        if trade:
            trade.is_active = False
            db.commit()
            logger.info(f"Deactivated stale trade {trade_id} ({trade.stock_name})")
            return True
        return False
    except Exception as e:
        db.rollback()
        logger.error(f"Error deactivating trade {trade_id}: {e}")
        return False
    finally:
        db.close()


@dataclass
class ScanJob:
    time_lists: List[List[str]]   # e.g. [["Monthly","Weekly","Daily"], ["Weekly","Daily","60m"], ...]
    time_frame: int 
    last_d_time: Any              # whatever your load_preprocess_data expects (datetime / int / etc.)
    output_path: str = "scan_results.json"
    append: bool = True



class SetupScannerOrchestrator:
    """
    Runs your SD Engine pipeline across symbols and timeframe triplets,
    and writes formatted results to JSONL.
    """

    def __init__(self):
        self.run_id_counter = 0

    def _new_run_id(self) -> str:
        self.run_id_counter += 1
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        return f"RUN_{ts}_{self.run_id_counter}"

    @staticmethod
    def _infer_execute_tf(time_list: List[str]) -> str:
        # Your engine expects time_list = [E, A, X]
        # So execute timeframe is last item
        return time_list[-1]

    def run(self, job: ScanJob) -> Dict[str, Any]:
        run_id = self._new_run_id()
        started = time.time()

        mode = "a" if job.append else "w"
        total = 0
        ok = 0
        failed = 0
        buys_generated = 0
        sells_generated = 0

        with open(job.output_path, mode, encoding="utf-8") as f:
            for symbol in get_available_stock_syms_by_timeframe(job.time_frame):
                for time_list in job.time_lists:
                    total += 1
                    execute_tf = self._infer_execute_tf(time_list)

                    record: Dict[str, Any] = {
                        "run_id": run_id,
                        "timestamp": datetime.now().isoformat(),
                        "symbol": symbol,
                        "time_list": time_list,
                        "execute_tf": execute_tf,
                    }

                    try:
                        raw = process_setup(symbol, time_list, job.last_d_time)
                        # If process_setup returns str(error), treat as error
                        if isinstance(raw, str):
                            raise RuntimeError(raw)

                        formatted = format_calculate_setup_response(
                            raw,
                            stock_name=symbol,
                            time_fr=job.time_frame,
                            last_d_time=job.last_d_time,
                            is_cash=True
                        )

                        record["status"] = "OK"
                        record["setup"] = formatted
                        ok += 1

                        # v3.8.9: Generate BUY trade if conditions met
                        if 'BUY' in formatted and formatted.get('BUY_RRR', 0) >= MIN_RR_THRESHOLD:
                            formatted['TRADE_TYPE'] = 'BUY'
                            formatted['PREDICTION'] = "NA"
                            formatted['PROBABILITY'] = 0.0
                            res_ins_trade, trade_id = insert_trade_signals(formatted, 1, 8, job.time_frame)
                            if res_ins_trade:
                                formatted["trade_id"] = trade_id
                                check_and_insert_automated_alert(formatted, 8, 1, job.time_frame)
                                buys_generated += 1

                        # v3.8.9: Generate SELL trade if conditions met
                        if ('SELL' in formatted and formatted.get('SELL_RRR', 0) >= MIN_RR_THRESHOLD and SIDE_POLICY.is_enabled('NSE_CASH', Side.SHORT)):
                            formatted['TRADE_TYPE'] = 'SELL'
                            formatted['PREDICTION'] = "NA"
                            formatted['PROBABILITY'] = 0.0
                            res_ins_trade, trade_id = insert_trade_signals(formatted, 1, 8, job.time_frame)
                            if res_ins_trade:
                                formatted["trade_id"] = trade_id
                                check_and_insert_automated_alert(formatted, 8, 1, job.time_frame)
                                sells_generated += 1

                    except Exception as e:
                        record["status"] = "ERROR"
                        record["error"] = str(e)
                        failed += 1
                        logger.error(f"Error processing {symbol} {time_list}: {e}", exc_info=True, stack_info=True)

                    # Write one JSON per line (JSONL)
                    f.write(json.dumps(record, default=str))
                    f.write("\n")

        return {
            "run_id": run_id,
            "output_path": job.output_path,
            "total_jobs": total,
            "ok": ok,
            "failed": failed,
            "buys_generated": buys_generated,
            "sells_generated": sells_generated,
            "duration_seconds": round(time.time() - started, 2),
        }

    def revalidate_active_trades(self, job: ScanJob) -> Dict[str, Any]:
        """
        v3.8.9: Revalidate all active trades against current market conditions.
        
        For each active trade, re-run process_setup with current data.
        If the setup no longer produces a valid trade at the stored entry,
        deactivate the stale trade.
        
        Call this periodically (e.g., every scan cycle) BEFORE generating
        new trades, to clean up stale entries.
        """
        started = time.time()
        active_trades = get_active_trades_by_timeframe(job.time_frame)
        total = len(active_trades)
        deactivated = 0
        still_valid = 0
        errors = 0

        for trade in active_trades:
            try:
                symbol = trade.stock_name
                # Re-run the engine with current data
                for time_list in job.time_lists:
                    raw = process_setup(symbol, time_list, job.last_d_time)
                    if isinstance(raw, str):
                        # Engine error — deactivate to be safe
                        deactivate_trade(trade.id)
                        deactivated += 1
                        logger.warning(f"Deactivated trade {trade.id} ({symbol}): engine error on revalidation")
                        break

                    formatted = format_calculate_setup_response(
                        raw,
                        stock_name=symbol,
                        time_fr=job.time_frame,
                        last_d_time=job.last_d_time,
                        is_cash=True
                    )

                    trade_type = trade.trade_type  # 'BUY' or 'SELL'
                    is_valid = False

                    if trade_type == 'BUY' and 'BUY' in formatted:
                        if formatted.get('BUY_RRR', 0) >= MIN_RR_THRESHOLD:
                            is_valid = True
                    elif trade_type == 'SELL' and 'SELL' in formatted:
                        if formatted.get('SELL_RRR', 0) >= MIN_RR_THRESHOLD:
                            is_valid = True

                    if is_valid:
                        still_valid += 1
                    else:
                        deactivate_trade(trade.id)
                        deactivated += 1
                        logger.info(f"Deactivated stale trade {trade.id} ({symbol} {trade_type}): "
                                    f"conditions no longer valid")
                    break  # Only need to check once per trade

            except Exception as e:
                errors += 1
                logger.error(f"Error revalidating trade {trade.id} ({trade.stock_name}): {e}")

        return {
            "total_active": total,
            "still_valid": still_valid,
            "deactivated": deactivated,
            "errors": errors,
            "duration_seconds": round(time.time() - started, 2),
        }

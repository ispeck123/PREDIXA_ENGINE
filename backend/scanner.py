import json
import time
from dataclasses import dataclass, asdict
from datetime import datetime
from typing import List, Dict, Any, Optional
from shared.db.dbconn import DBConnection
from scripts.setup_engine_new import process_setup, format_calculate_setup_response
from scripts.side_enablement_policy import SIDE_POLICY, Side
from shared.db.db_model import Ind_StockMaster, TradeSignal

# ─────────────────────────────────────────────────────────────────────────────
# D-1 (A3 doctrine): CASH UNIVERSE GATE — institutional-participation precondition.
# SD zones require institutional flow; the cash scanner MUST be restricted to
# F&O-eligible / liquid names. Empirical basis (OI-4): liquid-universe cash BUY
# +0.83R vs junk-universe +0.015R (14x). Junk symbols produce zone-shaped retail noise.
#
# Two gating paths, in priority order:
#   (1) DB flag  : if Ind_StockMaster exposes an F&O/liquidity flag, use it (preferred).
#   (2) Allowlist: else fall back to CASH_FNO_ALLOWLIST (the validated liquid universe).
# The gate applies ONLY to the CASH segment (exchange_id == 8 / NSE cash). FUT & MCX are
# intrinsically F&O and are not gated here.
# ─────────────────────────────────────────────────────────────────────────────

# The F&O / liquid cash universe (Nifty-100 + validated liquid set). This is the SINGLE
# source of truth for cash eligibility until a DB flag is authoritative. Keep in sync with
# the exchange F&O list; review quarterly (F&O inclusions change).
CASH_FNO_ALLOWLIST = set()  # populated from config/DB at startup; empty => gate inactive (fail-open guarded below)

# Candidate DB attribute names for an F&O/liquidity flag (checked in order). If none exist
# on the model, the allowlist path is used.
_FNO_FLAG_ATTRS = ("is_fno", "is_fno_eligible", "fno_eligible", "is_derivative", "is_liquid")

CASH_EXCHANGE_ID = 8  # NSE cash segment (matches existing exchange_id==8 filters below)


def load_cash_fno_allowlist():
    """Populate CASH_FNO_ALLOWLIST from config file or DB. Called at startup.
    Kept explicit so the universe is auditable (SEBI traceability) and reviewable."""
    global CASH_FNO_ALLOWLIST
    try:
        # Preferred: a config-managed list (env / config table / file). Wire to your config source.
        from shared.config.settings import cash_fno_allowlist_config  # type: ignore
        CASH_FNO_ALLOWLIST = set(cash_fno_allowlist_config.symbols)
        logger.info(f"D-1 cash gate: allowlist loaded from config ({len(CASH_FNO_ALLOWLIST)} symbols)")
    except Exception:
        # If no config source is wired yet, leave empty and rely on the DB-flag path.
        # NOTE: an empty allowlist WITH no DB flag = gate cannot filter -> we FAIL CLOSED for
        # cash (return no symbols) rather than silently scanning the junk universe. See _apply_cash_fno_gate.
        logger.warning("D-1 cash gate: no allowlist config found; relying on DB flag or FAIL-CLOSED for cash.")


def _model_has_fno_flag():
    for attr in _FNO_FLAG_ATTRS:
        if hasattr(Ind_StockMaster, attr):
            return attr
    return None


def _apply_cash_fno_gate(symbols, is_cash_segment: bool):
    """Filter a symbol list to the F&O/liquid cash universe. No-op for non-cash segments."""
    if not is_cash_segment:
        return symbols  # FUT/MCX are intrinsically F&O; not gated here
    flag_attr = _model_has_fno_flag()
    if flag_attr is not None:
        # DB-flag path handled at query time (see get_* functions); here we trust the query.
        return symbols
    if CASH_FNO_ALLOWLIST:
        gated = [s for s in symbols if s in CASH_FNO_ALLOWLIST]
        logger.info(f"D-1 cash gate (allowlist): {len(gated)}/{len(symbols)} symbols pass F&O filter")
        return gated
    # No DB flag AND no allowlist -> FAIL CLOSED for cash (do not scan junk universe).
    logger.error("D-1 cash gate: no F&O flag and empty allowlist -> FAIL CLOSED (0 cash symbols). "
                 "Populate CASH_FNO_ALLOWLIST or add a DB F&O flag before running cash scans.")
    return []

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


def get_all_stock_syms(is_cash_segment: bool = False):
    db = dbc.get_session()
    res = db.query(Ind_StockMaster).filter(Ind_StockMaster.is_active == True).all()
    syms = [items.stock_tick for items in res]
    # D-1: apply cash F&O gate if this list feeds a cash scan.
    return _apply_cash_fno_gate(syms, is_cash_segment=is_cash_segment)


def get_available_stock_syms_by_timeframe(time_fr: int, is_cash_segment: bool = True):
    """D-1: cash-segment universe is gated to F&O-eligible/liquid names.
    is_cash_segment defaults True (this loader serves the NSE cash scan, exchange_id==8)."""
    db = dbc.get_session()

    try:
        q = (
            db.query(Ind_StockMaster.stock_tick)
            .filter(Ind_StockMaster.is_active == True)
            .filter(
                ~exists().where(
                    (TradeSignal.stock_name == Ind_StockMaster.stock_tick) &
                    (TradeSignal.time_fr == time_fr) &
                    (TradeSignal.is_active == True) &
                    (TradeSignal.exchange_id == CASH_EXCHANGE_ID)
                )
            )
        )

        # D-1 DB-flag path: if the model exposes an F&O/liquidity flag, filter in-query (cash only).
        if is_cash_segment:
            _flag = _model_has_fno_flag()
            if _flag is not None:
                q = q.filter(getattr(Ind_StockMaster, _flag) == True)

        res = q.all()
        syms = [item.stock_tick for item in res]

        # D-1 allowlist / fail-closed path (applies when no DB flag exists):
        syms = _apply_cash_fno_gate(syms, is_cash_segment=is_cash_segment)
        return syms

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


def get_resting_setups_by_timeframe(time_fr: int):
    """B-W-REVAL: fetch active setups that have NOT yet filled (resting/unfilled orders).
    These carry the ~15-day signal->fill staleness and MUST be re-validated for zone decay
    before being surfaced to the operator.

    NOTE (BE): this filters on the not-yet-triggered flag. Confirm the correct column name on
    TradeSignal — candidates: is_trade_started (0=resting), is_filled, entry_hit. Adjust the
    filter below to your schema. Defaults to is_trade_started == False if present.
    """
    db = dbc.get_session()
    try:
        q = (
            db.query(TradeSignal)
            .filter(TradeSignal.time_fr == time_fr)
            .filter(TradeSignal.is_active == True)
            .filter(TradeSignal.exchange_id == 8)
        )
        # resting = not yet filled; guard on schema availability
        if hasattr(TradeSignal, 'is_trade_started'):
            q = q.filter(TradeSignal.is_trade_started == False)
        elif hasattr(TradeSignal, 'is_filled'):
            q = q.filter(TradeSignal.is_filled == False)
        return q.all()
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


# ─────────────────────────────────────────────────────────────────────────────
# B-W-REVAL: explicit zone-decay checks (beyond RR-only revalidation).
# Empirical basis (OI-4): still-valid-at-fill zones win 43.9% vs decayed 34.2% (~10pp).
# The engine currently deactivates only on RR<min_rr; a structure-break that still leaves
# RR>=min_rr slips through. These checks make "zone decayed" an explicit deactivation trigger,
# and apply to RESTING/unfilled setups too (where the ~15-day staleness lives), not just filled.
# ─────────────────────────────────────────────────────────────────────────────

def _zone_decayed(formatted: dict, trade_type: str, stored_entry: float,
                  stored_stop: float, cmp: float) -> tuple:
    """Return (decayed: bool, reason: str|None). A stored setup is DECAYED if, on the fresh
    engine output, any of the following holds. Conservative: any True => deactivate/drop.

    (a) STRUCTURE BREAK — the zone's distal has been violated by current price (cmp beyond the
        stored stop on the wrong side). A broken base is not a valid zone regardless of RR.
    (b) DIRECTION LOST — the fresh setup no longer emits the same-side setup at all
        (opposing zone formed / regime flipped), even if some RR figure exists.
    (c) ENTRY DRIFT — the fresh setup's entry has moved materially away from the stored entry
        (>1 ATR-equivalent), i.e. the zone the order rests at is no longer the emitted zone.
    """
    side = trade_type
    # (a) structure break: for BUY, price closing/at below stored_stop invalidates the demand base;
    #     for SELL, price above stored_stop invalidates the supply base.
    if cmp is not None and stored_stop is not None:
        if side == 'BUY' and cmp <= stored_stop:
            return True, "STRUCTURE_BREAK (cmp<=stored_stop, demand base violated)"
        if side == 'SELL' and cmp >= stored_stop:
            return True, "STRUCTURE_BREAK (cmp>=stored_stop, supply base violated)"

    # (b) direction lost: fresh output has no same-side setup.
    has_side = (side == 'BUY' and 'BUY' in formatted) or (side == 'SELL' and 'SELL' in formatted)
    if not has_side:
        return True, "DIRECTION_LOST (no same-side setup on revalidation — opposing zone/regime shift)"

    # (c) entry drift: fresh entry moved away from where the order rests.
    fresh_entry = formatted.get('BUY_ENTRY') if side == 'BUY' else formatted.get('SELL_ENTRY')
    if fresh_entry is not None and stored_entry:
        # ATR-equivalent tolerance: use fresh stop distance as the scale.
        fresh_stop = formatted.get('BUY_SL') if side == 'BUY' else formatted.get('SELL_SL')
        scale = abs(fresh_entry - fresh_stop) if fresh_stop is not None else abs(stored_entry - stored_stop)
        if scale and abs(fresh_entry - stored_entry) > scale:
            return True, f"ENTRY_DRIFT (fresh entry moved >1 stop-unit from stored: {fresh_entry:.2f} vs {stored_entry:.2f})"

    return False, None


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
                        # D-2/D-3: cash SHORT is intraday-only. Even when SHORT is enabled, apply the
                        # intraday entry-guard (fast stacks only + entry cutoff). Square-off is enforced
                        # by the order/exit layer at SIDE_POLICY.cash_short_square_off_time().
                        _cash_short_ok = SIDE_POLICY.is_enabled('NSE_CASH', Side.SHORT)
                        if _cash_short_ok:
                            _stack = self._infer_execute_tf(time_list)
                            _now = datetime.now().strftime('%H:%M')
                            _ok, _reason = SIDE_POLICY.cash_short_intraday_ok(getattr(job, 'stack_name', None) or _stack, _now)
                            if not _ok:
                                _cash_short_ok = False
                                logger.info(f"D-2/D-3: cash SHORT suppressed for {symbol}: {_reason}")
                        if ('SELL' in formatted and formatted.get('SELL_RRR', 0) >= MIN_RR_THRESHOLD and _cash_short_ok):
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

                    # RR-still-valid check (existing behaviour)
                    if trade_type == 'BUY' and 'BUY' in formatted:
                        if formatted.get('BUY_RRR', 0) >= MIN_RR_THRESHOLD:
                            is_valid = True
                    elif trade_type == 'SELL' and 'SELL' in formatted:
                        if formatted.get('SELL_RRR', 0) >= MIN_RR_THRESHOLD:
                            is_valid = True

                    # B-W-REVAL: explicit zone-decay check (catches structure-break / direction-lost /
                    # entry-drift even when a RR figure still exists). Any decay => deactivate.
                    _cmp = formatted.get('CMP') or getattr(trade, 'cmp', None)
                    decayed, decay_reason = _zone_decayed(
                        formatted, trade_type,
                        stored_entry=getattr(trade, 'entry_price', None),
                        stored_stop=getattr(trade, 'stoploss_price', None),
                        cmp=_cmp,
                    )

                    if is_valid and not decayed:
                        still_valid += 1
                    else:
                        deactivate_trade(trade.id)
                        deactivated += 1
                        _why = decay_reason if decayed else "RR below threshold / no valid setup"
                        logger.info(f"Deactivated stale trade {trade.id} ({symbol} {trade_type}): {_why}")
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

    def revalidate_resting_setups(self, job: ScanJob) -> Dict[str, Any]:
        """
        B-W-REVAL: re-validate RESTING (unfilled) setups for zone decay before they are surfaced.

        This is the core of the staleness fix. A setup can rest for a median ~15 days waiting for
        price to return to the zone. In that window an opposing zone can form, the base can break,
        or RR can compress — the engine previously never re-checked resting setups, so it filled
        decayed zones (34% win) at the same rate as valid ones (44% win). This deactivates decayed
        resting setups so the available-trades surface only shows still-valid zones.

        Run every scan cycle. FE requires NO change — the surfaced list (get_auto_order_list) will
        simply no longer contain the deactivated setups.
        """
        started = time.time()
        resting = get_resting_setups_by_timeframe(job.time_frame)
        total = len(resting)
        deactivated = 0
        still_valid = 0
        errors = 0

        for setup in resting:
            try:
                symbol = setup.stock_name
                for time_list in job.time_lists:
                    raw = process_setup(symbol, time_list, job.last_d_time)
                    if isinstance(raw, str):
                        deactivate_trade(setup.id)
                        deactivated += 1
                        logger.warning(f"B-W-REVAL: deactivated resting setup {setup.id} ({symbol}): engine error")
                        break

                    formatted = format_calculate_setup_response(
                        raw, stock_name=symbol, time_fr=job.time_frame,
                        last_d_time=job.last_d_time, is_cash=True
                    )

                    trade_type = setup.trade_type
                    is_valid = False
                    if trade_type == 'BUY' and 'BUY' in formatted and formatted.get('BUY_RRR', 0) >= MIN_RR_THRESHOLD:
                        is_valid = True
                    elif trade_type == 'SELL' and 'SELL' in formatted and formatted.get('SELL_RRR', 0) >= MIN_RR_THRESHOLD:
                        is_valid = True

                    _cmp = formatted.get('CMP') or getattr(setup, 'cmp', None)
                    decayed, decay_reason = _zone_decayed(
                        formatted, trade_type,
                        stored_entry=getattr(setup, 'entry_price', None),
                        stored_stop=getattr(setup, 'stoploss_price', None),
                        cmp=_cmp,
                    )

                    if is_valid and not decayed:
                        still_valid += 1
                    else:
                        deactivate_trade(setup.id)
                        deactivated += 1
                        _why = decay_reason if decayed else "RR below threshold / no valid setup"
                        logger.info(f"B-W-REVAL: deactivated resting setup {setup.id} ({symbol} {trade_type}): {_why}")
                    break

            except Exception as e:
                errors += 1
                logger.error(f"B-W-REVAL: error revalidating resting setup {setup.id} ({setup.stock_name}): {e}")

        return {
            "total_resting": total,
            "still_valid": still_valid,
            "deactivated": deactivated,
            "errors": errors,
            "duration_seconds": round(time.time() - started, 2),
        }

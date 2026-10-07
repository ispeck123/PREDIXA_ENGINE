"""
PREDIXA — sizing bridge.

Single entry point that turns a formatted setup + its regime/TF context into an order quantity,
applying the OOS-validated regime x TF sizing weights. Wraps PositionSizer so the scanner needs
ONE line at the order-insert site.

Live-path usage (cash_wetrun_scanner.py, replacing the hardcoded qty at the insert call):
    from scripts.sizing_bridge import size_for_order
    qty = size_for_order(formatted, t_data, str(job.time_frame), "NSE_CASH")
    if qty is None:
        # regime x TF weight = 0 (net-negative / unmapped cell) -> do NOT place this order
        continue
    insert_order_and_oms_bucket(t_data, order_type, job.time_frame, formatted['STOCK_NAME'],
                                job.last_d_time, "india", 1, "NA", 0.0, formatted['trade_id'], qty)

WET-RUN OVERRIDE: while WETRUN_FIXED_QTY is True, permitted setups return qty=1 (keeps the 1-share
wet run intact) but EXCLUDED cells still return None (so we stop trading known net-negative cells
immediately — free benefit). Flip WETRUN_FIXED_QTY=False at real-capital go-live for full sizing.
"""
from typing import Optional, Dict, Any
from scripts.position_sizing import (
    PositionSizer, Setup, PortfolioPolicy, SegmentPolicy, REGIME_TF_SIZE_WEIGHT,
)
from shared.utils.logger import logger
from scripts.mcx_policy import mcx_weight

# ── wet-run switch ────────────────────────────────────────────────────────────
WETRUN_FIXED_QTY = True     # True: permitted cells -> qty 1 (wet run); exclusions still apply.
                            # False (go-live): full regime x TF sizing.

# ── portfolio / segment policy (load from config at go-live; defaults are wet-run-safe) ──
_PORTFOLIO = PortfolioPolicy(total_equity=1_000_000, max_open_risk_pct=5.0,
                             max_concurrent=10, per_sector_cap=3, reserve_pct=20.0)
_SEGMENTS = {
    "NSE_CASH": SegmentPolicy(enabled=True, risk_pct=1.0, max_concurrent=5,
                              exposure_cap=1_000_000, notional_cap=1_000_000, margin_pct=1.0),
    "NSEFO":    SegmentPolicy(enabled=True, risk_pct=1.0, max_concurrent=5,
                              exposure_cap=2_000_000, notional_cap=2_000_000, margin_pct=15.0),
}
_SIZER = PositionSizer(_PORTFOLIO, _SEGMENTS)


def size_for_mcx_proving(symbol: str, e_regime: str, a_regime: str,
                         strategy_tf: int, lot_size: int) -> Optional[int]:
    """Return exactly one contract lot for an eligible MCX proving setup.

    The provisional weight is an allow/deny signal only.  Keeping this helper
    separate from ``size_for_order`` prevents an accidental fractional or
    scaled MCX quantity before the tracking-error gate authorises scaling.
    """
    if mcx_weight(symbol, e_regime, a_regime, strategy_tf) <= 0:
        logger.info("MCX_SIZING_EXCLUDED e=%s,a=%s,tf=%s,sym=%s",
                    e_regime, a_regime, strategy_tf, symbol)
        return None
    try:
        quantity = int(lot_size)
    except (TypeError, ValueError):
        return None
    return quantity if quantity > 0 else None


def _normalize_tf(tf) -> str:
    """Normalize time_frame to a clean integer-string ('25'), robust to int / float / padded str.
    Guards against a VALID cell being wrongly excluded because tf arrived as 25.0 or ' 25 '."""
    try:
        return str(int(float(str(tf).strip())))   # 25 / '25' / 25.0 / '25.0' / ' 25 ' -> '25'
    except (ValueError, TypeError):
        return str(tf).strip()                     # non-numeric: use as-is (will miss -> suppress)


def _regime_key(formatted: Dict[str, Any], time_frame):
    """Extract (e_regime, a_regime, time_frame) from the formatted setup. Empty -> ('','',tf)."""
    e = str(formatted.get("e_regime", "") or "").strip().upper()
    a = str(formatted.get("a_regime", "") or "").strip().upper()
    return (e, a, _normalize_tf(time_frame))


def size_for_order(formatted: Dict[str, Any], t_data: Dict[str, Any],
                   time_frame: str, segment: str, lot_size: int = 1) -> Optional[int]:
    """
    Return order quantity, or None if the setup must be SUPPRESSED.

    None is returned when:
      - the (E,A,TF) cell is net-negative / unmapped (regime weight 0), OR
      - required price fields are missing / degenerate, OR
      - computed qty rounds to 0.
    A non-None return is a valid quantity to place.
    """
    e, a, tf = _regime_key(formatted, time_frame)

    # Fail-safe: if regime context is missing, the weight lookup will miss -> None (do not place blind).
    weight = REGIME_TF_SIZE_WEIGHT.get((e, a, tf), 0.0)
    if weight <= 0.0:
        logger.error("return None because weight <= 0.0")
        return None   # excluded cell (or missing regime) -> suppress

    # Map the REAL t_data keys (verified: entry_price / stop_loss / target_price).
    try:
        entry  = float(t_data["entry_price"])
        stop   = float(t_data["stop_loss"])
        target = float(t_data["target_price"])
    except (KeyError, TypeError, ValueError):
        logger.error("return None because of keyerror")
        return None   # can't size without valid levels

    setup_obj = Setup(
        symbol=str(formatted.get("STOCK_NAME", "")),
        segment=segment,
        entry=entry, stop=stop, target=target,
        zone_score=float(formatted.get("BUY_SCORE", t_data.get("overlap_ratio", 0.0)) or 0.0),
        rr=float(formatted.get("BUY_RRR", t_data.get("rr_ratio", 0.0)) or 0.0),
        sector=str(formatted.get("SECTOR", "") or ""),
        lot_size=max(1, lot_size),
        e_regime=e, a_regime=a, time_frame=tf,
    )

    pos = _SIZER.size(setup_obj)
    if pos is None:
        logger.error("return None because pos is None")
        return None   # sizer suppressed (weight 0, or qty floored to 0)

    if WETRUN_FIXED_QTY:
        # Wet run: keep 1-share/1-lot for permitted cells; exclusion already applied above.
        return lot_size if lot_size > 1 else 1

    return pos.qty

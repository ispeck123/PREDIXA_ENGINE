from typing import Any, Dict, Iterable, List, Optional, Tuple

# ---------- helpers ----------

def _zone_low_high(z: Any) -> Tuple[float, float]:
    """
    Accepts a zone as (low, high) or (high, low) tuple, or dict with keys 'low'/'high'.
    Returns (low, high).
    """
    if z is None:
        raise ValueError("zone is None")
    if isinstance(z, dict):
        lo, hi = float(z["low"]), float(z["high"])
    else:
        a, b = z
        lo, hi = float(min(a, b)), float(max(a, b))
    return lo, hi

def _sorted_zones(dz: Iterable[Any], sz: Iterable[Any]) -> Tuple[List[Any], List[Any]]:
    """
    Demand (buy): higher lows first (reverse=True).
    Supply (sell): lower highs first (reverse=False).
    """
    def lo(z): return _zone_low_high(z)[0]
    def hi(z): return _zone_low_high(z)[1]
    return (
        sorted(dz or [], key=lo, reverse=True),   # demand
        sorted(sz or [], key=hi, reverse=False),  # supply
    )

def _nearest_bounds(dz: Iterable[Any], sz: Iterable[Any], price: float, is_exe: bool) -> Tuple[Optional[float], Optional[float]]:
    """
    Pick nearest demand low (zone just below CMP if possible) and nearest supply high
    (zone just above CMP if possible). Falls back to closest if none on the preferred side.
    """
    dz_sorted, sz_sorted = _sorted_zones(dz, sz)
    # print("dz_sorted", dz_sorted)
    # print("sz_sorted", sz_sorted)
    # Demand: prefer zone entirely below CMP (hi <= price), else closest by ordering
    if is_exe:
        buy_low = None
        for z in dz_sorted:
            lo, hi = _zone_low_high(z)
            if hi <= price:
                buy_low = lo
                break
        if buy_low is None and dz_sorted:
            buy_low = _zone_low_high(dz_sorted[0])[0]

        # Supply: prefer zone entirely above CMP (lo >= price), else closest by ordering
        sell_high = None
        for z in sz_sorted:
            lo, hi = _zone_low_high(z)
            if lo >= price:
                sell_high = hi
                break
        if sell_high is None and sz_sorted:
            sell_high = _zone_low_high(sz_sorted[0])[1]

        return buy_low, sell_high
    else:
        buy_low = None
        sell_high = None
        if dz_sorted:
            buy_low, _ = _zone_low_high(dz_sorted[0])
        if sz_sorted:
            _, sell_high = _zone_low_high(sz_sorted[0])
        return buy_low, sell_high

def _classify_on_curve(buy_low: float, sell_high: float, price: float) -> Tuple[str, float]:
    """
    Returns (label, pct) with label in {"BUY","BOTH","SELL"} and pct in [0,100].
    """
    rng = sell_high - buy_low
    if rng <= 0:
        return "BOTH", 50.0

    pct = max(0.0, min(100.0, (price - buy_low) / rng * 100.0))
    if pct < 33.3:
        return "BUY", pct
    elif pct <= 66.6:
        return "BOTH", pct
    else:
        return "SELL", pct

def _tf_position(zones: Dict[str, Any], price: float, is_exe: bool) -> Dict[str, Any]:
    """
    zones: {"dz": [...], "sz": [...]}
    """
    buy_low, sell_high = _nearest_bounds(zones.get("dz"), zones.get("sz"), price, is_exe)
    if buy_low and sell_high is None and not(is_exe):
        return {"buy_low": buy_low, "sell_high": sell_high, "decision": "BUY", "pct": None}
    if sell_high and buy_low is None and not(is_exe):
        return {"buy_low": buy_low, "sell_high": sell_high, "decision": "SELL", "pct": None}
    
    if buy_low and sell_high is None and is_exe:
        return {"buy_low": buy_low, "sell_high": sell_high, "decision": "BUY", "pct": None}
    
    if sell_high and buy_low is None and is_exe:
        return {"buy_low": buy_low, "sell_high": sell_high, "decision": "SELL", "pct": None}

    if buy_low is None and sell_high is None:
        return {"buy_low": buy_low, "sell_high": sell_high, "decision": "UNKNOWN", "pct": None}
    decision, pct = _classify_on_curve(buy_low, sell_high, price)
    return {"buy_low": buy_low, "sell_high": sell_high, "decision": decision, "pct": pct}

# ---------- main API ----------

def check_price_across_timeframes(mtf_zones: Dict[str, Dict[str, Any]], last_candle_position: Dict[str, Dict[str, Any]], cur_price: float) -> Dict[str, Any]:
    """
    mtf_zones:
      {"evaluate": {"dz": [...], "sz": [...]},
       "analyze":  {"dz": [...], "sz": [...]},
       "execute":  {"dz": [...], "sz": [...]}}
    """
    out_eval = _tf_position(mtf_zones.get("evaluate", {}), cur_price, False)
    out_ana  = _tf_position(mtf_zones.get("analyze",  {}), cur_price, False)
    out_exe  = _tf_position(mtf_zones.get("execute",  {}), cur_price, True)

    eval_dec, ana_dec, exe_dec = out_eval["decision"], out_ana["decision"], out_exe["decision"]

    # Higher-TF precedence with safety rule: if any higher TF says SELL, never BUY.
    final: List[str] = []
    reason_parts: List[str] = []

    if eval_dec == "BOTH":
        eval_last_candle = last_candle_position.get("evaluate", {})
        c_low = eval_last_candle.get("low")
        c_high = eval_last_candle.get("high")
        eval_buy_zone = mtf_zones.get("evaluate", {}).get("dz")[0]
        eval_sell_zone = mtf_zones.get("evaluate", {}).get("sz")[0]
     
        buy_zone_lo, buy_zone_hi = _zone_low_high(eval_buy_zone)
        sell_zone_lo, sell_zone_hi = _zone_low_high(eval_sell_zone)

        in_buy_zone  = (c_high >= buy_zone_lo) and (c_low <= buy_zone_hi)
        in_sell_zone = (c_high >= sell_zone_lo) and (c_low <= sell_zone_hi)

        print("buy_zone_lo", buy_zone_lo, c_low)
        print("buy_zone_hi", buy_zone_hi, c_high)
        print("sell_zone_lo", sell_zone_lo, c_low)
        print("sell_zone_hi", sell_zone_hi, c_high)
        print("in_buy_zone", in_buy_zone)
        print("in_sell_zone", in_sell_zone)
        if in_buy_zone and in_sell_zone:
            eval_dec = "BOTH"
            out_eval["decision"] = "BOTH"
            # print("in_buy_zone", in_buy_zone)
            
        elif in_buy_zone:
            # print("in_buy_zone", in_buy_zone)
            eval_dec = "BUY"
            out_eval["decision"] = "BUY"
        elif in_sell_zone:
            # print("in_sell_zone", in_sell_zone)
            eval_dec = "SELL"
            out_eval["decision"] = "SELL"
        else:
            eval_dec = "BOTH"
            out_eval["decision"] = "BOTH"

        

    has_buy_higher  = ("BUY"  in {eval_dec, ana_dec}) or (eval_dec == "BOTH") or (ana_dec == "BOTH")
    has_sell_higher = ("SELL" in {eval_dec, ana_dec}) or (eval_dec == "BOTH") or (ana_dec == "BOTH")


    def add_reason(name, res):
        if res["decision"] == "UNKNOWN":
            reason_parts.append(f"{name} missing zones; skipped")
        elif res["decision"] == "BOTH":
            reason_parts.append(f"{name} FAIR ({res['pct']:.1f}%)")
        else:
            if res['pct'] is not None:
                reason_parts.append(f"{name} {res['decision']} at {res['pct']:.1f}%")
            else:
                reason_parts.append(f"{name} {res['decision']}")
    # Evaluate dominates if definitive
    add_reason("Evaluate", out_eval)
    if eval_dec in ("BUY", "SELL"):
        eval_bias = eval_dec
        # final = [eval_dec]
    else:
        eval_bias = None
    # else:
    # Analyze next
    add_reason("Analyze", out_ana)
    if ana_dec in ("BUY", "SELL"):
        ana_bias = ana_dec
    else:
        ana_bias = None
    # Execute last, but don't allow BUY if any higher TF said SELL
    add_reason("Execute", out_exe)
    if eval_dec == "SELL" and ("SELL" or "BOTH" in {ana_dec}):
        final = ["SELL"]
        reason_parts.append("Rule: higher TF SELL overrides evaluate BUY")

    elif eval_dec == "BUY" and ("BUY" or "BOTH" in {ana_dec}):
        final = ["BUY"]
        reason_parts.append("Rule: higher TF BUY overrides evaluate BUY")

    elif exe_dec == "BUY" and ("SELL" in {eval_dec, ana_dec}):
        final = ["SELL"]  # enforce rule: never buy against higher-TF SELL
        reason_parts.append("Rule: higher TF SELL overrides execute BUY")

    elif exe_dec in ("BUY", "SELL"):
        final = [exe_dec]

    elif any(d == "BOTH" for d in (eval_dec, ana_dec, exe_dec)):
        final = ["BUY", "SELL"]

    elif exe_dec == "BUY" and ("BUY" in {eval_dec, ana_dec}):
        final = ["BUY"]
    else:
        final = []

    # --- Fallbacks ---
    if not final:
        if not has_buy_higher and has_sell_higher:
            final = ["SELL"]
            reason_parts.append("Fallback: no BUY in higher TFs → SELL")
        elif not has_sell_higher and has_buy_higher:
            final = ["BUY"]
            reason_parts.append("Fallback: no SELL in higher TFs → BUY")
        elif not has_buy_higher and not has_sell_higher:
            if exe_dec in ("BUY", "SELL"):
                final = [exe_dec]
                reason_parts.append("Fallback: all neutral → follow Execute")

    return {
        "evaluate": out_eval,
        "analyze": out_ana,
        "execute": out_exe,
        "final_decision": final,
        "reason": " | ".join(reason_parts)
    }

# ---------- optional: single-TF API (unchanged behavior) ----------

def check_and_return_price_pos(sell_high: float, d_low: float, cur_price: float):
    if sell_high is None or d_low is None:
        return [], None
    if sell_high <= d_low:
        return ["BUY","SELL"], 50.0

    ranger_per = abs(sell_high - d_low) / 100.0
    diff = abs(cur_price - d_low) / ranger_per
    if 33.3 <= diff <= 66.6:
        return ['BUY', 'SELL'], diff
    elif diff < 33.3:
        return ['BUY'], diff
    else:
        return ['SELL'], diff
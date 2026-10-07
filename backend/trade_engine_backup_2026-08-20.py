

from __future__ import annotations
from ast import BitXor
from dataclasses import dataclass, field
from enum import Enum
from typing import List, Optional, Tuple, Dict, Literal, Set, Any
import pandas as pd
import numpy as np
from sympy.ntheory.continued_fraction import continued_fraction_iterator
# from scripts.additional_engine_class import ZoneNestingTier
from scripts.models import ZoneType, TF, CandleSeries, Config, VolatilityRegime, BoundaryMode, Zone, ViolationType, ZoneState, TrendContext, load_preprocess_data, ReversalPattern, ZonePattern

Side = Literal["BUY", "SELL"]

# ==============================================================================
# ENUMERATIONS
# ==============================================================================



# ==============================================================================
# CONFIGURATION
# ==============================================================================




# ==============================================================================
# INDICATORS
# ==============================================================================

def interval_overlaps(a_low: float, a_high: float, b_low: float, b_high: float) -> bool:
    """Generic interval intersection (touching counts as overlap)."""
    return max(a_low, b_low) <= min(a_high, b_high)

def zone_edges(z: Zone) -> Tuple[float, float]:
    """
    Extract (low_edge, high_edge) from your new schema.
    Supports:
      - object with .low_edge/.high_edge
      - dict with ["low_edge"], ["high_edge"]
      - dict with ["proximal"], ["distal"]
    """
    # if hasattr(z, "low_edge") and hasattr(z, "high_edge"):
    #     return float(z.low_edge), float(z.high_edge)

    # if isinstance(z, dict):
        # if "low_edge" in z and "high_edge" in z:
            # return float(z["low_edge"]), float(z["high_edge"])
        # if "proximal" in z and "distal" in z:
    if z:
        lo = min(float(z.low_edge), float(z.high_edge))
        hi = max(float(z.low_edge), float(z.high_edge))
        return lo, hi

    raise ValueError("Zone missing edges: expected low_edge/high_edge or proximal/distal.")

def zone_time(z: Zone) -> int:
    """
    Extract sort key. Prefers created_ts then created_idx.
    """
    if hasattr(z, "created_ts") and z.created_ts is not None:
        return int(z.created_ts)
    if hasattr(z, "created_idx") and z.created_idx is not None:
        return int(z.created_idx)
    if isinstance(z, dict):
        if z.get("created_ts") is not None:
            return int(z["created_ts"])
        if z.get("created_idx") is not None:
            return int(z["created_idx"])
    return 0

def filter_buy_sell_zones_v2(
    zones: List[Zone],
    *,
    is_execute: bool,
    cs: CandleSeries,
    for_frps: bool = True
) -> Dict[Side, List[Any]]:
    """
    Replicates your existing behavior:

    Execute TF:
      - keep all SELL zones
      - drop BUY zones that overlap ANY SELL zone

    Non-execute TF:
      - take only the most recent BUY and most recent SELL
      - if they overlap, drop the BUY and try to find the first non-overlapping BUY
        against the most recent SELL
      - SELL remains the most recent one (even if overlap)

    Returns: {"BUY": [...], "SELL": [...]}
    """
    buy_zones = []
    sell_zones = []
    for z in zones:
        if z.ztype in (ZoneType.BZ, ZoneType.GDZ):
            buy_zones.append(z)
        elif z.ztype in (ZoneType.SZ, ZoneType.GSZ):
            sell_zones.append(z)

    # buy = sorted(buy_zones or [], key=lambda z: zone_time(z), reverse=True)
    # sell = sorted(sell_zones or [], key=lambda z: zone_time(z), reverse=True)
    # For non-execute TF, select nearest by proximal distance:
    cmp = cs.cmp  # Current Market Price
    valid_bz = [z for z in buy_zones if z.distal < cmp]
    valid_sz = [z for z in sell_zones if z.distal > cmp]

    buy = valid_bz
    sell = valid_sz
    # ---- Execute TF behavior ----
    if is_execute:
        if not buy or not sell:
            return {"BUY": buy, "SELL": sell}

        # remove any BUY zone overlapping with ANY SELL zone
        filtered_buy = []
        for bz in buy:
            bz_lo, bz_hi = zone_edges(bz)
            overlaps = any(interval_overlaps(bz_lo, bz_hi, *zone_edges(sz)) for sz in sell)
            
            if not overlaps:
                filtered_buy.append(bz)
        sell = sorted(sell, key=lambda z: z.proximal) if valid_sz else []
        filtered_buy = sorted(filtered_buy, key=lambda z: z.proximal, reverse=True) if valid_bz else []

        return {"BUY": filtered_buy, "SELL": sell}

    # ---- Non-execute TF behavior ----
    if for_frps:
        # sell_top = sell[:1]
        # buy_top = buy[:1]
        nearest_bz = max(valid_bz, key=lambda z: z.proximal) if valid_bz else None
        nearest_sz = min(valid_sz, key=lambda z: z.proximal) if valid_sz else None
        buy_top = [nearest_bz] if nearest_bz else []
        sell_top = [nearest_sz] if nearest_sz else []
    else:
        sell_top = sorted(valid_sz, key=lambda z: z.proximal, reverse=True) if valid_sz else []
        buy_top = sorted(valid_bz, key=lambda z: z.proximal, reverse=True) if valid_bz else []

    if not sell_top or not buy_top:
        return {"BUY": buy_top, "SELL": sell_top}
    bz = buy_top[0]
    sz = sell_top[0]
    bz_lo, bz_hi = zone_edges(bz)
    sz_lo, sz_hi = zone_edges(sz)

    if interval_overlaps(bz_lo, bz_hi, sz_lo, sz_hi):
        # drop top buy and replace with first non-overlapping buy vs top sell
        bz = compute_ww_to_bw(bz, cs)
        bz_lo, bz_hi = zone_edges(bz)
        if interval_overlaps(bz_lo, bz_hi, sz_lo, sz_hi):
            replacement = []
            for cand in buy[1:]:
                c_lo, c_hi = zone_edges(cand)
                if not interval_overlaps(c_lo, c_hi, sz_lo, sz_hi):
                    replacement.append(cand)
                    
            buy_top = sorted(replacement, key=lambda z: z.proximal, reverse=True) if replacement else []

    return {"BUY": buy_top, "SELL": sell_top}


def atr(h: List[float], l: List[float], c: List[float], period: int) -> List[Optional[float]]:
    """ATR(14) - unchanged."""
    n = len(c)
    if n == 0:
        return []
    
    tr = [None] * n
    tr[0] = h[0] - l[0]
    for i in range(1, n):
        tr[i] = max(h[i] - l[i], abs(h[i] - c[i-1]), abs(l[i] - c[i-1]))
    
    result = [None] * n
    
    # ATR-GAP: Bootstrap for early candles (before standard ATR is available)
    # Index 0: no prior close, use candle range as fallback
    if n >= 1:
        result[0] = tr[0] if tr[0] and tr[0] > 0 else None
    # Indices 1 through min(period-1, n-1): progressive mean of available TRs
    for i in range(1, min(period, n)):
        valid_trs = [t for t in tr[1:i+1] if t is not None]
        if valid_trs:
            result[i] = sum(valid_trs) / len(valid_trs)
    
    # Standard ATR from index period onward (unchanged)
    if n >= period + 1:
        s = sum(tr[1:period+1])
        result[period] = s / period
        for i in range(period + 1, n):
            result[i] = (result[i-1] * (period - 1) + tr[i]) / period
    
    return result

def compute_ww_to_bw(z: Zone,  cs: CandleSeries):
    b0 = z.base_start
    b1 = z.base_end
    hs = cs.h[b0:b1 + 1]
    ls = cs.l[b0:b1 + 1]
    os_ = cs.o[b0:b1 + 1]
    cs_ = cs.c[b0:b1 + 1]

    if z.ztype in (ZoneType.BZ):
        low = min(ls)
        high = max(max(o, c) for o, c in zip(os_, cs_))
        z.proximal = high
        z.distal = low
        return z
    elif z.ztype in (ZoneType.SZ):
        low = max(hs)
        high = min(min(o, c) for o, c in zip(os_, cs_))
        z.proximal = low
        z.distal = high
        return z
    else:
        return z
    



def ema(values: List[float], period: int) -> List[Optional[float]]:
    """EMA for regime classification (v3.1)."""
    n = len(values)
    result: List[Optional[float]] = [None] * n
    if n < period:
        return result
    
    multiplier = 2 / (period + 1)
    result[period - 1] = sum(values[:period]) / period
    
    for i in range(period, n):
        result[i] = values[i] * multiplier + result[i-1] * (1 - multiplier)
    
    return result


def body_pct(o: float, h: float, l: float, c: float) -> float:
    rng = h - l
    if rng == 0:
        return 0.0
    return abs(c - o) / rng


def volatility_regime(atr_now: float, atr_ema20: float, cfg: Config) -> VolatilityRegime:
    """Uses EMA(20) for regime classification (v3.1)."""
    if atr_ema20 <= 0:
        return VolatilityRegime.NORMAL
    ratio = atr_now / atr_ema20
    if ratio <= cfg.vol_low_thresh:
        return VolatilityRegime.LOW
    if ratio >= cfg.vol_high_thresh:
        return VolatilityRegime.HIGH
    return VolatilityRegime.NORMAL


def last_pivot_high_idx(h: List[float], end_idx: int, lookback: int) -> Optional[int]:
    for i in range(end_idx, lookback - 1, -1):
        if i + lookback >= len(h):
            continue
        is_pivot = True
        for j in range(i - lookback, i + lookback + 1):
            if j != i and 0 <= j < len(h) and h[j] >= h[i]:
                is_pivot = False
                break
        if is_pivot:
            return i
    return None


def last_pivot_low_idx(l: List[float], end_idx: int, lookback: int) -> Optional[int]:
    for i in range(end_idx, lookback - 1, -1):
        if i + lookback >= len(l):
            continue
        is_pivot = True
        for j in range(i - lookback, i + lookback + 1):
            if j != i and 0 <= j < len(l) and l[j] <= l[i]:
                is_pivot = False
                break
        if is_pivot:
            return i
    return None


# ==============================================================================
# ZONE DETECTOR
# ==============================================================================

# class ZoneDetector:
#     def __init__(self, cfg: Config):
#         self.cfg = cfg
    
#     def _is_basing(self, cs: CandleSeries, i: int) -> bool:
#         rng = cs.h[i] - cs.l[i]
#         if rng == 0:
#             return True
#         return abs(cs.o[i] - cs.c[i]) <= self.cfg.basing_body_frac * rng
    
#     def _run_len(self, flags: List[bool], start: int) -> int:
#         j = start
#         while j < len(flags) and flags[j]:
#             j += 1
#         return j - start
    
#     def _single_base_ok(self, cs: CandleSeries, base_idx: int) -> bool:
#         if base_idx + 1 >= cs.n:
#             return False
#         base_range = cs.h[base_idx] - cs.l[base_idx]
#         nonbasing = 0
#         for j in range(base_idx + 1, min(base_idx + 4, cs.n)):
#             if self._is_basing(cs, j):
#                 break
#             nonbasing += 1
#         if nonbasing >= self.cfg.single_base_nonbasing_needed:
#             return True
#         if nonbasing == 1:
#             return (cs.h[base_idx + 1] - cs.l[base_idx + 1]) >= self.cfg.single_base_range_mult * base_range
#         return False
    
#     def _departure_direction(self, cs: CandleSeries, b0: int, b1: int) -> Optional[str]:
#         look_end = min(b1 + 3, cs.n - 1)
#         if b1 + 1 > look_end:
#             return None
#         base_high = max(cs.h[b0:b1 + 1])
#         base_low = min(cs.l[b0:b1 + 1])
#         max_c = max(cs.c[b1 + 1:look_end + 1])
#         min_c = min(cs.c[b1 + 1:look_end + 1])
#         if max_c > base_high:
#             return "UP"
#         if min_c < base_low:
#             return "DN"
#         return None
    
#     def _boundary_mode(self, tf: TF) -> BoundaryMode:
#         return {TF.E: self.cfg.boundary_E, TF.A: self.cfg.boundary_A, TF.X: self.cfg.boundary_X}[tf]
    
#     def _boundaries(self, cs: CandleSeries, tf: TF, ztype: ZoneType, b0: int, b1: int) -> Tuple[float, float]:
#         hs = cs.h[b0:b1 + 1]
#         ls = cs.l[b0:b1 + 1]
#         os_ = cs.o[b0:b1 + 1]
#         cs_ = cs.c[b0:b1 + 1]
#         mode = self._boundary_mode(tf)
        
#         if mode == BoundaryMode.WICK_TO_WICK:
#             if ztype in [ZoneType.BZ, ZoneType.GDZ]:
#                 return min(ls), max(hs)
#             return max(hs), min(ls)
#         else:
#             if ztype in [ZoneType.BZ, ZoneType.GDZ]:
#                 return min(ls), max(max(o, c) for o, c in zip(os_, cs_))
#             return max(hs), min(min(o, c) for o, c in zip(os_, cs_))
    
#     def detect(self, symbol: str, tf: TF, cs: CandleSeries) -> List[Zone]:
#         flags = [self._is_basing(cs, i) for i in range(cs.n)]
#         zones: List[Zone] = []
#         i = 0
        
#         while i < cs.n:
#             if not flags[i]:
#                 i += 1
#                 continue
#             run = self._run_len(flags, i)
#             b0, b1 = i, i + run - 1
            
#             if run >= self.cfg.badzone_base_len:
#                 i += run
#                 continue
#             if run == 1 and not self._single_base_ok(cs, b1):
#                 i += 1
#                 continue
            
#             dep_dir = self._departure_direction(cs, b0, b1)
#             if dep_dir is None:
#                 i += run
#                 continue
            
#             ztype = ZoneType.BZ if dep_dir == "UP" else ZoneType.SZ
#             distal, proximal = self._boundaries(cs, tf, ztype, b0, b1)
            
#             z = Zone(
#                 symbol=symbol, tf=tf, ztype=ztype,
#                 distal=distal, proximal=proximal,
#                 created_idx=b1,
#                 created_ts=cs.ts[b1] if cs.ts else None,
#                 base_start=b0, base_end=b1, base_len=run
#             )
            
#             if b1 + 1 < cs.n:
#                 z.departure_idx = b1 + 1
#                 z.body_pct = body_pct(cs.o[b1+1], cs.h[b1+1], cs.l[b1+1], cs.c[b1+1])
            
#             zones.append(z)
#             i += run
        
#         return zones

class ZoneDetector:
    def __init__(self, cfg: Config):
        self.cfg = cfg

    def _is_basing(self, cs: CandleSeries, i: int,
                atr_val: Optional[float] = None) -> bool:
        bp = body_pct(cs.o[i], cs.h[i], cs.l[i], cs.c[i])
        if bp > self.cfg.basing_body_pct:
            return False
        # BUG-42 (v3.8.6): Range/ATR guard. A candle with body% <= 50% but extreme
        # range (> basing_max_range_atr × ATR) is an explosive institutional candle
        # with wick rejection, NOT indecision. Its body (1030 pts on CRUDEOILM spike)
        # can exceed the ENTIRE range of all other basing candles. body_pct is
        # scale-blind — it preserves proportions while discarding magnitude.
        # When ATR unavailable, body%-only check preserved (no false rejection).
        if atr_val is not None and atr_val > 0:
            candle_range = cs.h[i] - cs.l[i]
            if candle_range > self.cfg.basing_max_range_atr * atr_val:
                return False
        return True


    def _is_bullish(self, o: float, c: float) -> bool:
        return c > o

    def _is_bearish(self, o: float, c: float) -> bool:
        return c < o

    def _run_len(self, flags: List[bool], start: int) -> int:
        j = start
        while j < len(flags) and flags[j]:
            j += 1
        return j - start

    def _run_len_with_bridge(self, flags: List[bool], start: int,
                              cs: CandleSeries, n_completed: int,
                              atr_vals: Optional[List[Optional[float]]] = None,
                              eff_max_base_len: Optional[int] = None
                              ) -> Tuple[int, int, Optional[int]]:
        """
        Problem A + D: Count basing run with bridge tolerance.
        
        Problem D (mid-base): If a non-basing candle is followed by a basing
        candle (basing resumes), bridge the gap if basing_count < max_base_len
        and the candle doesn't breach both sides (volatile event).
        
        BUG-42b (v3.8.6): Extreme candles (range > basing_max_range_atr × ATR)
        are blocked from bridging even if expansion is one-sided. Without this,
        BUG-42 fix is nullified — spike re-absorbed into base via bridge.
        
        Returns: (total_run, basing_count, bridge_idx or None)
        """
        run = 0
        basing_count = 0
        bridge_used = False
        bridge_idx = None
        _max_bl = eff_max_base_len if eff_max_base_len is not None else self.cfg.max_base_len
        
        i = start
        while i < n_completed:
            if flags[i]:
                # Basing candle — extend
                run += 1
                basing_count += 1
                if basing_count > _max_bl:
                    # Exceeded max basing candles — stop and back out
                    run -= 1
                    basing_count -= 1
                    break
                i += 1
            elif (not bridge_used
                  and run > 0
                  and i + 1 < n_completed
                  and flags[i + 1]
                  and basing_count < _max_bl):
                # Non-basing candle with basing AFTER — candidate bridge
                # BUG-40: Do not bridge through incomplete candles
                inc = cs.is_incomplete
                if inc and i < len(inc) and inc[i]:
                    break  # Incomplete candle — stop, don't bridge
                # BUG-42b (v3.8.6): Extreme range guard — do not bridge
                # candles with range > basing_max_range_atr × ATR.
                # These are explosive institutional candles whose H/L would
                # bloat the base beyond P1/P2 recoverability. Same threshold
                # as BUG-42 _is_basing guard for internal consistency.
                if atr_vals and i < len(atr_vals) and atr_vals[i] is not None:
                    candle_range = cs.h[i] - cs.l[i]
                    if candle_range > self.cfg.basing_max_range_atr * atr_vals[i]:
                        break  # Extreme range candle — not bridgeable
                # Guard: must not be volatile both-sided expansion
                base_low = min(cs.l[start:i])
                base_high = max(cs.h[start:i])
                makes_new_low = cs.l[i] < base_low
                makes_new_high = cs.h[i] > base_high
                
                if makes_new_low and makes_new_high:
                    break  # Both-sided = volatile, stop
                
                # v3.8.9 Fix #102: Structural shift guard — reject bridge if
                # bridge candle's CLOSE falls OUTSIDE pre-bridge base H-L range.
                # A crash/rally that pushes price to a structurally different
                # level is NOT a consolidation bridge.
                # Example: CRUDEOILM idx 197 (C=9705 < base LOW=9733) rejected.
                if cs.c[i] < base_low or cs.c[i] > base_high:
                    break  # Structural shift — not bridgeable
                                
                # Bridge the gap (does NOT increment basing_count)
                bridge_used = True
                bridge_idx = i
                run += 1
                i += 1
            else:
                break
        
        return run, basing_count, bridge_idx

    # def _compute_structure_extremes(self, cs: CandleSeries, b0: int, b1: int,
    #                                  ztype: ZoneType) -> Tuple[Optional[float], Optional[int]]:
    #     """
    #     BUG-32: Find structure_low (BZ) or structure_high (SZ) by scanning
    #     backward from base to nearest swing point.
    #     AUD-02/09: Uses existing last_pivot_high_idx / last_pivot_low_idx.
    #     AUD-03: Uses cfg.swing_lookback (shared with D1).
        
    #     Returns: (structure_extreme, swing_point_idx) or (None, None)
    #     """
    #     lookback = self.cfg.swing_lookback
        
    #     if ztype == ZoneType.BZ:
    #         pivot = last_pivot_high_idx(cs.h, b0 - 1, lookback)
    #         scan_start = pivot if pivot is not None else max(0, b0 - lookback)
    #         scan_start = max(0, scan_start)
    #         structure_low = float(min(cs.l[scan_start:b1 + 1]))
    #         return structure_low, scan_start
    #     elif ztype == ZoneType.SZ:
    #         pivot = last_pivot_low_idx(cs.l, b0 - 1, lookback)
    #         scan_start = pivot if pivot is not None else max(0, b0 - lookback)
    #         scan_start = max(0, scan_start)
    #         structure_high = float(max(cs.h[scan_start:b1 + 1]))
    #         return structure_high, scan_start
    #     return None, None

    def _compute_structure_extremes(self, cs: CandleSeries, b0: int, b1: int,
                                     ztype: ZoneType,
                                     atr_val: float = 0.0,
                                     atr_vals: Optional[List[Optional[float]]] = None
                                     ) -> Tuple[Optional[float], Optional[int]]:
        """
        BUG-32: Find structure_low (BZ) or structure_high (SZ) by scanning
        backward from base to nearest swing point.
        AUD-02/09: Uses existing last_pivot_high_idx / last_pivot_low_idx.
        AUD-03: Uses cfg.swing_lookback (shared with D1).
        BUG-39: Caps extension at max_structure_extension_atr × ATR from base distal.
        
        STRUCT-EXT-GHOST (v3.8.5): Compare-and-pick-tighter filter.
        Extreme candles (range > basing_max_range_atr × ATR) in the scan
        window can pull distal to ghost-wick levels that were never
        retested. V3 computes distal both ways (with and without extreme
        candles), then picks whichever is TIGHTER (closer to base).
        For SZ: min(standard, alt). For BZ: max(standard, alt).
        This is safe by construction — output can only equal or tighten
        the current distal, never widen it. Verified across 61 ghost-
        polluted zones (18 instruments): 16 improved, 0 worsened.
        
        Returns: (structure_extreme, swing_point_idx) or (None, None)
        """
        lookback = self.cfg.swing_lookback
        
        if ztype == ZoneType.BZ:
            pivot = last_pivot_high_idx(cs.h, b0 - 1, lookback)
            scan_start = pivot if pivot is not None else max(0, b0 - lookback)
            scan_start = max(0, scan_start)
            structure_low = float(min(cs.l[scan_start:b1 + 1]))
            # BUG-39: Cap extension
            base_distal = float(min(cs.l[b0:b1 + 1]))
            if atr_val > 0:
                max_ext = self.cfg.max_structure_extension_atr * atr_val
                if base_distal - structure_low > max_ext:
                    return None, None  # Extension exceeds cap — don't extend
            # STRUCT-EXT-GHOST V3: Recompute excluding extreme candles,
            # pick tighter (higher) of the two.
            if atr_vals is not None:
                non_ghost_lows = []
                for i in range(scan_start, b1 + 1):
                    ai = atr_vals[i] if i < len(atr_vals) else None
                    rng = cs.h[i] - cs.l[i]
                    if ai and ai > 0 and rng > self.cfg.basing_max_range_atr * ai:
                        continue  # Skip extreme candle
                    non_ghost_lows.append(cs.l[i])
                if non_ghost_lows:
                    alt_structure_low = float(min(non_ghost_lows))
                    structure_low = max(structure_low, alt_structure_low)
            return structure_low, scan_start
        elif ztype == ZoneType.SZ:
            pivot = last_pivot_low_idx(cs.l, b0 - 1, lookback)
            scan_start = pivot if pivot is not None else max(0, b0 - lookback)
            scan_start = max(0, scan_start)
            structure_high = float(max(cs.h[scan_start:b1 + 1]))
            # BUG-39: Cap extension
            base_distal = float(max(cs.h[b0:b1 + 1]))
            if atr_val > 0:
                max_ext = self.cfg.max_structure_extension_atr * atr_val
                if structure_high - base_distal > max_ext:
                    return None, None  # Extension exceeds cap — don't extend
            # STRUCT-EXT-GHOST V3: Recompute excluding extreme candles,
            # pick tighter (lower) of the two.
            if atr_vals is not None:
                non_ghost_highs = []
                for i in range(scan_start, b1 + 1):
                    ai = atr_vals[i] if i < len(atr_vals) else None
                    rng = cs.h[i] - cs.l[i]
                    if ai and ai > 0 and rng > self.cfg.basing_max_range_atr * ai:
                        continue  # Skip extreme candle
                    non_ghost_highs.append(cs.h[i])
                if non_ghost_highs:
                    alt_structure_high = float(max(non_ghost_highs))
                    structure_high = min(structure_high, alt_structure_high)
            return structure_high, scan_start
        return None, None

    def _find_legin_start(self, cs: CandleSeries, b0: int) -> Optional[int]:
        """
        BUG-32: Find first non-basing candle immediately preceding base.
        Scans backward from b0-1; stops at first basing candle or data boundary.
        """
        idx = b0 - 1
        legin_start = None
        while idx >= 0:
            if self._is_basing(cs, idx):
                break  # Hit a basing candle — legin doesn't extend past this
            legin_start = idx
            idx -= 1
        return legin_start
    

    def _is_swing_zone(self, cs: CandleSeries, b0: int, b1: int, ztype: ZoneType, lookback: int = 3, min_confirm: int = 2) -> bool:
        left_start = b0 - lookback
        right_end = b1 + lookback

        if left_start < 0 or right_end >= cs.n:
            return False

        base_low = float(min(cs.l[b0:b1 + 1]))
        base_high = float(max(cs.h[b0:b1 + 1]))

        left_lows = [float(x) for x in cs.l[left_start:b0]]
        right_lows = [float(x) for x in cs.l[b1 + 1:b1 + 1 + lookback]]

        left_highs = [float(x) for x in cs.h[left_start:b0]]
        right_highs = [float(x) for x in cs.h[b1 + 1:b1 + 1 + lookback]]

        # small tolerance to avoid equality/noise issues
        eps = getattr(self.cfg, "swing_eps", 0.0)

        if ztype == ZoneType.BZ:
            left_avg = sum(left_lows) / len(left_lows)
            right_avg = sum(right_lows) / len(right_lows)

            left_confirm = sum(1 for x in left_lows if x > base_low + eps)
            right_confirm = sum(1 for x in right_lows if x > base_low + eps)

            return (
                left_avg > base_low + eps
                and right_avg > base_low + eps
                and left_confirm >= min_confirm
                and right_confirm >= min_confirm
            )

        if ztype == ZoneType.SZ:
            left_avg = sum(left_highs) / len(left_highs)
            right_avg = sum(right_highs) / len(right_highs)

            left_confirm = sum(1 for x in left_highs if x < base_high - eps)
            right_confirm = sum(1 for x in right_highs if x < base_high - eps)

            return (
                left_avg < base_high - eps
                and right_avg < base_high - eps
                and left_confirm >= min_confirm
                and right_confirm >= min_confirm
            )

        return False


    
    def compute_zone_pattern_from_series(self, series: CandleSeries, zside: ZoneType, base_start: int, base_end: int, departure_idx: int | None = None) -> str:
        if base_start is None or base_end is None:
            raise ValueError("base_start and base_end must be defined")
        leg_in_idx = base_start - 1
        leg_out_idx = departure_idx

        if leg_in_idx < 0:
            return None
            # raise ValueError("leg-in index < 0 (base_start too early)")
        if leg_out_idx >= series.n:
            raise ValueError("leg-out index exceeds candle series length")

        o_in = series.o[leg_in_idx]
        c_in = series.c[leg_in_idx]
        leg_in = "R" if c_in > o_in else "D"

        o_out = series.o[leg_out_idx]
        c_out = series.c[leg_out_idx]

        base_high = max(series.h[base_start : base_end+1])
        base_low = min(series.l[base_start : base_end+1])
        
        if c_out > base_high:
            leg_out = "R"
        elif c_out < base_low:
            leg_out = "D"
        else:
            leg_out = "R" if c_out > o_out else "D"


        pattern = f"{leg_in}B{leg_out}"

        if zside == ZoneType.BZ and pattern not in ("RBR", "DBR"):
            return None
            # raise ValueError(f"Invalid Buy Zone pattern: {pattern}")
        if zside == "SZ" and pattern not in ("RBD", "DBD"):
            return None
            # raise ValueError(f"Invalid Sell Zone pattern: {pattern}")

        return pattern

    def _collect_legout_immediate(self, cs: CandleSeries, b0: int, b1: int, max_legout: int = 10) -> List[int]:
        """
        Collect ONLY the immediate legout candles right after base.
        Stop if a basing candle appears (sequence break).
        """
        legouts: List[int] = []
        i = b1 + 1
        while i < cs.n and len(legouts) < max_legout:
            if self._is_basing(cs, i):
                break  # basing after base breaks the legout sequence
            legouts.append(i)
            i += 1
        return legouts

    def calculate_legout_inv(self, legout_list, cs: CandleSeries, base_low, base_high, is_DZ):
        for idx in legout_list:
            if is_DZ:
                if cs.l[idx] < base_low:
                    return True
            else:
                if cs.h[idx] > base_high:
                    return True
        return False

    
    def _validate_legout(self, cs: CandleSeries, b0: int, b1: int, direction: str,
                          atr_vals: Optional[List[Optional[float]]] = None,
                          tf: Optional[TF] = None) -> Tuple[bool, int, float]:
        """
        Validate legout candles per v3.4 REVISED rules.
        
        PRIMARY CONDITIONS (must ALL be true):
          P1 - Net displacement matches direction
          P2 - Impulsive departure (legout_range >= base_range)
          P3 - Structure removal (handled separately in qualification)
        
        CANDLE RULES (REVISED):
          C1 - At least ONE candle matching direction required in legout sequence
          C2 - ANY opposite-color candle (including first) valid ONLY IF:
               BUY: LOW > base HIGH AND CLOSE > base HIGH (no re-entry)
               SELL: HIGH < base LOW AND CLOSE < base LOW (no re-entry)
          C3 - If ALL legout candles are opposite color -> INVALID ZONE
        
        BUG-42c (v3.8.6): When legin candle (b0-1) is extreme (range > basing_max_range_atr
        × ATR), the P2 Exception 2.5-3.0x ratio check is SKIPPED. Standard P2
        (legout_range >= base_range) already gates impulse. The extreme legin is the
        impulse proof — departure just needs to confirm direction.
        
        Returns:
            (is_valid, valid_legout_count, legout_range)
        """
        dep_start = b1 + 1
        if dep_start >= cs.n_completed:  # LIVE CANDLE FIX: departure must be completed
            return False, 0, 0.0
        
        # Calculate base boundaries and range
        base_high = max(cs.h[b0:b1+1])
        base_low = min(cs.l[b0:b1+1])
        base_range = base_high - base_low
        first_base_open = cs.o[b0]
        
        # BUG-42c (v3.8.6): Determine if legin is extreme for P2 Exception bypass.
        legin_is_extreme = False
        if b0 > 0 and atr_vals is not None:
            legin_idx = b0 - 1
            legin_range = cs.h[legin_idx] - cs.l[legin_idx]
            legin_atr = atr_vals[legin_idx] if legin_idx < len(atr_vals) else None
            if legin_atr is not None and legin_atr > 0:
                legin_is_extreme = legin_range > self.cfg.basing_max_range_atr * legin_atr
        
        # Find all potential legout candles (non-basing candles after base)
        # LIVE CANDLE FIX: Only completed bars can be legout candles
        # v3.8.8: E/A TF uses 1-candle window. The departure candle IS the
        # legout proof on Monthly/Weekly. Multi-candle confirmation is X-TF
        # execution validation — on E/A, a single month/week crash or rally
        # completes the formation. Subsequent candles are post-formation
        # price action, not legout continuation.
        _max_legout = 1 if tf in (TF.E, TF.A) else 5
        legout_indices = []
        for i in range(dep_start, min(dep_start + _max_legout, cs.n_completed)):  # Max 5 (X) or 1 (E/A)
            bp = body_pct(cs.o[i], cs.h[i], cs.l[i], cs.c[i])
            if bp > self.cfg.basing_body_pct:  # Not a basing candle
                legout_indices.append(i)
            else:
                break  # Stop at first basing candle
        
        if not legout_indices:
            return False, 0, 0.0
        
        # v3.8.9: LEGOUT CLEARS BASE check.
        # The departure must EXIT the base range — not remain inside it.
        # SZ: legout LOW must be below base LOW (legout drops out of base)
        # BZ: legout HIGH must be above base HIGH (legout rallies out of base)
        # If the legout resides entirely within the base range, there is no
        # confirmed institutional commitment — price is still consolidating.
        if direction == "DN":
            _legout_low = min(cs.l[i] for i in legout_indices)
            if _legout_low >= base_low:
                # Check for gap-down clearing: next candle's HIGH < last legout LOW
                _next_idx = legout_indices[-1] + 1
                if _next_idx < cs.n_completed and cs.h[_next_idx] < cs.l[legout_indices[-1]]:
                    legout_indices.append(_next_idx)  # Gap candle is part of departure
                else:
                    return False, 0, 0.0  # Legout didn't clear base downward
        else:  # UP
            _legout_high = max(cs.h[i] for i in legout_indices)
            if _legout_high <= base_high:
                # Check for gap-up clearing: next candle's LOW > last legout HIGH
                _next_idx = legout_indices[-1] + 1
                if _next_idx < cs.n_completed and cs.l[_next_idx] > cs.h[legout_indices[-1]]:
                    legout_indices.append(_next_idx)  # Gap candle is part of departure
                else:
                    return False, 0, 0.0  # Legout didn't clear base upward
        
        # Calculate legout range (from base end to furthest legout point)
        last_legout_idx = legout_indices[-1]
        last_legout_close = cs.c[last_legout_idx]
        
        if direction == "UP":  # BUY SETUP
            # P1: Net Displacement UP
            if last_legout_close <= first_base_open:
                return False, 0, 0.0  # No net upward displacement
            
            # P2: Impulsive Departure (legout_range >= base_range)
            legout_high = max(cs.h[i] for i in legout_indices)
            legout_range = legout_high - base_low
            if legout_range < base_range:
                # BUG-P2-WICK: On higher TFs, individual basing candles can have
                # extreme wicks (rejection spikes) that inflate base_range beyond
                # any departure. Extend BUG-P2EX-ABS absolute bypass to standard
                # P2: if strongest legout candle range > 0.75×ATR, departure is
                # institutional regardless of base width. Same principle.
                _p2_std_bypass = False
                if atr_vals:
                    for _li in legout_indices:
                        _la = atr_vals[_li] if _li < len(atr_vals) and atr_vals[_li] else None
                        if _la and _la > 0 and (cs.h[_li] - cs.l[_li]) > 0.75 * _la:
                            _p2_std_bypass = True
                            break
                if not _p2_std_bypass:
                    return False, 0, 0.0  # Not impulsive enough
            
            # ================================================================
            # P2 EXCEPTION: Single-Base Impulse Validation (v3.5+)
            # Applicable: Cash & Futures ONLY | NOT MCX
            # BUG-42c (v3.8.6): SKIPPED when legin is extreme. Standard P2
            # already passed. Extreme legin = impulse proof; departure
            # confirms direction only. Relative ratio breaks in elevated
            # volatility (both ranges inflated → ratio ≈ 1.0).
            # ================================================================
            base_candle_count = b1 - b0 + 1
            legout_candle_count = len(legout_indices)
            
            if base_candle_count == 1 and not legin_is_extreme:
                # Calculate individual candle ranges (wick-to-wick)
                first_legout_idx = legout_indices[0]
                first_legout_range = cs.h[first_legout_idx] - cs.l[first_legout_idx]
                
                if legout_candle_count == 1:
                    # CASE 1: base=1, legout=1
                    ratio = first_legout_range / base_range if base_range > 0 else 0
                    _p2_atr = atr_vals[first_legout_idx] if (atr_vals and first_legout_idx < len(atr_vals) and atr_vals[first_legout_idx]) else None
                    _abs_ok = (_p2_atr and _p2_atr > 0 and first_legout_range > 0.75 * _p2_atr)
                    if not _abs_ok:
                        if ratio < 2.5:
                            return False, 0, 0.0  # Insufficient impulse for single-candle base
                        if ratio > 3.0:
                            return False, 0, 0.0  # Exponentially explosive - poor retest expectancy
                
                elif legout_candle_count >= 2 and first_legout_range > 3.0 * base_range:
                    # CASE 2: base=1, legout>=2, explosive first candle
                    subsequent_range = sum(
                        cs.h[legout_indices[i]] - cs.l[legout_indices[i]] 
                        for i in range(1, legout_candle_count)
                    )
                    if subsequent_range < 0.5 * first_legout_range:
                        return False, 0, 0.0  # Explosive first with weak follow-through
            
            # CASE 3: base>=2 → Standard P2 already passed above
            # ================================================================
            
            # CANDLE RULES (REVISED with C2e):
            # Validate each candle and track counts
            valid_count = 0
            has_bullish = False
            first_is_bearish = False
            c2e_applied = False
            
            for pos, idx in enumerate(legout_indices):
                candle_bullish = cs.c[idx] > cs.o[idx]
                if candle_bullish:
                    has_bullish = True
                    valid_count += 1
                else:
                    # Bearish candle in BUY legout
                    if pos == 0:
                        first_is_bearish = True
                    
                    # C2: Standard tolerance - LOW > base HIGH AND CLOSE > base HIGH
                    if cs.l[idx] > base_high and cs.c[idx] > base_high:
                        valid_count += 1
                    # C2e: First bearish exception - CLOSE > base HIGH required,
                    #       LOW may re-enter base, IF ≥2 subsequent bullish follow
                    elif pos == 0 and cs.c[idx] > base_high:
                        # Check if ≥2 subsequent bullish candles exist
                        remaining = legout_indices[1:]
                        bullish_after = sum(1 for ri in remaining if cs.c[ri] > cs.o[ri])
                        if bullish_after >= 2:
                            c2e_applied = True
                            valid_count += 1
                        else:
                            break  # Not enough bullish follow-through for exception
                    else:
                        break  # Truncate at this candle
            
            # C3: If ALL legout candles are bearish -> INVALID
            if not has_bullish:
                valid_set = legout_indices[:valid_count]
                has_bullish = any(cs.c[i] > cs.o[i] for i in valid_set)
                if not has_bullish:
                    return False, 0, 0.0  # No demonstrated demand imbalance
            
            # C1: At least one bullish candle required
            if not has_bullish:
                return False, 0, 0.0
            
            return True, valid_count, legout_range
        
        elif direction == "DN":  # SELL SETUP
            # P1: Net Displacement DOWN
            if last_legout_close >= first_base_open:
                return False, 0, 0.0  # No net downward displacement
            
            # P2: Impulsive Departure (legout_range >= base_range)
            legout_low = min(cs.l[i] for i in legout_indices)
            legout_range = base_high - legout_low
            if legout_range < base_range:
                # BUG-P2-WICK: Same absolute bypass as BUY direction.
                _p2_std_bypass = False
                if atr_vals:
                    for _li in legout_indices:
                        _la = atr_vals[_li] if _li < len(atr_vals) and atr_vals[_li] else None
                        if _la and _la > 0 and (cs.h[_li] - cs.l[_li]) > 0.75 * _la:
                            _p2_std_bypass = True
                            break
                if not _p2_std_bypass:
                    return False, 0, 0.0  # Not impulsive enough
            
            # ================================================================
            # P2 EXCEPTION: Single-Base Impulse Validation (v3.5+)
            # Applicable: Cash & Futures ONLY | NOT MCX
            # BUG-42c (v3.8.6): SKIPPED when legin is extreme. Standard P2
            # already passed. Extreme legin = impulse proof; departure
            # confirms direction only. Relative ratio breaks in elevated
            # volatility (both ranges inflated → ratio ≈ 1.0).
            # ================================================================
            base_candle_count = b1 - b0 + 1
            legout_candle_count = len(legout_indices)
            
            if base_candle_count == 1 and not legin_is_extreme:
                # Calculate individual candle ranges (wick-to-wick)
                first_legout_idx = legout_indices[0]
                first_legout_range = cs.h[first_legout_idx] - cs.l[first_legout_idx]
                
                if legout_candle_count == 1:
                    # CASE 1: base=1, legout=1
                    ratio = first_legout_range / base_range if base_range > 0 else 0
                    _p2_atr = atr_vals[first_legout_idx] if (atr_vals and first_legout_idx < len(atr_vals) and atr_vals[first_legout_idx]) else None
                    _abs_ok = (_p2_atr and _p2_atr > 0 and first_legout_range > 0.75 * _p2_atr)
                    if not _abs_ok:
                        if ratio < 2.5:
                            return False, 0, 0.0  # Insufficient impulse for single-candle base
                        if ratio > 3.0:
                            return False, 0, 0.0  # Exponentially explosive - poor retest expectancy
                
                elif legout_candle_count >= 2 and first_legout_range > 3.0 * base_range:
                    # CASE 2: base=1, legout>=2, explosive first candle
                    subsequent_range = sum(
                        cs.h[legout_indices[i]] - cs.l[legout_indices[i]] 
                        for i in range(1, legout_candle_count)
                    )
                    if subsequent_range < 0.5 * first_legout_range:
                        return False, 0, 0.0  # Explosive first with weak follow-through
            
            # CASE 3: base>=2 → Standard P2 already passed above
            # ================================================================
            
            # CANDLE RULES (REVISED with C2e):
            # Validate each candle and track counts
            valid_count = 0
            has_bearish = False
            first_is_bullish = False
            c2e_applied = False
            
            for pos, idx in enumerate(legout_indices):
                candle_bearish = cs.c[idx] < cs.o[idx]
                if candle_bearish:
                    has_bearish = True
                    valid_count += 1
                else:
                    # Bullish candle in SELL legout
                    if pos == 0:
                        first_is_bullish = True
                    
                    # C2: Standard tolerance - HIGH < base LOW AND CLOSE < base LOW
                    if cs.h[idx] < base_low and cs.c[idx] < base_low:
                        valid_count += 1
                    # C2e: First bullish exception - CLOSE < base LOW required,
                    #       HIGH may re-enter base, IF ≥2 subsequent bearish follow
                    elif pos == 0 and cs.c[idx] < base_low:
                        # Check if ≥2 subsequent bearish candles exist
                        remaining = legout_indices[1:]
                        bearish_after = sum(1 for ri in remaining if cs.c[ri] < cs.o[ri])
                        if bearish_after >= 2:
                            c2e_applied = True
                            valid_count += 1
                        else:
                            break  # Not enough bearish follow-through for exception
                    else:
                        break  # Truncate at this candle
            
            # C3: If ALL legout candles are bullish -> INVALID
            if not has_bearish:
                valid_set = legout_indices[:valid_count]
                has_bearish = any(cs.c[i] < cs.o[i] for i in valid_set)
                if not has_bearish:
                    return False, 0, 0.0  # No demonstrated supply imbalance
            
            # C1: At least one bearish candle required
            if not has_bearish:
                return False, 0, 0.0
            
            return True, valid_count, legout_range
        
        return False, 0, 0.0

    def _single_base_ok(self, cs: CandleSeries, base_idx: int,
                         atr_vals: Optional[List[Optional[float]]] = None) -> bool:
        """Option A/B/C validation for single-base zones.
        
        BUG-42c (v3.8.6): Added Option C for extreme legin. When the candle
        immediately before the base has range > basing_max_range_atr × ATR,
        Options A and B fail because relative comparisons are poisoned by the
        spike's extreme range (ghost wick). Option C switches to ATR-based
        absolute checks: base must be consolidation-sized (< 2.0×ATR) AND
        departure must be impulsive (> 1.0×ATR).
        """
        if base_idx == 0 or base_idx >= cs.n_completed - 1:  # LIVE CANDLE FIX
            return False
        prev_range = cs.h[base_idx - 1] - cs.l[base_idx - 1]
        base_range = cs.h[base_idx] - cs.l[base_idx]
        next_range = cs.h[base_idx + 1] - cs.l[base_idx + 1]
        
        # Option A: Base engulfs prior candle
        if cs.l[base_idx] <= cs.l[base_idx - 1] and cs.h[base_idx] >= cs.h[base_idx - 1]:
            return True
        # Option B: Tight consolidation
        if base_range < 0.5 * prev_range and next_range > prev_range:
            return True
        # Option D: V-shaped reversal — base is consolidation between
        # two impulse moves. Legin may be larger than legout (V-bottom
        # or V-top). Both prev AND next exceed base range, confirming
        # base is a pause between directional moves, not noise.
        # HDFC_LIFE MAR-23: prev=111(FEB-23 drop), base=47, next=54(APR-23 recovery).
        # Option B fails (54 < 111) but the base IS institutional.
        if prev_range > base_range and next_range > base_range:
            return True
        # Option C (BUG-42c v3.8.6): Extreme legin — ATR-based absolute checks.
        # When prev candle is extreme, relative comparisons break. The ghost wick
        # sets an impossible bar for Options A and B. Switch to absolute validation:
        # base is consolidation-sized AND departure is impulsive in ATR terms.
        if atr_vals is not None:
            atr_at_base = atr_vals[base_idx] if base_idx < len(atr_vals) else None
            atr_at_prev = atr_vals[base_idx - 1] if (base_idx - 1) < len(atr_vals) else None
            atr_val = atr_at_base or atr_at_prev
            if atr_val is not None and atr_val > 0:
                prev_is_extreme = prev_range > self.cfg.basing_max_range_atr * atr_val
                if prev_is_extreme:
                    if base_range < 2.0 * atr_val and next_range > 1.0 * atr_val:
                        return True
        # Option E (v3.8.7 FIX-M): Wide-wick basing candle with confirmed legout.
        # On higher TFs (weekly/monthly), institutional probing creates wide wicks
        # during consolidation. The base candle's BODY is small (< 35%) but the
        # RANGE is inflated by wicks, making it appear "wider" than the legin.
        # Options A/B/D compare RANGE and fail. Option E checks:
        #   1. Base body% < 35% (definitionally basing, not borderline)
        #   2. Legout range > 1.5× base range (confirmed impulsive departure)
        #   3. Legout confirms direction (bullish legout for BZ, bearish for SZ)
        base_body_pct = body_pct(cs.o[base_idx], cs.h[base_idx],
                                  cs.l[base_idx], cs.c[base_idx])
        if (base_body_pct < 0.35
                and next_range > 1.5 * base_range
                and base_idx + 1 < cs.n_completed):
            return True
        return False

    def _boundary_mode(self, tf: TF) -> BoundaryMode:
        return {TF.E: self.cfg.boundary_E, TF.A: self.cfg.boundary_A, TF.X: self.cfg.boundary_X}[tf]

    def _boundaries(self, cs: CandleSeries, tf: TF, ztype: ZoneType, b0: int, b1: int) -> Tuple[float, float]:
        hs = cs.h[b0:b1 + 1]
        ls = cs.l[b0:b1 + 1]
        os_ = cs.o[b0:b1 + 1]
        cs_ = cs.c[b0:b1 + 1]
        mode = self._boundary_mode(tf)

        if mode == BoundaryMode.WICK_TO_WICK:
            if ztype in (ZoneType.BZ, ZoneType.GDZ):
                return float(min(ls)), float(max(hs))
            return float(max(hs)), float(min(ls))
        else:  # BODY_TO_WICK
            if ztype in (ZoneType.BZ, ZoneType.GDZ):
                return float(min(ls)), float(max(max(o, c) for o, c in zip(os_, cs_)))
            return float(max(hs)), float(min(min(o, c) for o, c in zip(os_, cs_)))

    # def _departure_direction_first(self, cs: CandleSeries, tf : TF, b0: int, b1: int) -> Optional[str]:
    #     """Prefer the first candle after base to decide direction; fallback to next 2 bars."""
    #     base_high = max(cs.h[b0:b1 + 1])
    #     base_low = min(cs.l[b0:b1 + 1])
    #     setup_dir = None
    #     direction = None
    #     # base_range = abs(base_high - base_low)
    #     legouts = self._collect_legout_immediate(cs, b0, b1, max_legout=10)
    #     if not legouts:
    #         return None, []
    #     # first = legouts[0]
    #     # if cs.c[first] > base_high:
    #     #     setup_dir = "BUY"
    #     #     direction = "UP"
    #     # elif cs.c[first] < base_low:
    #     #     setup_dir = "SELL"
    #     #     direction = "DN"
    #     # else:
    #     #     # If first legout doesn't break the base, treat it as no valid departure
    #     #     return None, []
    #     for idx in legouts:
    #         if cs.c[idx] > base_high:
    #             # break_idx = idx
    #             setup_dir = "BUY"
    #             direction = "UP"
    #             break
    #         if cs.c[idx] < base_low:
    #             # break_idx = idx
    #             setup_dir = "SELL"
    #             direction = "DN"
    #             break

    #     accepted = self._validate_legouts(cs=cs, tf=tf, b0=b0, b1=b1, legouts=legouts, setup_dir=setup_dir)
    #     # print(base_high, base_low, tf, direction, legouts, accepted)
    #     if not accepted:
    #         return None, []
        

    #     return direction, accepted

    def _departure_direction(self, cs: CandleSeries, b0: int, b1: int) -> Optional[str]:
        dep_idx = b1 + 1
        if dep_idx >= cs.n_completed:  # LIVE CANDLE FIX: departure must be a completed bar
            return None
        zone_mid = (max(cs.h[b0:b1+1]) + min(cs.l[b0:b1+1])) / 2
        if cs.c[dep_idx] > zone_mid:
            return "UP"
        elif cs.c[dep_idx] < zone_mid:
            return "DN"
        return None

        # for dep_idx in range(b1 + 1, min(b1 + 10, cs.n)):  # check next up to 3 candles
        #     # skip if it's still basing
        #     if self._is_basing(cs, dep_idx):
        #         continue
        #     if cs.c[dep_idx] > (base_high): #+ base_range*0.01):
        #         return "UP"
        #     if cs.c[dep_idx] < (base_low): # - base_range*0.01):
        #         return "DN"
        #     # if non-basing but close is still inside, keep looking one more candle
        # return None
    # def detect(self, symbol: str, tf: TF, cs: CandleSeries) -> List[Zone]:
    #     out: List[Zone] = []
    #     n_completed = cs.n_completed  # LIVE CANDLE FIX
    #     flags = [self._is_basing(cs, i) for i in range(n_completed)]
    #     atr_vals = atr(cs.h, cs.l, cs.c, self.cfg.atr_period)

    #     i = 0
    #     while i < n_completed:
    #         if not flags[i]:
    #             i += 1
    #             continue
    #         run = self._run_len(flags, i)
    #         b0, b1 = i, i + run - 1
            
    #         if run == 0:
    #             i += 1
    #             continue
            
    #         if run == 1:
    #             if not self._single_base_ok(cs, b0):
    #                 i += 1
    #                 continue
    #         elif run > self.cfg.max_base_len:
    #             i += run
    #             continue
            
    #         direction = self._departure_direction(cs, b0, b1)
    #         if direction is None:
    #             i += run
    #             continue
            
    #         # v3.4 ENHANCED: Validate legout candles with PRIMARY CONDITIONS
    #         legout_valid, legout_count, legout_range = self._validate_legout(cs, b0, b1, direction)
    #         if not legout_valid:
    #             i += run
    #             continue  # DISCARD pattern - legout validation failed (P1/P2/C1/C2)
            
    #         # ── BUG-31: Recompute legout_indices for hard discard + cleanness ─
    #         dep_start_31 = b1 + 1
    #         legout_indices = []
    #         for li in range(dep_start_31, min(dep_start_31 + 5, n_completed)):
    #             bp31 = body_pct(cs.o[li], cs.h[li], cs.l[li], cs.c[li])
    #             if bp31 > self.cfg.basing_body_pct:
    #                 legout_indices.append(li)
    #             else:
    #                 break
            
    #         # ── BUG-31 Part A: Hard discard if legout breaches base floor ─
    #         base_low = float(min(cs.l[b0:b1 + 1]))
    #         base_high = float(max(cs.h[b0:b1 + 1]))
    #         legout_hard_discard = False
    #         for lo_idx in legout_indices:
    #             if direction == "UP" and float(cs.l[lo_idx]) < base_low:
    #                 legout_hard_discard = True
    #                 break
    #             if direction == "DN" and float(cs.h[lo_idx]) > base_high:
    #                 legout_hard_discard = True
    #                 break
    #         if legout_hard_discard:
    #             i += run
    #             continue  # BUG-31: Legout breached base floor — discard
            
    #         # ── BUG-31 Part B: Compute legout_cleanness (0.0 to 1.0) ────
    #         zone_height_for_clean = abs(base_high - base_low)
    #         if zone_height_for_clean == 0:
    #             zone_height_for_clean = 1.0
    #         worst_depth_pct = 0.0
    #         for lo_idx in legout_indices:
    #             if direction == "UP" and cs.c[lo_idx] < cs.o[lo_idx]:  # bearish in BUY
    #                 re_entry = max(0.0, base_high - float(cs.l[lo_idx]))
    #                 depth_pct = re_entry / zone_height_for_clean
    #                 worst_depth_pct = max(worst_depth_pct, depth_pct)
    #             elif direction == "DN" and cs.c[lo_idx] > cs.o[lo_idx]:  # bullish in SELL
    #                 re_entry = max(0.0, float(cs.h[lo_idx]) - base_low)
    #                 depth_pct = re_entry / zone_height_for_clean
    #                 worst_depth_pct = max(worst_depth_pct, depth_pct)
            
    #         if worst_depth_pct == 0:        legout_cleanness = 1.00
    #         elif worst_depth_pct <= self.cfg.cleanness_band_1: legout_cleanness = 0.85
    #         elif worst_depth_pct <= self.cfg.cleanness_band_2: legout_cleanness = 0.60
    #         elif worst_depth_pct <= self.cfg.cleanness_band_3: legout_cleanness = 0.35
    #         elif worst_depth_pct <= self.cfg.cleanness_band_4: legout_cleanness = 0.15
    #         else:                           legout_cleanness = 0.05
            
    #         ztype = ZoneType.BZ if direction == "UP" else ZoneType.SZ
    #         distal, proximal = self._boundaries(cs, tf, ztype, b0, b1)
            
    #         # BUG-37: Store pre-BUG-32 base-only distal (order area boundary)
    #         distal_base = distal
            
    #         # ── BUG-32: Extend distal to structure extreme ──────────
    #         # CRITICAL: Only for standard BZ/SZ. GDZ/GSZ retain gap boundaries.
    #         structure_extreme, structure_start = None, None
    #         legin_start = None
    #         if ztype in (ZoneType.BZ, ZoneType.SZ):
    #             structure_extreme, structure_start = self._compute_structure_extremes(cs, b0, b1, ztype)
    #             if structure_extreme is not None:
    #                 if ztype == ZoneType.BZ:
    #                     distal = min(distal, structure_extreme)
    #                 elif ztype == ZoneType.SZ:
    #                     distal = max(distal, structure_extreme)
    #             legin_start = self._find_legin_start(cs, b0)
            
    #         # ── Q5: Detect internal gaps within base ────────────────
    #         internal_gaps = []
    #         for j in range(b0, b1):
    #             if cs.l[j+1] > cs.h[j]:   # gap up within base
    #                 internal_gaps.append((float(cs.h[j]), float(cs.l[j+1]), "UP"))
    #             elif cs.h[j+1] < cs.l[j]: # gap down within base
    #                 internal_gaps.append((float(cs.l[j]), float(cs.h[j+1]), "DOWN"))
            
    #         dep_idx = b1 + 1
    #         av = atr_vals[dep_idx] if dep_idx < len(atr_vals) and atr_vals[dep_idx] else 1.0
    #         dep_range = (cs.h[dep_idx] - cs.l[dep_idx]) / av if dep_idx < n_completed else 0
    #         dep_body = body_pct(cs.o[dep_idx], cs.h[dep_idx], cs.l[dep_idx], cs.c[dep_idx]) if dep_idx < n_completed else 0
            
    #         zone = Zone(
    #             symbol=symbol, tf=tf, ztype=ztype,
    #             distal=distal, proximal=proximal,
    #             distal_base=distal_base,  # BUG-37: pre-extension base-only distal
    #             created_idx=b1, base_start=b0, base_end=b1, base_len=run,
    #             departure_idx=dep_idx, departure_atr=dep_range, body_pct=dep_body,
    #             legout_count=legout_count,  # v3.4: Track valid legout candles
    #             legout_range=legout_range,  # v3.4 ENHANCED: Track legout range
    #             # v3.8.4 fields
    #             structure_low=structure_extreme if ztype == ZoneType.BZ else None,
    #             structure_high=structure_extreme if ztype == ZoneType.SZ else None,
    #             structure_start_idx=structure_start,
    #             legin_start_idx=legin_start,
    #             legout_cleanness=legout_cleanness,
    #             has_internal_gap=len(internal_gaps) > 0,
    #             internal_gap_levels=internal_gaps,
    #         )
    #         out.append(zone)
    #         i += run
        
    #     return out



    def detect(self, symbol: str, tf: TF, cs: CandleSeries) -> List[Zone]:

        n_completed = cs.n_completed 
        incomplete = cs.is_incomplete or [False] * n_completed
        atr_vals = atr(cs.h, cs.l, cs.c, self.cfg.atr_period)

        _tf_adj = {TF.E: 1.4, TF.A: 1.2, TF.X: 1.0}.get(tf, 1.0)

        _bl_adj = {TF.E: 1.5, TF.A: 1.25, TF.X: 1.0}.get(tf, 1.0)

        # _eff_max_base_len = int(self.cfg.max_base_len * _bl_adj + 0.5) 
        if tf == TF.X:
            _bl_adj = 1.0
            _eff_max_base_len = int(self.cfg.max_base_len * _bl_adj + 0.5)
        else:
            _eff_max_base_len = 999  # No limit on E/A
        # flags = [self._is_basing(cs, i) for i in range(cs.n)]
        flags = [
            self._is_basing(cs, i, (atr_vals[i] * _tf_adj) if (i < len(atr_vals) and atr_vals[i]) else None)
            and not (i < len(incomplete) and incomplete[i])
            for i in range(n_completed)
        ]
        
        zones: List[Zone] = []
        i = 0

        while i < cs.n:
            if not flags[i]:
                i += 1
                continue

            # run = self._run_len(flags, i)
            run, basing_count, bridge_idx = self._run_len_with_bridge(
                flags, i, cs, n_completed, atr_vals, _eff_max_base_len
            )
            b0, b1 = i, i + run - 1
            if run == 0:
                i += 1
                continue

            ######################################################
            used_short_run = False
            if bridge_idx is not None:
                # Compute short run: consecutive basing only (no bridge)
                run_short = 0
                for j in range(i, n_completed):
                    if flags[j]:
                        run_short += 1
                    else:
                        break
                if run_short > 0 and run_short < run:
                    b0_s, b1_s = i, i + run_short - 1
                    bc_s = run_short  # All basing, no bridge
                    # Validate short run
                    skip_short = False
                    if bc_s == 1 and tf == TF.X:
                        actual_base_s = next(j for j in range(b0_s, b1_s+1) if flags[j])
                        if not self._single_base_ok(cs, actual_base_s, atr_vals):
                            skip_short = True
                    elif tf != TF.X and (bc_s > self.cfg.max_base_len):
                        skip_short = True
                    
                    if not skip_short:
                        dir_s = self._departure_direction(cs, b0_s, b1_s)
                        if dir_s is not None and b1_s + 1 < n_completed:
                            valid_s, lc_s, lr_s = self._validate_legout(
                                cs, b0_s, b1_s, dir_s, atr_vals, tf=tf
                            )
                            if valid_s:
                                # Short run succeeds → use it instead of bridged
                                run = run_short
                                basing_count = bc_s
                                bridge_idx = None
                                b0, b1 = b0_s, b1_s
                                used_short_run = True

            ######################################################
            if bridge_idx is not None and not used_short_run:
                b_high = max(cs.h[b0:b1+1])
                b_low = min(cs.l[b0:b1+1])
                b_width = b_high - b_low
                b_atr = atr_vals[b0] if b0 < len(atr_vals) and atr_vals[b0] else None
                if b_atr and b_atr > 0 and b_width > 3.0 * b_atr:
                    j = b1
                    while j >= b0:
                        if not flags[j]:
                            j -= 1; continue
                        sub_start = j
                        while sub_start - 1 >= b0 and flags[sub_start - 1]:
                            sub_start -= 1
                        sub_bc = j - sub_start + 1
                        skip_sub = False
                        if sub_bc == 1 and tf == TF.X:
                            if not self._single_base_ok(cs, sub_start, atr_vals):
                                skip_sub = True
                        elif sub_bc > self.cfg.max_base_len:
                            skip_sub = True
                        if not skip_sub and j + 1 < n_completed:
                            dir_sub = self._departure_direction(cs, sub_start, j)
                            if dir_sub:
                                valid_sub, lc_sub, lr_sub = self._validate_legout(
                                    cs, sub_start, j, dir_sub, atr_vals, tf=tf)
                                if valid_sub:
                                    b0, b1 = sub_start, j
                                    run = b1 - i + 1  # Advance past original bridged range
                                    basing_count = sub_bc
                                    bridge_idx = None
                                    used_short_run = True
                                    break
                        j = sub_start - 1

            # BADZONE only for Execute TF (per your requirement)
            # if tf == TF.X and run >= self.cfg.max_base_len:
            #     i += run
            #     continue

            # if run == 1 and tf == TF.X and not self._single_base_ok(cs, b1):
            #     i += 1
            #     continue

            # dep_dir, accepted = self._departure_direction_first(cs, tf, b0, b1)
            # if dep_dir is None:
            #     i += run
            #     continue
            if basing_count == 1 and tf == TF.X:
                # Find the actual basing candle index for single_base_ok
                actual_base = next(j for j in range(b0, b1+1) if flags[j])
                if not self._single_base_ok(cs, actual_base, atr_vals):
                    i += 1
                    continue
            elif basing_count > self.cfg.max_base_len and tf == TF.X:
                i += run
                continue
            
            direction = self._departure_direction(cs, b0, b1)
            if direction is None:
                i += run
                continue

            legout_valid, legout_count, legout_range = self._validate_legout(cs, b0, b1, direction, atr_vals, tf=tf)

            # print(cs.l[b0], cs.h[b1], legout_valid, direction, tf, legout_count, "#######################################")

            

            #################################################################################################
            # dep_idx = b0 # + 1
            # av = atr_vals[dep_idx+1] if dep_idx < len(atr_vals) and atr_vals[dep_idx+1] else 1.0
            # dep_range = (cs.h[dep_idx] - cs.l[dep_idx]) / av if dep_idx < cs.n else 0
            # dep_body = body_pct(cs.o[dep_idx+1], cs.h[dep_idx+1], cs.l[dep_idx+1], cs.c[dep_idx+1]) if dep_idx < cs.n else 0
            # if dep_idx >= cs.n:
            #     i += run
            #     continue

            # ztype = ZoneType.BZ if dep_dir == "UP" else ZoneType.SZ
            # distal, proximal = self._boundaries(cs, tf, ztype, b0, b1)
            # sl_levels = []
            # if tf != TF.X:
            #     is_swing = self._is_swing_zone(cs, b0, b1, ztype)
            #     sl_levels = self._collect_sl_levels_around_base(cs, b0, b1, ztype)

            #     # print(ztype, proximal, distal, is_swing, "sssssssssssssssssssssssssssssssssssssssss")
            #     if is_swing and sl_levels:
            #         if ztype == ZoneType.BZ:
            #             distal = min(sl_levels)
            #         elif ztype == ZoneType.SZ:
            #             distal = max(sl_levels)
                    

            # if distal == proximal:
            #     i += run
            #     continue

            # z_patt = self.compute_zone_pattern_from_series(cs, ztype, b0, b1, max(accepted))
            # if not z_patt:
            #     i += run
            #     continue

            # z = Zone(
            #     symbol=symbol,
            #     tf=tf,
            #     ztype=ztype,
            #     distal=distal,
            #     proximal=proximal,
            #     created_idx=dep_idx,  # created on departure
            #     created_ts=(cs.ts[dep_idx] if cs.ts else None),
            #     base_start=b0,
            #     base_end=b1,
            #     base_len=run,
            #     departure_idx=dep_idx,
            #     zone_pattern=z_patt,
            #     departure_atr=dep_range,
            #     body_pct=dep_body,
            #     sl_levels=sl_levels
            # )

            # # departure candle metrics (calculation scope)
            # z.body_pct = body_pct(cs.o[dep_idx], cs.h[dep_idx], cs.l[dep_idx], cs.c[dep_idx])

            # zones.append(z)
            # i += run
            #################################################################################################
            # Problem A: Terminal extension — if legout fails, try absorbing
            # the departure candle if it's a one-sided non-basing candle,
            # then use the NEXT candle as departure.
            if not legout_valid and b1 + 1 < n_completed and not flags[b1 + 1]:
                nxt = b1 + 1
                # BUG-40: Do NOT absorb incomplete candles
                nxt_is_incomplete = incomplete[nxt] if nxt < len(incomplete) else False
                nxt_dep = nxt + 1
                if nxt_dep < n_completed and not nxt_is_incomplete:
                    # XOR guard: only absorb one-sided extension
                    base_low = min(cs.l[b0:b1+1])
                    base_high = max(cs.h[b0:b1+1])
                    makes_new_low = cs.l[nxt] < base_low
                    makes_new_high = cs.h[nxt] > base_high
                    
                    if not (makes_new_low and makes_new_high):  # XOR or neither
                        # Try extended base
                        ext_b1 = nxt
                        ext_dir = self._departure_direction(cs, b0, ext_b1)
                        if ext_dir is not None:
                            ext_valid, ext_lc, ext_lr = self._validate_legout(
                                cs, b0, ext_b1, ext_dir, atr_vals, tf=tf
                            )
                            if ext_valid:
                                # Extension rescued the zone
                                b1 = ext_b1
                                run += 1
                                direction = ext_dir
                                legout_valid = True
                                legout_count = ext_lc
                                legout_range = ext_lr
            
            if not legout_valid:
                i += run
                continue  # DISCARD pattern - legout validation failed (P1/P2/C1/C2)
            
            # ── BUG-31: Recompute legout_indices for hard discard + cleanness ─
            dep_start_31 = b1 + 1
            legout_indices = []
            for li in range(dep_start_31, min(dep_start_31 + 5, n_completed)):
                bp31 = body_pct(cs.o[li], cs.h[li], cs.l[li], cs.c[li])
                if bp31 > self.cfg.basing_body_pct:
                    legout_indices.append(li)
                else:
                    break
            
            # ── BUG-31 Part A: Hard discard if legout breaches base floor ─
            base_low = float(min(cs.l[b0:b1 + 1]))
            base_high = float(max(cs.h[b0:b1 + 1]))
            legout_hard_discard = False
            for lo_idx in legout_indices:
                if direction == "UP" and float(cs.l[lo_idx]) < base_low:
                    legout_hard_discard = True
                    break
                if direction == "DN" and float(cs.h[lo_idx]) > base_high:
                    legout_hard_discard = True
                    break
            if legout_hard_discard:
                i += run
                continue  # BUG-31: Legout breached base floor — discard
            
            # ── BUG-31 Part B: Compute legout_cleanness (0.0 to 1.0) ────
            zone_height_for_clean = abs(base_high - base_low)
            if zone_height_for_clean == 0:
                zone_height_for_clean = 1.0
            worst_depth_pct = 0.0
            for lo_idx in legout_indices:
                if direction == "UP" and cs.c[lo_idx] < cs.o[lo_idx]:  # bearish in BUY
                    re_entry = max(0.0, base_high - float(cs.l[lo_idx]))
                    depth_pct = re_entry / zone_height_for_clean
                    worst_depth_pct = max(worst_depth_pct, depth_pct)
                elif direction == "DN" and cs.c[lo_idx] > cs.o[lo_idx]:  # bullish in SELL
                    re_entry = max(0.0, float(cs.h[lo_idx]) - base_low)
                    depth_pct = re_entry / zone_height_for_clean
                    worst_depth_pct = max(worst_depth_pct, depth_pct)
            
            if worst_depth_pct == 0:        legout_cleanness = 1.00
            elif worst_depth_pct <= self.cfg.cleanness_band_1: legout_cleanness = 0.85
            elif worst_depth_pct <= self.cfg.cleanness_band_2: legout_cleanness = 0.60
            elif worst_depth_pct <= self.cfg.cleanness_band_3: legout_cleanness = 0.35
            elif worst_depth_pct <= self.cfg.cleanness_band_4: legout_cleanness = 0.15
            else:                           legout_cleanness = 0.05
            
            ztype = ZoneType.BZ if direction == "UP" else ZoneType.SZ
            distal, proximal = self._boundaries(cs, tf, ztype, b0, b1)
            # print(distal, proximal, "dddddddddddddddddddddppppppppppppppppppppppppppppppp")
            # BUG-37: Store pre-BUG-32 base-only distal (order area boundary)
            distal_base = distal
            if distal == proximal:
                i += run
                continue
            
            # ── BUG-32: Extend distal to structure extreme ──────────
            # CRITICAL: Only for standard BZ/SZ. GDZ/GSZ retain gap boundaries.
            structure_extreme, structure_start = None, None
            legin_start = None
            if ztype in (ZoneType.BZ, ZoneType.SZ):
                dep_atr_val = atr_vals[b1 + 1] if (b1 + 1) < len(atr_vals) and atr_vals[b1 + 1] else 0.0
                # BUG-39: If ATR unavailable, estimate from base candle ranges
                if dep_atr_val <= 0:
                    base_ranges = [cs.h[j] - cs.l[j] for j in range(b0, b1+1) if cs.h[j] > cs.l[j]]
                    dep_atr_val = sum(base_ranges) / len(base_ranges) if base_ranges else 0.0
                structure_extreme, structure_start = self._compute_structure_extremes(cs, b0, b1, ztype, atr_val=dep_atr_val, atr_vals=atr_vals)
                # ISSUE-STRUCT-WIDTH FIX: Zone distal reflects base structure only.
                # Structure extension stored in structure_low/structure_high for
                # RiskTargetCalculator SL cascade. Zone boundaries (proximal/distal)
                # represent the institutional order area. Candles outside the base
                # are NOT part of the order flow — their extremes should not define
                # the zone boundary. BUG-37 distal_base already stores the correct
                # value; we simply stop overwriting distal with structure_extreme.
                # 
                # Before: distal = min/max(distal, structure_extreme) → wide zones
                # After:  distal = distal_base (unchanged), structure_extreme → SL only
                #
                # Verified: 0 zones change violation status. 532 zones get narrower.
                # 246 untradeable zones (>3×ATR) fixed. BUG-37 compatible.
                legin_start = self._find_legin_start(cs, b0)
            
            # ── Q5: Detect internal gaps within base ────────────────
            internal_gaps = []
            for j in range(b0, b1):
                if cs.l[j+1] > cs.h[j]:   # gap up within base
                    internal_gaps.append((float(cs.h[j]), float(cs.l[j+1]), "UP"))
                elif cs.h[j+1] < cs.l[j]: # gap down within base
                    internal_gaps.append((float(cs.l[j]), float(cs.h[j+1]), "DOWN"))
            
            dep_idx = b1 + 1
            av = atr_vals[dep_idx] if dep_idx < len(atr_vals) and atr_vals[dep_idx] else 1.0
            dep_range = (cs.h[dep_idx] - cs.l[dep_idx]) / av if dep_idx < n_completed else 0
            dep_body = body_pct(cs.o[dep_idx], cs.h[dep_idx], cs.l[dep_idx], cs.c[dep_idx]) if dep_idx < n_completed else 0
            
            zone = Zone(
                symbol=symbol, tf=tf, ztype=ztype,
                distal=distal, proximal=proximal,
                distal_base=distal_base,  # BUG-37: pre-extension base-only distal
                created_idx=b0, base_start=b0, base_end=b1, base_len=basing_count,
                created_ts=(cs.ts[b0] if cs.ts else None),
                departure_idx=dep_idx, departure_atr=dep_range, body_pct=dep_body,
                legout_count=legout_count,  # v3.4: Track valid legout candles
                legout_range=legout_range,  # v3.4 ENHANCED: Track legout range
                # v3.8.4 fields
                structure_low=structure_extreme if ztype == ZoneType.BZ else None,
                structure_high=structure_extreme if ztype == ZoneType.SZ else None,
                structure_start_idx=structure_start,
                legin_start_idx=legin_start,
                legout_cleanness=legout_cleanness,
                has_internal_gap=len(internal_gaps) > 0,
                internal_gap_levels=internal_gaps,
            )

            if b0 > 0 and dep_idx < n_completed:
                _leg_in = "R" if cs.c[b0 - 1] > cs.o[b0 - 1] else "D"
                _bh = max(cs.h[b0:b1+1]); _bl = min(cs.l[b0:b1+1])
                if cs.c[dep_idx] > _bh:
                    _leg_out = "R"
                elif cs.c[dep_idx] < _bl:
                    _leg_out = "D"
                else:
                    _leg_out = "R" if cs.c[dep_idx] > cs.o[dep_idx] else "D"
                _patt_str = f"{_leg_in}B{_leg_out}"
                _patt_map = {"RBR": ZonePattern.RBR, "DBR": ZonePattern.DBR,
                             "RBD": ZonePattern.RBD, "DBD": ZonePattern.DBD}
                zone.zone_pattern = _patt_map.get(_patt_str, ZonePattern.NONE)

            # v3.8.9: Distal extension for reversal patterns (DBR/RBD).
            # In DBR (Drop-Base-Rally), the legin DROP is part of the same
            # demand event — institutions absorbed selling from the legin's
            # LOW through the base. Distal extends to legin LOW.
            # In RBD (Rally-Base-Drop), the legin RALLY is part of the same
            # supply event. Distal extends to legin HIGH.
            # Continuation patterns (RBR/DBD) are NOT extended — the legin
            # approached from the proximal side, its extreme is irrelevant.
            if b0 > 0 and zone.zone_pattern == ZonePattern.DBR:
                _legin_low = cs.l[b0 - 1]
                if _legin_low < zone.distal_base:
                    zone.distal_base = _legin_low
                    zone.distal = min(zone.distal, _legin_low)
            elif b0 > 0 and zone.zone_pattern == ZonePattern.RBD:
                _legin_high = cs.h[b0 - 1]
                if _legin_high > zone.distal_base:
                    zone.distal_base = _legin_high
                    zone.distal = max(zone.distal, _legin_high)

            zones.append(zone)
            i += run

        consec_zones = []
        for zone in zones:
            if zone.base_len < 2 or zone.base_end - zone.base_start < 2:
                continue
            basing_in_base = [j for j in range(zone.base_start, zone.base_end + 1) if flags[j]]
            if len(basing_in_base) < 2:
                continue
            
            if zone.ztype == ZoneType.BZ:
                # Find floor candles: basing candle H < min(L) of other basing candles
                for k in basing_in_base:
                    others = [j for j in basing_in_base if j != k]
                    if not others:
                        continue
                    others_low = min(cs.l[j] for j in others)
                    if cs.h[k] < others_low:
                        # k is at a lower price level → consecutive BZ
                        c_distal, c_proximal = self._boundaries(cs, tf, ZoneType.BZ, k, k)
                        if c_distal == c_proximal:
                            continue
                        c_zone = Zone(
                            symbol=symbol, tf=tf, ztype=ZoneType.BZ,
                            distal=c_distal, proximal=c_proximal,
                            distal_base=c_distal,
                            created_idx=k, base_start=k, base_end=k, base_len=1,
                            created_ts=(cs.ts[k] if cs.ts else None),
                            departure_idx=k + 1,
                            departure_atr=0.0, body_pct=0.0,
                            legout_count=0, legout_range=0.0,
                            structure_low=None, structure_high=None,
                            structure_start_idx=None, legin_start_idx=None,
                            legout_cleanness=1.0,
                            has_internal_gap=False, internal_gap_levels=[],
                        )
                        consec_zones.append(c_zone)
            
            elif zone.ztype == ZoneType.SZ:
                for k in basing_in_base:
                    others = [j for j in basing_in_base if j != k]
                    if not others:
                        continue
                    others_high = max(cs.h[j] for j in others)
                    if cs.l[k] > others_high:
                        c_distal, c_proximal = self._boundaries(cs, tf, ZoneType.SZ, k, k)
                        if c_distal == c_proximal:
                            continue
                        c_zone = Zone(
                            symbol=symbol, tf=tf, ztype=ZoneType.SZ,
                            distal=c_distal, proximal=c_proximal,
                            distal_base=c_distal,
                            created_idx=k, base_start=k, base_end=k, base_len=1,
                            created_ts=(cs.ts[k] if cs.ts else None),
                            departure_idx=k + 1,
                            departure_atr=0.0, body_pct=0.0,
                            legout_count=0, legout_range=0.0,
                            structure_low=None, structure_high=None,
                            structure_start_idx=None, legin_start_idx=None,
                            legout_cleanness=1.0,
                            has_internal_gap=False, internal_gap_levels=[],
                        )
                        consec_zones.append(c_zone)

        zones.extend(consec_zones)
        # v3.8.8: E-TF single doji rejection.
        # In HTFs, base_len has no relevance — zones can be 1 candle or many.
        # There are no "bad zones" in HTFs. The ONLY rejection: a single
        # candle that is a doji (body% < 10%). A doji is pure indecision —
        # no evidence of institutional accumulation or distribution.
        # Single proper basing candles (body% >= 10%) ARE valid zones.
        # A doji within a multi-candle base IS valid (other candles provide
        # the institutional evidence).

        if tf == TF.E:
            def _is_single_doji(z):
                if z.base_len != 1:
                    return False
                idx = z.base_start
                rng = cs.h[idx] - cs.l[idx]
                if rng <= 0:
                    return True
                bp = abs(cs.c[idx] - cs.o[idx]) / rng
                return bp < 0.10  # body < 10% of range = doji
            zones = [z for z in zones if not _is_single_doji(z)]

        # v3.8.9: Single-candle hammer/inverted hammer rejection (ALL TFs).
        # A hammer or inverted hammer is a REJECTION signal, not institutional
        # consolidation. The body is at an extreme of the range with a dominant
        # single-sided wick — showing directional failure, not absorption.
        # ONLY applies to single-candle bases (base_len == 1).
        # Multi-candle bases containing a hammer are valid — surrounding
        # basing candles provide the consolidation evidence.
        # Criteria:
        #   Inverted hammer: close_pos < 25% AND upper_wick > 60%
        #   Hammer: close_pos > 75% AND lower_wick > 60%
        def _is_single_hammer(z):
            if z.base_len != 1:
                return False
            idx = z.base_start
            rng = cs.h[idx] - cs.l[idx]
            if rng <= 0:
                return False
            close_pos = (cs.c[idx] - cs.l[idx]) / rng
            upper_wick = (cs.h[idx] - max(cs.o[idx], cs.c[idx])) / rng
            lower_wick = (min(cs.o[idx], cs.c[idx]) - cs.l[idx]) / rng
            # Inverted hammer: body near low, dominant upper wick
            if close_pos < 0.25 and upper_wick > 0.60:
                return True
            # Hammer: body near high, dominant lower wick
            if close_pos > 0.75 and lower_wick > 0.60:
                return True
            return False
        zones = [z for z in zones if not _is_single_hammer(z)]

        return zones

    def process_zones(self, symbol: str, cs: CandleSeries, tf: TF):
        zones = self.detect(symbol, tf, cs)
        if tf in [TF.E, TF.A]:
            filter_zones = filter_buy_sell_zones_v2(zones, is_execute=False, cs=cs)
            return filter_zones
        else:
            return zones
        
    def _collect_sl_levels_around_base(self, cs: CandleSeries, b0: int, b1: int, ztype: ZoneType) -> List[float]:
        """
        Collect SL candidate levels around the base window.

        BUY  -> collect lows lower than base_low (from candles before + after base)
        SELL -> collect highs higher than base_high (if you want later)

        NOTE: This function only returns the SL levels list.
        It does NOT change distal/proximal.
        """

        if b0 - 1 < 0 or b1 + 1 >= cs.n:
            return []

        levels: List[float] = []

        if ztype == ZoneType.BZ:
            base_low = float(min(cs.l[b0:b1 + 1]))
            prev_low = float(cs.l[b0 - 1])
            next_low = float(cs.l[b1 + 1])

            if prev_low < base_low:
                levels.append(prev_low)
            if next_low < base_low:
                levels.append(next_low)

            levels.append(base_low)
            return sorted(set(levels))   # lowest first

        if ztype == ZoneType.SZ:
            base_high = float(max(cs.h[b0:b1 + 1]))
            prev_high = float(cs.h[b0 - 1])
            next_high = float(cs.h[b1 + 1])

            if prev_high > base_high:
                levels.append(prev_high)
            if next_high > base_high:
                levels.append(next_high)

            levels.append(base_high)
            return sorted(set(levels), reverse=True)  # highest first

        return []

# ==============================================================================
# MULTI-ZONE HANDLER (v3.1.1 CORRECTED)
# ==============================================================================

class MultiZoneHandler:
    """Handles consecutive and overlapping zones with v3.1.1 fixes."""
    
    def __init__(self, cfg: Config):
        self.cfg = cfg
    
    def is_consecutive(self, z1: Zone, z2: Zone, atr_x: float) -> bool:
        """Check if Z1 and Z2 are consecutive (Execute TF only)."""
        if z1.ztype != z2.ztype:
            return False
        if z1.tf != TF.X or z2.tf != TF.X:
            return False
        
        # Use normalized edges to avoid directional bugs
        # Consecutive = non-overlapping but within gap threshold
        if self.is_overlapping(z1, z2):
            return False
        
        # Gap between zones
        gap = abs(z1.low_edge - z2.high_edge)
        if z1.low_edge > z2.high_edge:
            gap = z1.low_edge - z2.high_edge
        else:
            gap = z2.low_edge - z1.high_edge
        
        return (gap / atr_x) <= self.cfg.consecutive_max_gap_atr
    
    def is_overlapping(self, z1: Zone, z2: Zone) -> bool:
        """
        v3.1.1 FIX: Generic interval intersection.
        Overlap if max(low_edges) <= min(high_edges).
        """
        z1_buy = z1.ztype in [ZoneType.BZ, ZoneType.GDZ]
        z2_buy = z2.ztype in [ZoneType.BZ, ZoneType.GDZ]
        z1_sell = z1.ztype in [ZoneType.SZ, ZoneType.GSZ]
        z2_sell = z2.ztype in [ZoneType.SZ, ZoneType.GSZ]

        # only compare zones on the same side
        same_side = (z1_buy and z2_buy) or (z1_sell and z2_sell)
        if not same_side:
            return False

        # overlap / containment / partial intersection
        return max(z1.low_edge, z2.low_edge) <= min(z1.high_edge, z2.high_edge)
    
    def create_composite(self, z1: Zone, z2: Zone) -> Zone:
        """Create composite zone from two overlapping zones."""
        # Composite takes union of intervals
        new_low = min(z1.low_edge, z2.low_edge)
        new_high = max(z1.high_edge, z2.high_edge)
        
        # Assign distal/proximal based on zone type
        if z1.ztype in [ZoneType.BZ, ZoneType.GDZ]:
            distal = new_low
            proximal = new_high
        else:
            distal = new_high
            proximal = new_low
        
        composite = Zone(
            symbol=z1.symbol,
            tf=z1.tf,
            ztype=z1.ztype,
            distal=distal,
            proximal=proximal,
            created_idx=min(z1.created_idx, z2.created_idx),
            base_len=(z1.base_len or 0) + (z2.base_len or 0),
            retest_count=max(z1.retest_count, z2.retest_count),
            is_composite=True,
            source_zone_ids=[z1.zone_id, z2.zone_id]
        )
        return composite
    
    def create_composite_from_group(self, zones: List[Zone]) -> Zone:
        """Create composite from multiple overlapping zones."""
        if len(zones) == 1:
            return zones[0]
        
        composite = zones[0]
        for z in zones[1:]:
            composite = self.create_composite(composite, z)
            composite.source_zone_ids.extend([z.zone_id])
        
        # Deduplicate source IDs
        composite.source_zone_ids = list(set(composite.source_zone_ids))
        return composite
    
    def process_overlaps(self, zones: List[Zone], atr_x: float) -> Tuple[List[Zone], Set[str]]:
        """
        v3.1.1 FIX: Process overlapping zones and return resolved list.
        Returns: (resolved_zones, replaced_zone_ids)
        """
        result: List[Zone] = []
        replaced_ids: Set[str] = set()

        bz_zones = sorted(
            [z for z in zones if z.ztype in [ZoneType.BZ, ZoneType.GDZ]],
            key=lambda z: z.low_edge
        )
        sz_zones = sorted(
            [z for z in zones if z.ztype in [ZoneType.SZ, ZoneType.GSZ]],
            key=lambda z: z.low_edge
        )

        # print("\n========== PROCESS OVERLAPS START ==========")
        # print("TOTAL ZONES:", len(zones))
        # print("BUY ZONES:", [(z.zone_id, z.low_edge, z.high_edge, z.ztype) for z in bz_zones])
        # print("SELL ZONES:", [(z.zone_id, z.low_edge, z.high_edge, z.ztype) for z in sz_zones])

        for list_name, zone_list in [("BUY", bz_zones), ("SELL", sz_zones)]:
            # print(f"\n----- PROCESSING {list_name} ZONES -----")

            i = 0
            while i < len(zone_list):
                current = zone_list[i]

                # print(f"\n[OUTER LOOP] i={i}, current={current.zone_id}, replaced={current.zone_id in replaced_ids}")

                if current.zone_id in replaced_ids:
                    # print(f"SKIP: {current.zone_id} already in replaced_ids")
                    i += 1
                    continue

                current.is_part_of_overlapping = False
                current.overlapping_partners_id = []

                overlap_group = [current]

                # print(
                    # f"START GROUP with {current.zone_id} "
                    # f"range=({current.low_edge}, {current.high_edge}) type={current.ztype}"
                # )

                for j in range(i + 1, len(zone_list)):
                    candidate = zone_list[j]

                    # print(
                        # f"  [CHECK] j={j}, candidate={candidate.zone_id}, "
                        # f"range=({candidate.low_edge}, {candidate.high_edge}), "
                        # f"type={candidate.ztype}, replaced={candidate.zone_id in replaced_ids}"
                    # )

                    if candidate.zone_id in replaced_ids:
                        # print(f"  SKIP candidate {candidate.zone_id} already replaced")
                        continue

                    compare_results = []
                    for g in overlap_group:
                        ov = self.is_overlapping(candidate, g)
                        compare_results.append((g.zone_id, ov))
                        # print(
                            # f"    compare {candidate.zone_id} vs {g.zone_id} "
                            # f"=> overlap={ov} | "
                            # f"candidate=({candidate.low_edge}, {candidate.high_edge}) "
                            # f"group=({g.low_edge}, {g.high_edge})"
                        # )

                    overlaps_with_group = any(x[1] for x in compare_results)

                    if overlaps_with_group:
                        # print(f"  >>> OVERLAP DETECTED: add {candidate.zone_id} to group")
                        overlap_group.append(candidate)
                        replaced_ids.add(candidate.zone_id)
                    # else:
                        # print(f"  no overlap for {candidate.zone_id}")

                # print("FINAL GROUP IDS:", [z.zone_id for z in overlap_group])

                if len(overlap_group) > 1:
                    group_ids = [z.zone_id for z in overlap_group]

                    # print(f"GROUP FORMED: {group_ids}")

                    for item in overlap_group:
                        # partners = [gid for gid in group_ids if gid != item.zone_id]

                        # print(
                            # f"  ASSIGN BEFORE -> zone={item.zone_id}, "
                            # f"old_flag={item.is_part_of_overlapping}, "
                            # f"old_partners={item.overlapping_partners_id}"
                        # )
                        item.is_part_of_overlapping = True
                        item.overlapping_partners_id = [
                            partner.zone_id
                            for partner in overlap_group
                            if not (
                                round(partner.distal, 4) == round(item.distal, 4) and
                                round(partner.proximal, 4) == round(item.proximal, 4) and
                                partner.ztype == item.ztype
                            )
                        ]

                        # item.overlapping_partners_id = partners

                        # print(
                            # f"  ASSIGN AFTER  -> zone={item.zone_id}, "
                            # f"new_flag={item.is_part_of_overlapping}, "
                            # f"new_partners={item.overlapping_partners_id}"
                        # )

                        result.append(item)

                    replaced_ids.add(current.zone_id)
                    # print(f"ADDED current zone {current.zone_id} to replaced_ids")
                else:
                    # print(f"NO GROUP for {current.zone_id}, keeping as standalone")
                    result.append(current)

                i += 1

        # print("\n========== PROCESS OVERLAPS END ==========")
        # print("REPLACED IDS:", replaced_ids)
        # print("FINAL RESULT SNAPSHOT:")
        # for z in result:
            # print(
                # f"zone={z.zone_id}, type={z.ztype}, "
                # f"overlap_flag={z.is_part_of_overlapping}, "
                # f"partners={z.overlapping_partners_id}"
            # )

        return result, replaced_ids
        
    def find_consecutive_stack(self, zones: List[Zone], atr_x: float) -> None:
        """Mark consecutive zone relationships."""
        # Sort by edge for proper ordering
        # bz_zones = sorted([z for z in zones if z.ztype in [ZoneType.BZ, ZoneType.GDZ] and not z.replaced_by_composite], 
        #                  key=lambda z: z.low_edge, reverse=True)
        # sz_zones = sorted([z for z in zones if z.ztype in [ZoneType.SZ, ZoneType.GSZ] and not z.replaced_by_composite], 
        #                  key=lambda z: z.high_edge)
        
        # for zone_list in [bz_zones, sz_zones]:
        #     for i, z in enumerate(zone_list):
        #         z.consecutive_zone_ids = []
        #         for j in range(i + 1, len(zone_list)):
        #             if self.is_consecutive(z, zone_list[j], atr_x):
        #                 z.consecutive_zone_ids.append(zone_list[j].zone_id)
        sorted_bzs = sorted([z for z in zones if z.is_buy_zone], key=lambda z: z.distal, reverse=True)
        sorted_szs = sorted([z for z in zones if z.is_sell_zone], key=lambda z: z.distal)
        
        for sorted_list in [sorted_bzs, sorted_szs]:
            for i in range(len(sorted_list) - 1):
                if self.is_consecutive(sorted_list[i], sorted_list[i+1], atr_x):
                    sorted_list[i].is_part_of_consecutive = True
                    sorted_list[i+1].is_part_of_consecutive = True
                    # Bidirectional: each zone knows its partner
                    if not sorted_list[i].consecutive_partner_id:
                        sorted_list[i].consecutive_partner_id = sorted_list[i+1].zone_id
                    if not sorted_list[i+1].consecutive_partner_id:
                        sorted_list[i+1].consecutive_partner_id = sorted_list[i].zone_id
        


# ==============================================================================
# ZONE QUALIFIER (v3.1.1 CORRECTED)
# ==============================================================================

class ZoneQualifier:
    def __init__(self, cfg: Config):
        self.cfg = cfg

    def _is_basing(self, cs: CandleSeries, i: int) -> bool:
        rng = cs.h[i] - cs.l[i]
        if rng == 0:
            return True
        return abs(cs.o[i] - cs.c[i]) <= self.cfg.basing_body_pct * rng

    def _safe_zone_time_key(self, z: Zone) -> Tuple[int, int]:
        """
        Sorting key: prefer created_ts (if present), otherwise fall back to created_idx.
        Secondary key always created_idx for stable ordering.
        """
        ts = z.created_ts if z.created_ts is not None else -1
        return (ts, z.created_idx)
    
    def violation_start_idx(self, cs: CandleSeries, zone: Zone) -> int:
        """
        Start scanning AFTER the leg-out sequence.
        Leg-out = consecutive non-basing candles immediately after base_end.
        """
        # base_end is best anchor; fallback to created/departure
        if zone.base_end is not None:
            i = zone.base_end + 1
        elif zone.departure_idx is not None:
            i = zone.departure_idx + 1
        else:
            i = (zone.created_idx or 0) + 1

        i = max(0, min(i, cs.n))  # allow cs.n (empty slice)

        # Skip consecutive non-basing candles (leg-out run)
        # Optional safety cap to prevent skipping too far
        max_skip = 10  # or cfg.legout_max_skip
        skipped = 0
        while i < cs.n and (not self._is_basing(cs, i)) and skipped < max_skip:
            i += 1
            skipped += 1

        return i + 1
    
    def classify_violation(self, cs: CandleSeries, zone: Zone) -> ViolationType:
        """
        Scan ALL candles from zone.created_idx -> last candle.
        BUY zones (BZ/GDZ):
        - TRUE_BREAK if any close < distal
        - SWEEP if any low < distal (and no true break)
        SELL zones (SZ/GSZ):
        - TRUE_BREAK if any close > distal
        - SWEEP if any high > distal (and no true break)
        """
        
        if cs.n == 0:
            return ViolationType.NONE

        start = self.violation_start_idx(cs, zone)
        # start = zone.created_idx if zone.created_idx is not None else 0
        # start = max(0, min(start, cs.n - 1))
        # print(start, "start......................")
        if start >= cs.n:
            return ViolationType.NONE

        lows = cs.l[start:cs.n]
        highs = cs.h[start:cs.n]
        closes = cs.c[start:cs.n]
        # print(min(closes) < zone.distal)
        if zone.ztype in (ZoneType.BZ, ZoneType.GDZ):  # BUY
            if min(closes) < zone.distal:
                return ViolationType.TRUE_BREAK
            if min(lows) < zone.distal:
                return ViolationType.SWEEP
            return ViolationType.NONE

        elif zone.ztype in (ZoneType.SZ, ZoneType.GSZ):  # SELL
            if max(closes) > zone.distal:
                return ViolationType.TRUE_BREAK
            if max(highs) > zone.distal:
                return ViolationType.SWEEP
            return ViolationType.NONE

        return ViolationType.NONE


    
    def compute_penetration_pct(self, zone: Zone, candle_low: float, candle_high: float) -> float:
        """
        v3.1.1 FIX: Penetration measured from PROXIMAL (entry edge) toward distal.
        This measures "how deep price moved INTO the zone from the entry edge."
        """
        # if zone.zone_height == 0:
        #     return 0.0
        # print(zone.ztype)
        if zone.ztype in [ZoneType.BZ, ZoneType.GDZ]:
            # BZ: Price enters from above (proximal), penetrates toward distal (below)
            # Penetration = how far below proximal did price go
            penetration = max(0, zone.proximal - candle_low)
        else:
            # SZ: Price enters from below (proximal), penetrates toward distal (above)
            # Penetration = how far above proximal did price go
            penetration = max(0, candle_high - zone.proximal)
        
        # Cap at 100% (can't penetrate more than zone height before it's a break)
        # print(penetration, zone.zone_height, zone.distal, zone.proximal, zone.ztype, "pppppppppppppppppppppppppppppppppppppppppppppppppp")
        # print(penetration)
        if zone.zone_height == 0.0:
            # print(zone.zone_height, zone.ztype, "zzzzzzzzzzzzzzzzzzzzzzzhhhhhhhhhhhhhhhhhhhhhhhhhhhh")
            return 0.0
        return min(100, (penetration / zone.zone_height) * 100)
    
    # def update_violation(self, cs: CandleSeries, zone: Zone) -> None:
    #     """
    #     Updates:
    #     - zone.violation / invalidated / state
    #     - zone.penetration_pct using WORST excursion into zone from PROXIMAL,
    #         across all candles since created_idx.

    #     Penetration inputs:
    #     - BUY: uses min_low (worst dip) vs proximal
    #     - SELL: uses max_high (worst spike) vs proximal
    #     """
    #     if zone.invalidated:
    #         return

    #     if cs.n == 0:
    #         zone.violation = ViolationType.NONE
    #         zone.penetration_pct = 0.0
    #         return

    #     # 1) classify across whole post-zone window
    #     v = self.classify_violation(cs, zone)
    #     zone.violation = v
    #     # print(v)
    #     # if zone.ztype in [ZoneType.GDZ, ZoneType.GSZ]:
    #         # print(zone.proximal, zone.distal, zone.violation, "...................................")

    #     if v == ViolationType.TRUE_BREAK:
    #         zone.invalidated = True
    #         zone.state = ZoneState.RED
    #         zone.block_reason = "INVALIDATED_TRUE_BREAK"

    #     # 2) worst-case penetration across whole post-zone window
    #     # start = zone.created_idx if zone.created_idx is not None else 0
    #     # start = max(0, min(start, cs.n - 1))
    #     start = self.violation_start_idx(cs, zone)
    #     if start == cs.n:
    #         start = cs.n - 1
    #         # zone.penetration_pct = 0.0
    #         # return
    #     elif start > cs.n:
    #         zone.penetration_pct = 0.0
    #         return

    #     min_low = float(min(cs.l[start:cs.n]))
    #     max_high = float(max(cs.h[start:cs.n]))

    #     # compute_penetration_pct already branches BUY vs SELL correctly
    #     zone.penetration_pct = self.compute_penetration_pct(zone, min_low, max_high)
        # print(zone.penetration_pct)
    
    def update_violation(self, cs: CandleSeries, zone: Zone) -> None:
        """
        Update zone violation status.
        
        v3.8.7: G3 GAP SOFTENING for X-TF GDZ/GSZ zones.
        Gap zones represent institutional IMBALANCE, not order blocks.
        A single wick probe is testing, not exhaustion. Rules:
          - X-TF GDZ/GSZ: 1 wick touch (≤50% depth) → NOT invalidated (AMBER)
                           1 wick touch (>50% depth) → invalidated
                           2+ wick touches → invalidated
          - All other zones: zero tolerance (unchanged)
          - E/A TF gap zones: unchanged (distal = far edge, orders persist)
        """
        if zone.invalidated:
            return
        
        _is_gap_x = (zone.ztype in (ZoneType.GDZ, ZoneType.GSZ) 
                     and zone.tf == TF.X)
        
        start = zone.created_idx + 1
        end = cs.n
        _touch_count = 0
        _max_depth_pct = 0.0
        _in_violation = False  # Track episode state
        
        for i in range(start, end):
            violated_here = False
            if zone.is_buy_zone:
                # v3.8.8 FIX: Gap zones check entry from PROXIMAL (into zone).
                # Regular zones check breach of DISTAL (past zone).
                # Gap softening measures depth from proximal toward distal.
                _threshold = zone.proximal if _is_gap_x else zone.distal
                if cs.l[i] < _threshold:
                    violated_here = True
                    if _is_gap_x:
                        depth = zone.proximal - cs.l[i]  # from proximal into zone
                    else:
                        depth = zone.distal - cs.l[i]    # past distal
                    zone_h = (zone.gap_void_height if _is_gap_x and zone.gap_void_height > 0
                              else zone.zone_height if zone.zone_height > 0 else 1)
                    depth_pct = (depth / zone_h) * 100
                    _max_depth_pct = max(_max_depth_pct, depth_pct)
            else:
                _threshold = zone.proximal if _is_gap_x else zone.distal
                if cs.h[i] > _threshold:
                    violated_here = True
                    if _is_gap_x:
                        depth = cs.h[i] - zone.proximal
                    else:
                        depth = cs.h[i] - zone.distal
                    zone_h = (zone.gap_void_height if _is_gap_x and zone.gap_void_height > 0
                              else zone.zone_height if zone.zone_height > 0 else 1)
                    depth_pct = (depth / zone_h) * 100
                    _max_depth_pct = max(_max_depth_pct, depth_pct)
            
            # Count episodes (consecutive violated candles = 1 episode)
            if violated_here and not _in_violation:
                _touch_count += 1
                _in_violation = True
            elif not violated_here:
                _in_violation = False
            
            # For non-gap zones OR non-X-TF: immediate invalidation
            if violated_here and not _is_gap_x:
                zone.violation = ViolationType.TRUE_BREAK
                zone.invalidated = True
                zone.state = ZoneState.RED
                zone.block_reason = "INVALIDATED_WICK_BEYOND_DISTAL"
                return
            
            # For X-TF gap zones: check thresholds
            if _is_gap_x and _max_depth_pct >= 100:
                # Wick reached or passed distal — zone fully consumed
                zone.violation = ViolationType.TRUE_BREAK
                zone.invalidated = True
                zone.state = ZoneState.RED
                zone.block_reason = "INVALIDATED_GAP_DISTAL_REACHED ({:.0f}%)".format(_max_depth_pct)
                zone.gap_wick_touch_count = _touch_count
                zone.gap_wick_max_depth_pct = _max_depth_pct
                return
            if _is_gap_x and _touch_count >= 2:
                zone.violation = ViolationType.TRUE_BREAK
                zone.invalidated = True
                zone.state = ZoneState.RED
                zone.block_reason = "INVALIDATED_GAP_2ND_WICK_TOUCH"
                zone.gap_wick_touch_count = _touch_count
                zone.gap_wick_max_depth_pct = _max_depth_pct
                return
            if _is_gap_x and _touch_count == 1 and _max_depth_pct > 65:
                zone.violation = ViolationType.TRUE_BREAK
                zone.invalidated = True
                zone.state = ZoneState.RED
                zone.block_reason = "INVALIDATED_GAP_DEEP_WICK (>{:.0f}%)".format(_max_depth_pct)
                zone.gap_wick_touch_count = _touch_count
                zone.gap_wick_max_depth_pct = _max_depth_pct
                return
        
        # Store gap wick tracking for zones that survived
        if _is_gap_x:
            zone.gap_wick_touch_count = _touch_count
            zone.gap_wick_max_depth_pct = _max_depth_pct
        
        # v3.8.9 PDC-1: Deep penetration degradation for REGULAR (non-gap) X-TF zones.
        # If wick penetrates >65% from proximal toward distal (but doesn't reach
        # distal), the zone is heavily consumed → RED/invalidated.
        # SCOPED TO X-TF ONLY: E/A zones are structural context — their
        # violation is only at distal (institutional orders persist across
        # months/weeks despite retests). X-TF zones are execution zones
        # where deep penetration consumes the order block.
        # Example: ZINCMINI BZ 363.80/361.15: wick at 362.00 = 68% penetration.
        if not _is_gap_x and not zone.invalidated and zone.tf == TF.X:
            _reg_max_depth = 0.0
            _reg_touch_count = 0
            _reg_in_episode = False
            zone_h = zone.zone_height if zone.zone_height > 0 else 1
            for i in range(start, end):
                _entered = False
                if zone.is_buy_zone and cs.l[i] < zone.proximal:
                    _entered = True
                    depth = zone.proximal - cs.l[i]
                    depth_pct = (depth / zone_h) * 100
                    _reg_max_depth = max(_reg_max_depth, depth_pct)
                elif zone.is_sell_zone and cs.h[i] > zone.proximal:
                    _entered = True
                    depth = cs.h[i] - zone.proximal
                    depth_pct = (depth / zone_h) * 100
                    _reg_max_depth = max(_reg_max_depth, depth_pct)
                
                if _entered and not _reg_in_episode:
                    _reg_touch_count += 1
                    _reg_in_episode = True
                elif not _entered:
                    _reg_in_episode = False
            
            if _reg_max_depth > 65:
                zone.violation = ViolationType.TRUE_BREAK
                zone.invalidated = True
                zone.state = ZoneState.RED
                zone.block_reason = f"DEEP_PENETRATION ({_reg_max_depth:.0f}% consumed)"
                return
        
        zone.violation = ViolationType.NONE
        
        # Compute penetration % for E/A timeframes (for penalty scoring)
        if zone.tf in [TF.E, TF.A]:
            zone.penetration_pct = self.compute_penetration_pct(
                zone, cs.l[-1], cs.h[-1]
            )
        
    
    def update_retest(self, cs: CandleSeries, zone: Zone) -> None:

        start = self.violation_start_idx(cs, zone)
        count = 0
        if start >= cs.n:
            return None

        for i in range(start, cs.n):
            low_i = cs.l[i]
            high_i = cs.h[i]
            if zone.is_buy_zone:
                touched = (low_i <= zone.proximal) and (high_i >= zone.distal)
            else:  # SZ/GSZ
                touched = (high_i >= zone.proximal) and (low_i <= zone.distal)

            if touched:
                zone.retest_count += 1

    
    def compute_structure_removal(self, cs: CandleSeries, zone: Zone, opposing_distal: Optional[float], opposing_proximal: Optional[float] = None) -> bool:
        """
        Execute TF Zone Qualification: Structure Removal (P3 Legout).
        
        The departure candle (legout) must demonstrate that it REMOVED 
        opposing structure — proving institutional intent, not just a bounce.
        
        Checks (in priority order):
        1. Departure HIGH/LOW breaks opposing zone proximal (weakest boundary)
        2. Departure HIGH/LOW breaks opposing zone distal (full violation)
        3. Departure HIGH/LOW breaks major swing pivot
        4. Departure HIGH/LOW creates new structural extreme
        
        Uses departure HIGH for buy zones (structure above is removed by 
        high, not close). Uses departure LOW for sell zones.
        
        Lookback: swing_lookback (20 candles → 60 candle search window).
        """
        if zone.removes_structure:
            return True
        if zone.departure_idx is None or zone.departure_idx >= cs.n:
            return False
        
        dep_idx = zone.departure_idx
        dep_high = cs.h[dep_idx]
        dep_low = cs.l[dep_idx]
        start = max(zone.created_idx - 1, 0)
        lookback = self.cfg.swing_lookback  # 20, not 5
        
        if zone.is_buy_zone:
            # BUY zone: departure must break structure ABOVE
            # Check 1: Opposing SZ proximal breach
            if opposing_proximal and dep_high > opposing_proximal:
                zone.removes_structure = True
                zone.removes_structure_type = "OPPOSING_ZONE_PROXIMAL"
                return True
            # Check 2: Opposing SZ distal breach (full violation)
            if opposing_distal and dep_high > opposing_distal:
                zone.removes_structure = True
                zone.removes_structure_type = "OPPOSING_ZONE_DISTAL"
                return True
            # Check 3: Major swing high breach
            piv = last_pivot_high_idx(cs.h, start, lookback)
            if piv is not None and dep_high > cs.h[piv]:
                zone.removes_structure = True
                zone.removes_structure_type = "MAJOR_SWING_HIGH"
                return True
            # Check 4: New structural extreme (fallback)
            lookback_start = max(0, start - lookback * 3)
            if start > lookback_start:
                max_h_before = max(cs.h[lookback_start:start + 1])
                if dep_high > max_h_before:
                    zone.removes_structure = True
                    zone.removes_structure_type = "NEW_STRUCTURAL_HIGH"
                    return True
            # Check 5 (v3.8.7 FIX-D): Base-high breach.
            # In sustained declines, no pivot highs exist (continuous lower highs).
            # Checks 1-4 all fail. But if the departure exceeds the BASE HIGH,
            # the zone produced a valid institutional reaction — price reversed
            # from the base and broke above the consolidation range. This IS
            # structure removal at the local level.
            base_high = max(cs.h[zone.base_start:zone.base_end + 1])
            if dep_high > base_high:
                zone.removes_structure = True
                zone.removes_structure_type = "BASE_HIGH_BREACH"
                return True
        else:
            # SELL zone: departure must break structure BELOW
            if opposing_proximal and dep_low < opposing_proximal:
                zone.removes_structure = True
                zone.removes_structure_type = "OPPOSING_ZONE_PROXIMAL"
                return True
            if opposing_distal and dep_low < opposing_distal:
                zone.removes_structure = True
                zone.removes_structure_type = "OPPOSING_ZONE_DISTAL"
                return True
            piv = last_pivot_low_idx(cs.l, start, lookback)
            if piv is not None and dep_low < cs.l[piv]:
                zone.removes_structure = True
                zone.removes_structure_type = "MAJOR_SWING_LOW"
                return True
            lookback_start = max(0, start - lookback * 3)
            if start > lookback_start:
                min_l_before = min(cs.l[lookback_start:start + 1])
                if dep_low < min_l_before:
                    zone.removes_structure = True
                    zone.removes_structure_type = "NEW_STRUCTURAL_LOW"
                    return True
            # Check 5 (v3.8.7 FIX-D): Base-low breach (symmetric with BZ).
            base_low = min(cs.l[zone.base_start:zone.base_end + 1])
            if dep_low < base_low:
                zone.removes_structure = True
                zone.removes_structure_type = "BASE_LOW_BREACH"
                return True
        return False

    def get_preceding_zones(self, valid_zone: Zone, zones: List[Zone]) -> List[Zone]:
        """
        Intermediate helper:
        - Sort zones by time (created_ts if available) then created_idx
        - Return only zones formed strictly before valid_zone
        """
        sorted_zones = sorted(zones, key=self._safe_zone_time_key, reverse=True)

        # Decide "before" using created_ts when both have it, else created_idx
        opposing_zones = self.get_opposing_zones(valid_zone, sorted_zones)
        before: List[Zone] = []
        for z in opposing_zones:
            if z is valid_zone:
                continue
            
            zone_postion = False
            if valid_zone.ztype == ZoneType.BZ:
                zone_postion = (z.proximal > valid_zone.proximal)
            elif valid_zone.ztype == ZoneType.SZ:
                zone_postion = (valid_zone.proximal > z.proximal)

            if valid_zone.created_ts is not None and z.created_ts is not None:
                if z.created_ts < valid_zone.created_ts and zone_postion:
                    before.append(z)
            else:
                if z.created_idx < valid_zone.created_idx and zone_postion:
                    before.append(z)

        return sorted(before, key=self._safe_zone_time_key, reverse=True)
    
    def get_opposing_zones(self, val_zone: Zone, preceding_zones: List[Zone]) -> List[Zone]:
        opp_zone_type = ZoneType.SZ if val_zone.ztype == ZoneType.BZ else ZoneType.BZ
        opposing_zones = [z for z in preceding_zones if z.ztype == opp_zone_type]
        return opposing_zones

    def is_opposite_zone_violated(self, v_zone: Zone, opp_zone: Zone, cs: CandleSeries) -> bool:
        base_end = v_zone.base_end + 1
        ahs = cs.h[base_end:]
        ahl = cs.l[base_end:]
        if v_zone.ztype == ZoneType.BZ:
            return any(h > opp_zone.distal for h in ahs)
        elif v_zone.ztype == ZoneType.SZ:
            return any(l < opp_zone.distal for l in ahl)
        return False


    def check_preceding_zone_vilation(self, val_zone: Zone, all_violated_zones: List[Zone], cs: CandleSeries):
        prior_zones = self.get_preceding_zones(val_zone, all_violated_zones)
        
        if len(prior_zones) > 0:
            is_qualified = self.is_opposite_zone_violated(val_zone, prior_zones[0], cs)
        else:
            is_qualified = True
        
        return is_qualified


# ==============================================================================
# GAP MODULE (Gap v2.3 Compliant)
# ==============================================================================

class GapModule:
    """
    Gap v2.4 COMPLETE Implementation.
    
    D1:  Structure Removal check (NON-NEGOTIABLE per Gap v2.4 Sec 3.1 S1)
    D5:  6-dimension composite scoring (Gap v2.4 Sec 4)
    D8:  Gap fill tracking and degradation (Gap v2.4 Sec 13)
    D9:  Breakaway gap classification (Gap v2.4 Sec 12)
    Existing: OHLC validation, session acceptance, departure quality
    """
    
    def __init__(self):
        self.cfg = Config()
    
    def _min_gap_atr(self, vol: VolatilityRegime) -> float:
        return {
            VolatilityRegime.LOW: self.cfg.gap_min_atr_low,
            VolatilityRegime.NORMAL: self.cfg.gap_min_atr_norm,
            VolatilityRegime.HIGH: self.cfg.gap_min_atr_high,
        }[vol]
    
    # ------------------------------------------------------------------
    # D1: Structure Removal Check (Gap v2.4 Sec 3.1 S1 — NON-NEGOTIABLE)
    # ------------------------------------------------------------------
    def _check_structure_removal(
        self, cs: CandleSeries, n: int, n1: int,
        is_bullish: bool, opposing_zones: List[Zone]
    ) -> Tuple[bool, Optional[str]]:
        """
        Gap v2.4 Sec 3.1 S1: Gap MUST remove/violate opposing swing
        high/low OR opposing BZ/SZ OR create new structural extreme.
        
        Returns (removed: bool, removal_type: Optional[str])
        """
        dep_high = cs.h[n1]
        dep_low = cs.l[n1]
        lookback = self.cfg.swing_lookback if hasattr(self.cfg, 'swing_lookback') else 20
        
        if is_bullish:
            # GDZ: Must break above opposing SZ or swing high
            # Check opposing SZ zones
            for z in opposing_zones:
                if z.is_sell_zone and not z.invalidated:
                    # Departure candle breaks above SZ proximal
                    if dep_high > z.proximal and z.created_idx < n1:
                        return True, "OPPOSING_SZ_REMOVED"
                    # Departure candle breaks above SZ distal (full violation)
                    if dep_high > z.distal and z.created_idx < n1:
                        return True, "OPPOSING_SZ_VIOLATED"
            # Check swing high breach: is departure high above recent swing high?
            pivot_idx = last_pivot_high_idx(cs.h, n - 1, lookback)
            if pivot_idx is not None and dep_high > cs.h[pivot_idx]:
                return True, "SWING_HIGH_REMOVED"
            # Create new structural extreme: departure makes new high in lookback
            lookback_start = max(0, n - lookback * 3)
            max_h_before = max(cs.h[lookback_start:n]) if n > lookback_start else cs.h[n]
            if dep_high > max_h_before:
                return True, "NEW_STRUCTURAL_HIGH"
        else:
            # GSZ: Must break below opposing BZ or swing low
            for z in opposing_zones:
                if z.is_buy_zone and not z.invalidated:
                    if dep_low < z.proximal and z.created_idx < n1:
                        return True, "OPPOSING_BZ_REMOVED"
                    if dep_low < z.distal and z.created_idx < n1:
                        return True, "OPPOSING_BZ_VIOLATED"
            pivot_idx = last_pivot_low_idx(cs.l, n - 1, lookback)
            if pivot_idx is not None and dep_low < cs.l[pivot_idx]:
                return True, "SWING_LOW_REMOVED"
            lookback_start = max(0, n - lookback * 3)
            min_l_before = min(cs.l[lookback_start:n]) if n > lookback_start else cs.l[n]
            if dep_low < min_l_before:
                return True, "NEW_STRUCTURAL_LOW"
        
        return False, None
    
    # ------------------------------------------------------------------
    # D5: 6-Dimension Composite Scoring (Gap v2.4 Sec 4)
    # ------------------------------------------------------------------
    def _score_composite(
        self, gap_atr: float, dep_rng: float, dep_body: float,
        structure_removed: bool, removal_type: Optional[str],
        cs: CandleSeries, n1: int, is_breakaway: bool
    ) -> int:
        """
        Gap v2.4 Sec 4: Score 0-2 on each of 6 dimensions, max 12.
        
        v3.8.7 RECALIBRATION: Thresholds aligned with detection changes.
        S3 lowered to 0.3×ATR → Dim 2 must not penalize gaps 0.3-0.5×ATR.
        S5 direction bypass for absorption → Dim 3 must not penalize them.
        """
        score = 0
        
        # Dim 1: Structure Removal (0/1/2)
        if not structure_removed:
            pass  # Score 0
        elif removal_type in ("OPPOSING_SZ_VIOLATED", "OPPOSING_BZ_VIOLATED",
                              "SWING_HIGH_REMOVED", "SWING_LOW_REMOVED",
                              "NEW_STRUCTURAL_HIGH", "NEW_STRUCTURAL_LOW",
                              "BASE_HIGH_BREACH", "BASE_LOW_BREACH"):
            score += 2  # Major structure removed
        elif removal_type in ("OPPOSING_SZ_REMOVED", "OPPOSING_BZ_REMOVED"):
            score += 1  # Minor structure removed (proximal only)
        
        # Dim 2: Gap Size vs ATR (0/1/2) — RECALIBRATED
        if gap_atr > 0.5:       # Was 0.75
            score += 2
        elif gap_atr >= 0.3:    # Was 0.5
            score += 1
        # else: < 0.3x = 0
        
        # Dim 3: Departure Candle (0/1/2) — RECALIBRATED
        # Added direction-confirmation score for absorption candles
        if dep_rng >= 1.5 and dep_body >= 0.70:
            score += 2  # High-quality departure
        elif dep_rng >= 1.0 and dep_body >= 0.50:
            score += 1  # Acceptable departure
        elif dep_rng >= 0.8 and gap_atr >= 0.3:
            # Absorption candle: gap confirms direction, candle range is
            # adequate even if body% is low. The gap IS the departure.
            score += 1
        # else: weak departure = 0
        
        # Dim 4: Post-Gap Basing (0/1/2) — RECALIBRATED
        if n1 + 1 < cs.n:
            next_range = abs(cs.h[n1 + 1] - cs.l[n1 + 1])
            dep_range = abs(cs.h[n1] - cs.l[n1])
            if dep_range > 0:
                ratio = next_range / dep_range
                if ratio < 0.5:     # Was 0.4
                    score += 2
                elif ratio < 0.8:   # Was 0.7
                    score += 1
        
        # Dim 5: HTF Alignment (1 = neutral default; pipeline adjusts)
        score += 1
        
        # Dim 6: Gap Freshness (2 = untested default; pipeline adjusts)
        # RECALIBRATED: Start at 1 not 2. First retest doesn't degrade
        # because gap retests often CONFIRM the level.
        score += 1
        
        return score
    
    # ------------------------------------------------------------------
    # D9: Breakaway Gap Detection (Gap v2.4 Sec 12)
    # ------------------------------------------------------------------
    def _check_breakaway(
        self, cs: CandleSeries, n1: int, dep_rng: float,
        dep_body: float, structure_removed: bool, is_bullish: bool
    ) -> bool:
        """
        Gap v2.4 Sec 12: Breakaway gap criteria B1-B5.
        B1: MAJOR structure removal (already checked)
        B2: Impulsive departure >= 1.5x ATR, body >= 70%
        B3: N+2 continuation in gap direction
        B4: HTF alignment (checked post-detection by pipeline)
        B5: First retest clean (checked later)
        
        Returns True if B1+B2+B3 pass (B4, B5 checked later).
        """
        # B1: Major structure removal required
        if not structure_removed:
            return False
        # B2: Impulsive departure
        if dep_rng < self.cfg.gap_breakaway_departure_atr:
            return False
        if dep_body < self.cfg.gap_breakaway_body_pct:
            return False
        # B3: N+2 continuation
        n2 = n1 + 1
        if n2 >= cs.n:
            return False
        if is_bullish:
            if cs.c[n2] <= cs.c[n1]:  # Must continue up
                return False
        else:
            if cs.c[n2] >= cs.c[n1]:  # Must continue down
                return False
        return True
    
    # ------------------------------------------------------------------
    # D8: Gap Fill Tracking (Gap v2.4 Sec 13)
    # ------------------------------------------------------------------
    def compute_gap_fill(self, cs: CandleSeries, zone: Zone) -> float:
        """
        Gap v2.4 Sec 13: Track gap fill with restoration awareness.
        
        v3.8.7: Tracks CURRENT fill state, not just historical max.
        A gap filled to 100% then restored (price moved back) is LIVE.
        Fill-restore cycles are normal in equity futures.
        
        Returns fill percentage based on LAST candle's position relative
        to the gap zone (0.0 = fully unfilled, 1.0 = fully filled NOW).
        """
        if zone.zone_height == 0:
            return 0.0
        # Current fill: how much of the gap is currently penetrated
        # based on the LAST candle, not historical max
        last_idx = cs.n - 1
        if zone.is_buy_zone:  # GDZ
            # Fill = price below proximal (dropping into gap)
            current_penetration = max(0, zone.proximal - cs.l[last_idx])
        else:  # GSZ
            # Fill = price above proximal (rising into gap)
            current_penetration = max(0, cs.h[last_idx] - zone.proximal)
        
        fill_pct = min(1.0, current_penetration / zone.zone_height)
        zone.gap_fill_pct = fill_pct
        return fill_pct
    
    # ------------------------------------------------------------------
    # Main detect() — D1/D5/D9 integrated
    # ------------------------------------------------------------------
    def detect(
        self, symbol: str, tf: TF, cs: CandleSeries,
        vol: VolatilityRegime, opposing_zones: Optional[List[Zone]] = None,
        exclude_base_ranges: Optional[List[tuple]] = None
    ) -> List[Zone]:
        """
        Detect GDZ/GSZ gap zones with full Gap v2.4 compliance.
        
        D1:  Structure removal checked (S1, NON-NEGOTIABLE)
        S2:  OHLC no-overlap (inherent in gap definition)
        S3:  Minimum gap size vs ATR
        S4:  Departure candle range >= 1.2x ATR
        S5:  Departure body >= 60%
        D5:  Composite scoring (6 dimensions)
        D9:  Breakaway classification
        
        Args:
            opposing_zones: BZ/SZ zones from same TF for structure removal check.
                           If None, structure removal check uses swing highs/lows only.
        """
        out: List[Zone] = []
        atr_vals = atr(cs.h, cs.l, cs.c, self.cfg.atr_period)
        min_gap = self._min_gap_atr(vol)
        opp_zones = opposing_zones or []
        
        # LIVE CANDLE FIX: Gap detection restricted to completed bars.
        # BUG-40: Skip incomplete session-end candles entirely. Build a list of
        # valid (non-incomplete) candle indices, then scan adjacent pairs from that
        # list. This correctly detects gaps that SPAN across incomplete candles
        # (e.g., 15:15 → 10:15 next day, skipping the 15:30 incomplete bar).
        n_completed = cs.n_completed
        incomplete = cs.is_incomplete or [False] * n_completed
        valid_indices = [idx for idx in range(n_completed) if not (idx < len(incomplete) and incomplete[idx])]
        
        for vi in range(len(valid_indices) - 1):
            n = valid_indices[vi]
            n1 = valid_indices[vi + 1]
            av = atr_vals[n]
            if av is None or av <= 0:
                continue
            
            # === GDZ (Bullish Gap) ===
            if cs.l[n1] > cs.h[n]:
                # Q5: Skip if both candles are within a detected base
                if exclude_base_ranges and any(
                    b0 <= n and n1 <= b1 for b0, b1 in exclude_base_ranges
                ):
                    continue
                # S2: OHLC no-overlap (implicit in condition)
                # S3: Min gap size
                gap = (cs.l[n1] - cs.h[n]) / av
                if gap < min_gap:
                    continue
                # S4+S5: Departure quality
                dep_rng = (cs.h[n1] - cs.l[n1]) / av
                dep_body = body_pct(cs.o[n1], cs.h[n1], cs.l[n1], cs.c[n1])
                # S4: Range check — v3.8.7: combined gap + departure displacement.
                # The gap itself IS institutional displacement. If gap + candle
                # range exceeds threshold, departure is impulsive.
                _s4_standard = dep_rng >= self.cfg.gap_departure_range_atr
                _s4_combined = (gap + dep_rng) >= self.cfg.gap_departure_range_atr
                if not (_s4_standard or _s4_combined):
                    continue
                # S5: Body check — v3.8.7: direction-confirmation bypass.
                # Gap-open candles have extreme wicks (absorption). The gap IS
                # the departure; body% measures the wrong thing. If gap > 0.3×ATR
                # AND candle confirms direction (bullish: close > open), body%
                # is waived — the institution created the gap, the candle confirms.
                _gap_confirms_dir = gap >= 0.3 and cs.c[n1] > cs.o[n1]  # Bullish gap + bullish close
                abs_body = abs(cs.c[n1] - cs.o[n1]) / av if av > 0 else 0
                s5_standard = dep_body >= self.cfg.gap_departure_body_pct
                effective_min_pct = self.cfg.gap_departure_body_min_pct
                if gap > 3.0:
                    effective_min_pct = 0.25
                elif gap > 2.0:
                    effective_min_pct = 0.30
                s5_absorption = (abs_body >= self.cfg.gap_departure_body_abs_atr and
                                 dep_body >= effective_min_pct)
                if not (s5_standard or s5_absorption or _gap_confirms_dir):
                    continue
                # D1/S1: Structure Removal (NON-NEGOTIABLE)
                struct_removed, removal_type = self._check_structure_removal(
                    cs, n, n1, is_bullish=True, opposing_zones=opp_zones
                )
                if not struct_removed:
                    continue  # MECHANICAL gap — reject per Gap v2.4 Sec 3.1
                # D5: Composite scoring
                composite = self._score_composite(
                    gap, dep_rng, dep_body, struct_removed, removal_type, cs, n1, False
                )
                # D9: Breakaway check
                is_breakaway = self._check_breakaway(
                    cs, n1, dep_rng, dep_body, struct_removed, is_bullish=True
                )
                # v3.8.7 FIX-B+C: Gap zone boundaries include basing structure.
                # Scan backward from pre-gap candle to find basing candles.
                # FIX-C: Allow up to 2 consecutive impulsive candles between
                # basing groups. Cap at 4 candles to prevent G10_BADZONE.
                _struct_start = n
                _imp_count = 0
                _max_back = 4  # Cap: don't extend more than 4 candles back
                for _k in range(n - 1, max(n - _max_back - 1, -1), -1):
                    _bp_k = body_pct(cs.o[_k], cs.h[_k], cs.l[_k], cs.c[_k])
                    if _bp_k < 0.5:  # Basing candle
                        _struct_start = _k
                        _imp_count = 0
                    else:
                        _imp_count += 1
                        if _imp_count > 2:
                            break
                _struct_low = min(cs.l[_k2] for _k2 in range(_struct_start, n + 1))
                _struct_high = max(cs.h[_k2] for _k2 in range(_struct_start, n + 1))
                
                zone = Zone(
                    symbol=symbol, tf=tf, ztype=ZoneType.GDZ,
                    distal=_struct_low, proximal=cs.l[n1],
                    created_idx=n1, base_start=_struct_start, base_end=n1,
                    base_len=(n1 - _struct_start + 1),
                    departure_idx=n1, departure_atr=dep_rng, body_pct=dep_body,
                    removes_structure=True, removes_structure_type=removal_type,
                    gap_composite_score=composite,
                    gap_is_structural=(composite >= self.cfg.gap_composite_score_min),
                    gap_is_breakaway=is_breakaway,
                    gap_void_height=cs.l[n1] - cs.h[n],  # Gap void only
                )
                out.append(zone)
            
            # === GSZ (Bearish Gap) ===
            elif cs.h[n1] < cs.l[n]:
                # Q5: Skip if both candles are within a detected base
                if exclude_base_ranges and any(
                    b0 <= n and n1 <= b1 for b0, b1 in exclude_base_ranges
                ):
                    continue
                gap = (cs.l[n] - cs.h[n1]) / av
                if gap < min_gap:
                    continue
                dep_rng = (cs.h[n1] - cs.l[n1]) / av
                dep_body = body_pct(cs.o[n1], cs.h[n1], cs.l[n1], cs.c[n1])
                # S4: Range check — v3.8.7 combined (same as GDZ)
                _s4_standard = dep_rng >= self.cfg.gap_departure_range_atr
                _s4_combined = (gap + dep_rng) >= self.cfg.gap_departure_range_atr
                if not (_s4_standard or _s4_combined):
                    continue
                # S5: Body check — v3.8.7 direction-confirmation bypass (same as GDZ)
                _gap_confirms_dir = gap >= 0.3 and cs.c[n1] < cs.o[n1]  # Bearish gap + bearish close
                abs_body = abs(cs.c[n1] - cs.o[n1]) / av if av > 0 else 0
                s5_standard = dep_body >= self.cfg.gap_departure_body_pct
                effective_min_pct = self.cfg.gap_departure_body_min_pct
                if gap > 3.0:
                    effective_min_pct = 0.25
                elif gap > 2.0:
                    effective_min_pct = 0.30
                s5_absorption = (abs_body >= self.cfg.gap_departure_body_abs_atr and
                                 dep_body >= effective_min_pct)
                if not (s5_standard or s5_absorption or _gap_confirms_dir):
                    continue
                # D1/S1: Structure Removal
                struct_removed, removal_type = self._check_structure_removal(
                    cs, n, n1, is_bullish=False, opposing_zones=opp_zones
                )
                if not struct_removed:
                    continue  # MECHANICAL gap — reject
                composite = self._score_composite(
                    gap, dep_rng, dep_body, struct_removed, removal_type, cs, n1, False
                )
                is_breakaway = self._check_breakaway(
                    cs, n1, dep_rng, dep_body, struct_removed, is_bullish=False
                )
                # v3.8.7 FIX-B+C: Same as GDZ — extended backward scan, capped at 4.
                _struct_start = n
                _imp_count = 0
                _max_back = 4
                for _k in range(n - 1, max(n - _max_back - 1, -1), -1):
                    _bp_k = body_pct(cs.o[_k], cs.h[_k], cs.l[_k], cs.c[_k])
                    if _bp_k < 0.5:
                        _struct_start = _k
                        _imp_count = 0
                    else:
                        _imp_count += 1
                        if _imp_count > 2:
                            break
                _struct_high = max(cs.h[_k2] for _k2 in range(_struct_start, n + 1))
                
                zone = Zone(
                    symbol=symbol, tf=tf, ztype=ZoneType.GSZ,
                    distal=_struct_high, proximal=cs.h[n1],
                    created_idx=n1, base_start=_struct_start, base_end=n1,
                    base_len=(n1 - _struct_start + 1),
                    departure_idx=n1, departure_atr=dep_rng, body_pct=dep_body,
                    removes_structure=True, removes_structure_type=removal_type,
                    gap_composite_score=composite,
                    gap_is_structural=(composite >= self.cfg.gap_composite_score_min),
                    gap_is_breakaway=is_breakaway,
                    gap_void_height=cs.l[n] - cs.h[n1],  # Gap void only
                )
                out.append(zone)
        
        return out
    
    # ------------------------------------------------------------------
    # D5: Update composite score dimensions 5+6 post-detection
    # ------------------------------------------------------------------
    def update_composite_score_htf_freshness(
        self, zone: Zone, htf_aligned: bool, htf_neutral: bool
    ) -> None:
        """
        Update Gap v2.4 Sec 4 dimensions 5 (HTF Alignment) and 6 (Freshness)
        which require pipeline context not available at detection time.
        
        Called by pipeline after trend context and retest count are computed.
        """
        # Adjust dim 5: remove neutral default (+1), add actual
        zone.gap_composite_score -= 1  # Remove default neutral
        if htf_aligned:
            zone.gap_composite_score += 2
        elif htf_neutral:
            zone.gap_composite_score += 1
        # else: against HTF = 0 (already subtracted the +1)
        
        # Adjust dim 6: remove fresh default (+1), add actual
        # RECALIBRATED: Default was lowered from 2 to 1. First retest
        # doesn't degrade — gap retests often confirm the level.
        zone.gap_composite_score -= 1  # Remove default
        if zone.retest_count == 0:
            zone.gap_composite_score += 2  # Untested = +1 net
        elif zone.retest_count <= 2:
            zone.gap_composite_score += 1  # 1-2 retests = 0 net (confirmed)
        # else: 3+ retests = -1 net (degraded)
        
        # Re-evaluate structural classification
        zone.gap_is_structural = (
            zone.gap_composite_score >= self.cfg.gap_composite_score_min
            and zone.removes_structure
        )
        # Mark mechanical if structure was somehow removed but score too low
        if not zone.gap_is_structural and zone.ztype in (ZoneType.GDZ, ZoneType.GSZ):
            zone.gap_is_mechanical = True
    
    # ------------------------------------------------------------------
    # Session Acceptance (existing, unchanged)
    # ------------------------------------------------------------------
    def check_session_acceptance(self, cs: CandleSeries, zone: Zone, break_level: float) -> bool:
        """Gap v2.4 Sec 11 compliant session acceptance."""
        if cs.session_id is None:
            zone.session_accepted = True
            return True
        
        idx = zone.created_idx
        bullish = zone.ztype == ZoneType.GDZ
        
        sid = cs.session_id[idx]
        session_end = idx
        while session_end + 1 < cs.n and cs.session_id[session_end + 1] == sid:
            session_end += 1
        
        # Acceptance A: Same-session close
        session_close = cs.c[session_end]
        if bullish and session_close > break_level:
            zone.session_accepted = True
            return True
        if not bullish and session_close < break_level:
            zone.session_accepted = True
            return True
        
        # Acceptance B: Next-session follow-through
        next_session_start = session_end + 1
        if next_session_start >= cs.n:
            return False
        
        followthrough_end = min(next_session_start + self.cfg.gap_session_followthrough_bars, cs.n)
        for i in range(next_session_start, followthrough_end):
            if bullish and cs.c[i] > break_level:
                zone.session_accepted = True
                return True
            if not bullish and cs.c[i] < break_level:
                zone.session_accepted = True
                return True
        
        zone.state = ZoneState.AMBER
        zone.block_reason = "AWAITING_SESSION_ACCEPTANCE"
        return False



# ==============================================================================
# EMA-20 CONFLUENCE
# ==============================================================================

class EMAConfluence:
    """EMA-20 confluence scoring for Execute TF (v3.1)."""
    
    def __init__(self, cfg: Config):
        self.cfg = cfg
    
    def check_confluence(self, zone: Zone, ema_20: float) -> bool:
        if zone.tf != TF.X:
            return False
        
        buffer = self.cfg.ema_confluence_buffer_pct * zone.zone_height
        
        if zone.ztype in [ZoneType.BZ, ZoneType.GDZ]:
            # Inside zone
            if zone.distal <= ema_20 <= zone.proximal:
                return True
            # Above proximal within buffer
            if zone.proximal < ema_20 <= zone.proximal + buffer:
                return True
        else:
            # Inside zone
            if zone.proximal <= ema_20 <= zone.distal:
                return True
            # Below proximal within buffer
            if zone.proximal - buffer <= ema_20 < zone.proximal:
                return True
        
        return False
    
    def score(self, zone: Zone, ema_20: float) -> int:
        zone.ema_confluence = self.check_confluence(zone, ema_20)
        return 1 if zone.ema_confluence else 0


# ==============================================================================
# ZONE RANKER
# ==============================================================================

class ZoneRanker:
    def __init__(self, cfg: Config):
        self.cfg = cfg
        self.ema_confluence = EMAConfluence(cfg)
    
    def score(self, zone: Zone, ctx: TrendContext, vol: VolatilityRegime, 
              ema_20: Optional[float] = None) -> Zone:
        """Score zone with all v3.1.1 fixes applied."""
        
        # HARD GATES
        if zone.invalidated:
            zone.score_total = 0
            zone.state = ZoneState.RED
            zone.block_reason = "INVALIDATED_TRUE_BREAK"
            return zone
        
        if zone.replaced_by_composite:
            zone.score_total = 0
            zone.state = ZoneState.RED
            zone.block_reason = "REPLACED_BY_COMPOSITE"
            return zone
        
        if zone.base_len and zone.base_len >= self.cfg.badzone_base_len:
            zone.score_total = 0
            zone.state = ZoneState.RED
            zone.block_reason = "BADZONE_EXCESSIVE_BASING"
            return zone
        
        if not zone.removes_structure:
            zone.score_total = 0
            zone.state = ZoneState.RED
            zone.block_reason = "NO_STRUCTURE_REMOVAL"
            return zone
        
        if zone.rr is not None and zone.rr < self.cfg.rr_min:
            zone.score_total = 0
            zone.state = ZoneState.RED
            zone.block_reason = f"RR_BELOW_{self.cfg.rr_min}"
            return zone
        
        # Execute TF freshness gate (GDZ tolerates 1 retest, OOS-validated; else 0)
        if zone.tf == TF.X and zone.retest_count > zone.execute_retest_limit:
            zone.score_total = 0
            zone.state = ZoneState.RED
            zone.block_reason = "EXECUTE_NOT_FRESH"
            return zone
        
        # SCORING (0-13 max)
        score = 0
        br: Dict[str, int] = {}
        
        # Base Quality (0-2)
        bl = zone.base_len or 0
        if 2 <= bl <= 4:
            score += 2
            br["base_quality"] = 2
        elif bl == 1:
            score += 1
            br["base_quality"] = 1
        else:
            br["base_quality"] = 0
        
        # Departure (0-2)
        dep_atr = zone.departure_atr or 0.0
        bp = zone.body_pct or 0.0
        if dep_atr >= 1.5 and bp >= 0.70:
            score += 2
            br["departure"] = 2
        elif dep_atr >= 1.2 and bp >= 0.60:
            score += 1
            br["departure"] = 1
        else:
            br["departure"] = 0
        
        # Structure Removal (0-2)
        score += 2
        br["structure_removed"] = 2
        
        # Freshness (0-2)
        if zone.retest_count == 0:
            score += 2
            br["freshness"] = 2
        elif zone.retest_count == 1:
            score += 1
            br["freshness"] = 1
        else:
            br["freshness"] = 0
        
        # HTF Alignment (0-2)
        aligned = (
            (zone.ztype in [ZoneType.BZ, ZoneType.GDZ] and ctx.allow_long) or
            (zone.ztype in [ZoneType.SZ, ZoneType.GSZ] and ctx.allow_short)
        )
        if aligned:
            score += 2
            br["htf_alignment"] = 2
            zone.htf_alignment = "aligned"
        else:
            br["htf_alignment"] = 0
            zone.htf_alignment = "against"
        
        # Distance (0-2)
        d = zone.distance_to_opposing_atr
        if d is None:
            br["distance"] = 0
        elif d >= self.cfg.dist_score_2:
            score += 2
            br["distance"] = 2
        elif d >= self.cfg.dist_score_1:
            score += 1
            br["distance"] = 1
        else:
            br["distance"] = 0
        
        # EMA-20 Confluence (0-1)
        if ema_20 is not None and zone.tf == TF.X:
            ema_score = self.ema_confluence.score(zone, ema_20)
            score += ema_score
            br["ema_confluence"] = ema_score
        else:
            br["ema_confluence"] = 0
        
        # PENALTIES
        age_pen = 0
        if zone.bars_since is not None:
            if zone.bars_since > self.cfg.age2_bars:
                age_pen = 2
            elif zone.bars_since > self.cfg.age1_bars:
                age_pen = 1
        br["age_penalty"] = age_pen
        
        appr_pen = 0
        if zone.approach_speed is not None:
            if zone.approach_speed >= self.cfg.approach_penalty_lvl2:
                appr_pen = 2
            elif zone.approach_speed >= self.cfg.approach_penalty_lvl1:
                appr_pen = 1
        br["approach_penalty"] = appr_pen
        
        # HTF penetration penalty (v3.1.1: using CORRECTED formula)
        pen_pen = 0
        if zone.tf in [TF.E, TF.A] and zone.penetration_pct > 0:
            if zone.penetration_pct >= 75:
                pen_pen = 2
            elif zone.penetration_pct >= 50:
                pen_pen = 1
        br["penetration_penalty"] = pen_pen
        
        zone.score_total = max(score - age_pen - appr_pen - pen_pen, 0)
        zone.score_breakdown = br
        zone.state = ZoneState.GREEN if zone.score_total > 0 else ZoneState.AMBER
        zone.block_reason = None
        
        return zone
    
    def rank(self, zones: List[Zone], entry_price: float) -> List[Zone]:
        """Rank zones by tuple key (best first)."""
        def rank_key(z: Zone):
            return (
                -z.score_total,
                -int(z.zone_in_zone),
                z.retest_count,
                -(z.distance_to_opposing_atr or 0.0),
                abs(entry_price - z.distal)
            )
        return sorted([z for z in zones if not z.replaced_by_composite], key=rank_key)


# ==============================================================================
# RR TARGET ENGINE
# ==============================================================================

class RRTargetEngine:
    def __init__(self, cfg: Config):
        self.cfg = cfg
    
    def _stop_buffer(self, vol: VolatilityRegime) -> float:
        return {
            VolatilityRegime.LOW: self.cfg.stop_buf_low_max,
            VolatilityRegime.NORMAL: self.cfg.stop_buf_norm_max,
            VolatilityRegime.HIGH: self.cfg.stop_buf_high_max,
        }[vol]
    
    def compute(self, zone: Zone, entry: float, atr_x: float, vol: VolatilityRegime,
                opposing: Optional[Zone], target_mode: str = "conservative") -> Optional[RiskTarget]:
        if opposing is None:
            return None
        
        buf = self._stop_buffer(vol)
        
        if zone.ztype in [ZoneType.BZ, ZoneType.GDZ]:
            stop = zone.distal - buf * atr_x
        else:
            stop = zone.distal + buf * atr_x
        
        target = opposing.proximal if target_mode == "conservative" else opposing.distal
        
        risk = abs(entry - stop)
        reward = abs(target - entry)
        rr = reward / max(risk, 1e-9)
        
        zone.stop = stop
        zone.target = target
        zone.rr = rr
        
        return RiskTarget(entry=entry, stop=stop, target=target, rr=rr, target_mode=target_mode)


# ==============================================================================
# ENTRY GATE
# ==============================================================================

class EntryGate:
    def __init__(self, cfg: Config):
        self.cfg = cfg
    
    def passes_hard_gates(self, zone: Zone, ctx: TrendContext) -> Tuple[bool, Optional[str]]:
        if zone.invalidated:
            return False, "INVALIDATED_TRUE_BREAK"
        if zone.replaced_by_composite:
            return False, "REPLACED_BY_COMPOSITE"
        if zone.base_len and zone.base_len >= self.cfg.badzone_base_len:
            return False, "BADZONE"
        if not zone.removes_structure:
            return False, "NO_STRUCTURE_REMOVAL"
        if zone.rr and zone.rr < self.cfg.rr_min:
            return False, "RR_BELOW_MIN"
        if zone.tf == TF.X and zone.retest_count > zone.execute_retest_limit:
            return False, "EXECUTE_NOT_FRESH"
        if zone.ztype in [ZoneType.BZ, ZoneType.GDZ] and not ctx.allow_long:
            return False, "TREND_BLOCKS_LONG"
        if zone.ztype in [ZoneType.SZ, ZoneType.GSZ] and not ctx.allow_short:
            return False, "TREND_BLOCKS_SHORT"
        return True, None


# ==============================================================================
# PIPELINE v3.1.1
# ==============================================================================

class SDEnginePipeline:
    """Full orchestration pipeline with v3.1.1 fixes."""
    
    def __init__(self, cfg: Optional[Config] = None):
        self.cfg = cfg or Config()
        self.detector = ZoneDetector(self.cfg)
        self.qualifier = ZoneQualifier(self.cfg)
        self.gap_module = GapModule(self.cfg)
        self.ranker = ZoneRanker(self.cfg)
        self.rr_engine = RRTargetEngine(self.cfg)
        self.entry_gate = EntryGate(self.cfg)
        self.multi_zone = MultiZoneHandler(self.cfg)

    
    
    def run(self, symbol: str, tf: TF, cs: CandleSeries,
            ctx: TrendContext, entry_price: float,
            opposing_zones: Optional[List[Zone]] = None) -> List[Zone]:
        """
        Run full pipeline with v3.1.1 fixes.
        Returns: Ranked list of qualified zones (composites replace overlapped originals).
        """
        
        # 1. Calculate ATR and EMA
        atr_vals = atr(cs.h, cs.l, cs.c, self.cfg.atr_period)
        atr_now = float(atr_vals[-1]) if atr_vals and atr_vals[-1] else 1.0
        
        # EMA for regime classification (v3.1)
        atr_ema = ema([a if a else 0.0 for a in atr_vals], 20)
        atr_avg = float(atr_ema[-1]) if atr_ema and atr_ema[-1] else atr_now
        vol = volatility_regime(atr_now, atr_avg, self.cfg)
        
        # EMA-20 of close for confluence
        close_ema = ema(cs.c, 20)
        ema_20 = float(close_ema[-1]) if close_ema and close_ema[-1] else None
        
        # 2. Detect zones
        zones = self.detector.detect(symbol, tf, cs)
        gap_zones = self.gap_module.detect(symbol, tf, cs, vol, opposing_zones=zones)
        
        zones.extend(gap_zones)
        
        # 3. v3.1.1 FIX: Process overlaps BEFORE qualification
        # This ensures composites are scored, not originals
        resolved_zones, replaced_ids = self.multi_zone.process_overlaps(zones, atr_now)
        
        # Mark original zones as replaced
        for z in zones:
            if z.zone_id in replaced_ids:
                z.replaced_by_composite = True
        
        # 4. Qualify zones (only non-replaced)
        all_zones = zones + [z for z in resolved_zones if z.is_composite]
        
        for zone in all_zones:
            if zone.replaced_by_composite:
                continue
            
            zone.bars_since = cs.n - zone.created_idx
            self.qualifier.update_violation(cs, zone)
            self.qualifier.update_retest(cs, zone)
            
            opp_distal = None
            opp_prox = None
            if opposing_zones:
                for oz in opposing_zones:
                    if zone.ztype in [ZoneType.BZ, ZoneType.GDZ] and oz.ztype in [ZoneType.SZ, ZoneType.GSZ]:
                        opp_distal = oz.distal
                        opp_prox = oz.proximal
                        break
                    elif zone.ztype in [ZoneType.SZ, ZoneType.GSZ] and oz.ztype in [ZoneType.BZ, ZoneType.GDZ]:
                        opp_distal = oz.distal
                        opp_prox = oz.proximal
                        break
            
            self.qualifier.compute_structure_removal(cs, zone, opp_distal, opp_prox)
            
            # Gap session acceptance (v3.1.1: CORRECTED)
            if zone.ztype in [ZoneType.GDZ, ZoneType.GSZ]:
                self.gap_module.check_session_acceptance(cs, zone, zone.distal)
            
            opp = opposing_zones[0] if opposing_zones else None
            self.rr_engine.compute(zone, entry_price, atr_now, vol, opp)
            
            if opp:
                zone.distance_to_opposing_atr = abs(entry_price - opp.distal) / atr_now
            
            if cs.n >= self.cfg.approach_window:
                ranges = [cs.h[i] - cs.l[i] for i in range(cs.n - self.cfg.approach_window, cs.n)]
                zone.approach_speed = (sum(ranges) / len(ranges)) / atr_now
        
        # 5. Find consecutive stacks
        self.multi_zone.find_consecutive_stack(all_zones, atr_now)
        
        # 6. Score zones (with EMA confluence)
        for zone in all_zones:
            if not zone.replaced_by_composite:
                self.ranker.score(zone, ctx, vol, ema_20)
        
        # 7. Filter and rank
        valid = [z for z in all_zones if z.state != ZoneState.RED and not z.replaced_by_composite]
        return self.ranker.rank(valid, entry_price)





def format_all_zone_ranges(zones: List[Zone], df: pd.DataFrame, is_execute: bool = True) -> Dict[str, list]:
    """
    Returns:
      {
        "buy_zones":  [ [ {time,price}, {time,price} ], ... ],
        "sell_zones": [ [ {time,price}, {time,price} ], ... ],
      }
    """
    buy_zones = []
    sell_zones = []
    # result = filter_buy_sell_zones_v2(zones, is_execute=is_execute)
    # filtered_buy = result["BUY"]
    # filtered_sell = result["SELL"]

    lbs = -1 # if is_execute else -1
    # safety clamp
    if len(df) < abs(lbs):
        lbs = -1

    

    for z in (zones):
        if z is None:
            continue

        # --- start time ---
        if z.created_ts is not None:
            start_ts = int(z.created_ts)
        else:
            start_idx = z.created_idx if z.created_idx is not None else z.base_start
            if start_idx is None:
                continue
            start_ts = int(df["unix_timestamp"].iloc[int(start_idx - 1)])

        # --- zone band points ---
        if (z.base_end + 1) < len(df):
            end_ts = int(df["unix_timestamp"].iloc[z.base_end + 1])
        else:
            end_ts = int(df["unix_timestamp"].iloc[z.base_end])
        point1 = {"time": start_ts, "price": float(z.low_edge)}
        point2 = {"time": end_ts,   "price": float(z.high_edge)}
        band = [point1, point2]

        # --- segregation ---
        if z.ztype in (ZoneType.BZ, ZoneType.GDZ):
            buy_zones.append(band)
        elif z.ztype in (ZoneType.SZ, ZoneType.GSZ):
            sell_zones.append(band)
        # else:
        #     # unknown type -> ignore (or log)
        #     continue
    
    return {"Buy": buy_zones, "Sell": sell_zones}


def format_zone_ranges(zones: List[Zone], df: pd.DataFrame, is_execute: bool = True) -> Dict[str, list]:
    """
    Returns:
      {
        "buy_zones":  [ [ {time,price}, {time,price} ], ... ],
        "sell_zones": [ [ {time,price}, {time,price} ], ... ],
      }
    """
    cs = CandleSeries(
        o=df['open'].tolist(),
        h=df['high'].tolist(),
        l=df['low'].tolist(),
        c=df['close'].tolist()
    )
    buy_zones = []
    sell_zones = []
    result = filter_buy_sell_zones_v2(zones, is_execute=is_execute, cs=cs)
    filtered_buy = result["BUY"]
    filtered_sell = result["SELL"]

    lbs = -3 if is_execute else -1
    # safety clamp
    if len(df) < abs(lbs):
        lbs = -1
    
    if not is_execute:
        if len(filtered_buy) > 1:
            filtered_buy = [filtered_buy[0]]
        if len(filtered_sell) > 1:
            filtered_sell = [filtered_sell[0]]

    end_ts = int(df["unix_timestamp"].iloc[lbs])

    for z in (filtered_buy + filtered_sell):
        if z is None:
            continue
        # --- start time ---
        if z.created_ts is not None:
            start_ts = int(z.created_ts)
        else:
            start_idx = z.created_idx if z.created_idx is not None else z.base_start
            if start_idx is None:
                continue
            start_ts = int(df["unix_timestamp"].iloc[int(start_idx)])

        # --- zone band points ---
        point1 = {"time": start_ts, "price": float(z.low_edge)}
        point2 = {"time": end_ts,   "price": float(z.high_edge)}
        band = [point1, point2]
        # --- segregation ---
        if z.ztype in (ZoneType.BZ, ZoneType.GDZ):
            buy_zones.append(band)
        elif z.ztype in (ZoneType.SZ, ZoneType.GSZ):
            sell_zones.append(band)
        # else:
        #     # unknown type -> ignore (or log)
        #     continue
    
    return {"Buy": buy_zones, "Sell": sell_zones}



def format_zone_ranges_with_setup(zones: List[Zone], df: pd.DataFrame, is_execute: bool = True) -> Dict[str, list]:
    """
    Returns:
      {
        "buy_zones":  [ [ {time,price}, {time,price} ], ... ],
        "sell_zones": [ [ {time,price}, {time,price} ], ... ],
      }
    """
    cs = CandleSeries(
        o=df['open'].tolist(),
        h=df['high'].tolist(),
        l=df['low'].tolist(),
        c=df['close'].tolist()
    )
    buy_zones = []
    sell_zones = []
    result = filter_buy_sell_zones_v2(zones, is_execute=is_execute, cs=cs)
    filtered_buy = result["BUY"]
    filtered_sell = result["SELL"]

    lbs = -3 if is_execute else -1
    # safety clamp
    if len(df) < abs(lbs):
        lbs = -1

    end_ts = int(df["unix_timestamp"].iloc[lbs])

    for z in (filtered_buy + filtered_sell):
        if z is None:
            continue
        # --- start time ---
        if z.created_ts is not None:
            start_ts = int(z.created_ts)
        else:
            start_idx = z.created_idx if z.created_idx is not None else z.base_start
            if start_idx is None:
                continue
            start_ts = int(df["unix_timestamp"].iloc[int(start_idx)])

        # --- zone band points ---
        point1 = {"time": start_ts, "price": float(z.low_edge)}
        point2 = {"time": end_ts,   "price": float(z.high_edge)}
        # band = [point1, point2]
        band = {
            "range": [point1, point2],
            "meta": {
                "zone_id": getattr(z, "zone_id", None),
                "symbol": getattr(z, "symbol", None),

                # zone descriptors
                "ztype": z.ztype.value if hasattr(z.ztype, "value") else str(z.ztype),
                "proximal": float(getattr(z, "proximal", 0.0) or 0.0),
                "distal": float(getattr(z, "distal", 0.0) or 0.0),

                # what you printed earlier
                "state": z.state.name if hasattr(z.state, "name") else str(getattr(z, "state", "")),
                "final_score": float(getattr(z, "final_score", 0.0) or 0.0),
                "quality_priority": (z.quality_priority.name
                                    if getattr(z, "quality_priority", None) is not None and hasattr(z.quality_priority, "name")
                                    else str(getattr(z, "quality_priority", ""))),
                "age_class": (z.age_class.name
                            if getattr(z, "age_class", None) is not None and hasattr(z.age_class, "name")
                            else str(getattr(z, "age_class", ""))),

                # optional extra fields commonly useful on UI
                "zone_v38_score": float(getattr(z, "zone_v38_score", 0.0) or 0.0),
                "gap_composite_score": (float(getattr(z, "gap_composite_score", 0.0) or 0.0)
                                        if getattr(z, "gap_composite_score", None) is not None
                                        else None),
                "nesting_tier": (z.nesting_tier.name
                                if getattr(z, "nesting_tier", None) is not None and hasattr(z.nesting_tier, "name")
                                else "NONE"),
                "pattern_validated": bool(getattr(z, "pattern_validated", False)),
                "final_weighted_score": float(getattr(z, "final_weighted_score", 0.0) or 0.0),
                "block_reason": getattr(z, "block_reason", None),
            }
        }
        

        # --- segregation ---
        if z.ztype in (ZoneType.BZ, ZoneType.GDZ):
            buy_zones.append(band)
        elif z.ztype in (ZoneType.SZ, ZoneType.GSZ):
            sell_zones.append(band)
        # else:
        #     # unknown type -> ignore (or log)
        #     continue
    
    return {"Buy": buy_zones, "Sell": sell_zones}
# ==============================================================================
# EXAMPLE
# ==============================================================================
def process_zones(file_path : str, time_frame: TF, last_d_time):

    df, violation_df = load_preprocess_data(file_path, last_d_time)
    
    cs = CandleSeries(
        o=df['open'].tolist(),
        h=df['high'].tolist(),
        l=df['low'].tolist(),
        c=df['close'].tolist(),
        ts=df['unix_timestamp'].tolist()
    )

    violation_cs = CandleSeries(
        o=violation_df['open'].tolist(),
        h=violation_df['high'].tolist(),
        l=violation_df['low'].tolist(),
        c=violation_df['close'].tolist(),
        ts=violation_df['unix_timestamp'].tolist()
    )
    # ctx = TrendContext(
    #     regime_E=TrendRegime.UP, regime_A=TrendRegime.UP, regime_X=TrendRegime.UP,
    #     quadrant_E=Quadrant.Q3, quadrant_A=Quadrant.Q3, quadrant_X=Quadrant.Q3,
    #     allow_long=True, allow_short=False
    # )
    # pipeline = SDEnginePipeline()
    detector = ZoneDetector(Config())
    qualifier = ZoneQualifier(Config())
    multi_zone = MultiZoneHandler(Config())
    gap_module = GapModule()

    atr_vals = atr(cs.h, cs.l, cs.c, Config().atr_period)
    atr_now = float(atr_vals[-1]) if atr_vals and atr_vals[-1] else 1.0
        
    # EMA for regime classification (v3.1)
    atr_ema = ema([a if a else 0.0 for a in atr_vals], 20)
    atr_avg = float(atr_ema[-1]) if atr_ema and atr_ema[-1] else atr_now
    vol = volatility_regime(atr_now, atr_avg, Config())
        
    # EMA-20 of close for confluence
    close_ema = ema(cs.c, 20)
    ema_20 = float(close_ema[-1]) if close_ema and close_ema[-1] else None

    zones = detector.detect("TEST", time_frame, cs) # ctx, entry_price=df['close'].iloc[-1]

    if time_frame == TF.X:
        gap_zones = gap_module.detect("TEST", time_frame, cs, vol)
        # print(gap_zones, "llllllllllllllllllllllllllllllllllllllllllllllllllllllll")
        zones.extend(gap_zones)
        
    # resolved_zones, replaced_ids = multi_zone.process_overlaps(zones, atr_now)
    opp_distal = None
    # for z in zones:
    #     if z.zone_id in replaced_ids:
    #         z.replaced_by_composite = True
        
    # # 4. Qualify zones (only non-replaced)
    all_zones = zones #+ [z for z in resolved_zones if z.is_composite]
    # all_zones = zones + [z for z in resolved_zones if z.is_composite]
        
    for zone in all_zones:
        # if zone.replaced_by_composite:
            # continue
        
        zone.bars_since = cs.n - zone.created_idx
        qualifier.update_violation(violation_cs, zone)
        qualifier.update_retest(violation_cs, zone)

        qualifier.compute_structure_removal(violation_cs, zone, opp_distal)

        if zone.ztype in [ZoneType.GDZ, ZoneType.GSZ] and time_frame == TF.X:
            gap_module.check_session_acceptance(violation_cs, zone, zone.distal)

        
        # for z in zones:
        #     qualifier.update_violation(cs, z)
    # qualifier.update_violation(("TEST", TF.X, cs, ctx, zones)
    vpct = 50 if time_frame == TF.X else 95
    exe_frame = True if time_frame == TF.X else False

    # for z in all_zones:
        # print(z.penetration_pct)

    valid = [z for z in all_zones if z.state != ZoneState.RED and z.penetration_pct <= vpct] # 

    # print(all_zones)
    # print("#################################################")
    # print(valid)
    # print("#################################################")
    proc_zones = format_zone_ranges(valid, df, exe_frame)
    return proc_zones


def processs_all_zones(file_path : str, time_frame: TF, last_d_time):
    df, violation_df = load_preprocess_data(file_path, last_d_time)
    
    cs = CandleSeries(
        o=df['open'].tolist(),
        h=df['high'].tolist(),
        l=df['low'].tolist(),
        c=df['close'].tolist(),
        ts=df['unix_timestamp'].tolist()
        
    )

    violation_cs = CandleSeries(
        o=violation_df['open'].tolist(),
        h=violation_df['high'].tolist(),
        l=violation_df['low'].tolist(),
        c=violation_df['close'].tolist(),
        ts=violation_df['unix_timestamp'].tolist()
    )
    # ctx = TrendContext(
    #     regime_E=TrendRegime.UP, regime_A=TrendRegime.UP, regime_X=TrendRegime.UP,
    #     quadrant_E=Quadrant.Q3, quadrant_A=Quadrant.Q3, quadrant_X=Quadrant.Q3,
    #     allow_long=True, allow_short=False
    # )
    # pipeline = SDEnginePipeline()
    detector = ZoneDetector(Config())
    qualifier = ZoneQualifier(Config())
    multi_zone = MultiZoneHandler(Config())
    gap_module = GapModule()

    atr_vals = atr(cs.h, cs.l, cs.c, Config().atr_period)
    atr_now = float(atr_vals[-1]) if atr_vals and atr_vals[-1] else 1.0
        
    # EMA for regime classification (v3.1)
    atr_ema = ema([a if a else 0.0 for a in atr_vals], 20)
    atr_avg = float(atr_ema[-1]) if atr_ema and atr_ema[-1] else atr_now
    vol = volatility_regime(atr_now, atr_avg, Config())
        
    # EMA-20 of close for confluence
    close_ema = ema(cs.c, 20)
    ema_20 = float(close_ema[-1]) if close_ema and close_ema[-1] else None

    zones = detector.detect("TEST", time_frame, cs) # ctx, entry_price=df['close'].iloc[-1]

    if time_frame == TF.X:
        gap_zones = gap_module.detect("TEST", time_frame, cs, vol)
        zones.extend(gap_zones)
        
    # resolved_zones, replaced_ids = multi_zone.process_overlaps(zones, atr_now)
    opp_distal = None
    # for z in zones:
    #     if z.zone_id in replaced_ids:
    #         z.replaced_by_composite = True
        
    # # 4. Qualify zones (only non-replaced)
    all_zones = zones #+ [z for z in resolved_zones if z.is_composite]
        
    for zone in all_zones:
        # if zone.replaced_by_composite:
        #     continue
        
        zone.bars_since = cs.n - zone.created_idx
        qualifier.update_violation(violation_cs, zone)
        qualifier.update_retest(violation_cs, zone)

        qualifier.compute_structure_removal(violation_cs, zone, opp_distal)

        # if zone.ztype in [ZoneType.GDZ, ZoneType.GSZ] and time_frame == TF.X:
        #     gap_module.check_session_acceptance(cs, zone, zone.distal)

        
        # for z in zones:
        #     qualifier.update_violation(cs, z)
    # qualifier.update_violation(("TEST", TF.X, cs, ctx, zones)
    vpct = 50 if time_frame == TF.X else 95
    exe_frame = True if time_frame == TF.X else False

    valid = [z for z in all_zones] # if z.state != ZoneState.RED and z.penetration_pct <= vpct 
    proc_zones = format_all_zone_ranges(valid, df, exe_frame)
    return proc_zones



def process_qualified_zones(file_path : str, time_frame: TF, last_d_time, time_list: List, tick: str):
    # mttc = MultiTimeframeTrendCalculator()
    # mttc._set_symbol_and_timeframe(time_list, tick, last_d_time)

    # trend_context = mttc.calculate_full_context()

    df, violation_df = load_preprocess_data(file_path, last_d_time)
    
    cs = CandleSeries(
        o=df['open'].tolist(),
        h=df['high'].tolist(),
        l=df['low'].tolist(),
        c=df['close'].tolist(),
        ts=df['unix_timestamp'].tolist()
    )

    violation_cs = CandleSeries(
        o=violation_df['open'].tolist(),
        h=violation_df['high'].tolist(),
        l=violation_df['low'].tolist(),
        c=violation_df['close'].tolist(),
        ts=violation_df['unix_timestamp'].tolist()
    )
    # ctx = TrendContext(
    #     regime_E=TrendRegime.UP, regime_A=TrendRegime.UP, regime_X=TrendRegime.UP,
    #     quadrant_E=Quadrant.Q3, quadrant_A=Quadrant.Q3, quadrant_X=Quadrant.Q3,
    #     allow_long=True, allow_short=False
    # )
    # pipeline = SDEnginePipeline()
    detector = ZoneDetector(Config())
    qualifier = ZoneQualifier(Config())
    multi_zone = MultiZoneHandler(Config())
    gap_module = GapModule()
    # zone_scorer_v38 = ZoneScorerV38()

    atr_vals = atr(cs.h, cs.l, cs.c, Config().atr_period)
    atr_now = float(atr_vals[-1]) if atr_vals and atr_vals[-1] else 1.0
        
    # EMA for regime classification (v3.1)
    atr_ema = ema([a if a else 0.0 for a in atr_vals], 20)
    atr_avg = float(atr_ema[-1]) if atr_ema and atr_ema[-1] else atr_now
    vol = volatility_regime(atr_now, atr_avg, Config())
        
    # EMA-20 of close for confluence
    close_ema = ema(cs.c, 20)
    ema_20 = float(close_ema[-1]) if close_ema and close_ema[-1] else None

    zones = detector.detect("TEST", time_frame, cs) # ctx, entry_price=df['close'].iloc[-1]

    if time_frame == TF.X:
        gap_zones = gap_module.detect("TEST", time_frame, cs, vol, opposing_zones=zones)
        # print(gap_zones, "llllllllllllllllllllllllllllllllllllllllllllllllllllllll")
        zones.extend(gap_zones)
        
    # resolved_zones, replaced_ids = multi_zone.process_overlaps(zones, atr_now)
    opp_distal = None
    # for z in zones:
        # if z.zone_id in replaced_ids:
            # z.replaced_by_composite = True
        
    # # 4. Qualify zones (only non-replaced)
    all_zones = zones #+ [z for z in resolved_zones if z.is_composite]
    # print(len(all_zones))
    for zone in all_zones:
        # if zone.replaced_by_composite:
        #     continue
        
        zone.bars_since = cs.n - zone.created_idx
        qualifier.update_violation(violation_cs, zone)
        qualifier.update_retest(violation_cs, zone)

        qualifier.compute_structure_removal(violation_cs, zone, opp_distal)

        if zone.ztype in [ZoneType.GDZ, ZoneType.GSZ] and time_frame == TF.X:
            gap_module.check_session_acceptance(cs, zone, zone.distal)

        print(zone.ztype ,zone.proximal, zone.distal, zone.state, zone.violation, zone.block_reason)
        # for z in zones:
        #     qualifier.update_violation(cs, z)
    # qualifier.update_violation(("TEST", TF.X, cs, ctx, zones)
    vpct = 50 if time_frame == TF.X else 95
    exe_frame = True if time_frame == TF.X else False

    # for items in all_zones:
    #     if items.ztype in [ZoneType.GDZ, ZoneType.GSZ]:
    #         print(items.state, items.penetration_pct)

    valid = [z for z in all_zones if z.state != ZoneState.RED and (0.0 <= z.penetration_pct <= vpct)] # 
    # invalid_zones = [z for z in all_zones if z not in valid]#.state == ZoneState.RED and z.penetration_pct > vpct]
    qualified_zones = []
    for v_zones in valid:
        check_valid = qualifier.check_preceding_zone_vilation(v_zones, all_zones, cs)
        if check_valid:
            # v_zones.zone_v38_score = zone_scorer_v38.calculate_score(v_zones)
            qualified_zones.append(v_zones)
    # invalid_zones = sorted(invalid_zones, key=lambda x: x.created_ts, reverse=True)
    # for inv in invalid_zones:
    #     print(inv.ztype, inv.proximal, inv.distal, inv.created_ts)


    proc_zones = format_zone_ranges(qualified_zones, df, exe_frame)
    return proc_zones



def process_trend_zones(file_path : str, time_frame: TF, last_d_time, for_frps: bool = True):

    df, violation_df = load_preprocess_data(file_path, last_d_time)
    
    cs = CandleSeries(
        o=df['open'].tolist(),
        h=df['high'].tolist(),
        l=df['low'].tolist(),
        c=df['close'].tolist(),
        ts=df['unix_timestamp'].tolist()
    )

    violation_cs = CandleSeries(
        o=violation_df['open'].tolist(),
        h=violation_df['high'].tolist(),
        l=violation_df['low'].tolist(),
        c=violation_df['close'].tolist(),
        ts=violation_df['unix_timestamp'].tolist()
    )
    # ctx = TrendContext(
    #     regime_E=TrendRegime.UP, regime_A=TrendRegime.UP, regime_X=TrendRegime.UP,
    #     quadrant_E=Quadrant.Q3, quadrant_A=Quadrant.Q3, quadrant_X=Quadrant.Q3,
    #     allow_long=True, allow_short=False
    # )
    # pipeline = SDEnginePipeline()
    detector = ZoneDetector(Config())
    qualifier = ZoneQualifier(Config())
    multi_zone = MultiZoneHandler(Config())
    gap_module = GapModule()

    atr_vals = atr(cs.h, cs.l, cs.c, Config().atr_period)
    atr_now = float(atr_vals[-1]) if atr_vals and atr_vals[-1] else 1.0
        
    # EMA for regime classification (v3.1)
    atr_ema = ema([a if a else 0.0 for a in atr_vals], 20)
    atr_avg = float(atr_ema[-1]) if atr_ema and atr_ema[-1] else atr_now
    vol = volatility_regime(atr_now, atr_avg, Config())
        
    # EMA-20 of close for confluence
    close_ema = ema(cs.c, 20)
    ema_20 = float(close_ema[-1]) if close_ema and close_ema[-1] else None

    zones = detector.detect("TEST", time_frame, cs) # ctx, entry_price=df['close'].iloc[-1]
    if time_frame == TF.X:
        gap_zones = gap_module.detect("TEST", time_frame, cs, vol, opposing_zones=zones)
        zones.extend(gap_zones)
        
    # resolved_zones, replaced_ids = multi_zone.process_overlaps(zones, atr_now)
    opp_distal = None
    # for z in zones:
    #     if z.zone_id in replaced_ids:
    #         z.replaced_by_composite = True
        
    # # 4. Qualify zones (only non-replaced)
    all_zones = zones #+ [z for z in resolved_zones if z.is_composite]
    # all_zones = zones + [z for z in resolved_zones if z.is_composite]
        
    for zone in all_zones:
        # if zone.replaced_by_composite:
            # continue
        
        zone.bars_since = cs.n - zone.created_idx
        qualifier.update_violation(violation_cs, zone)
        qualifier.update_retest(violation_cs, zone)

        qualifier.compute_structure_removal(violation_cs, zone, opp_distal)

        if zone.ztype in [ZoneType.GDZ, ZoneType.GSZ] and time_frame == TF.X:
            gap_module.check_session_acceptance(cs, zone, zone.distal)

        
        # for z in zones:
        #     qualifier.update_violation(cs, z)
    # qualifier.update_violation(("TEST", TF.X, cs, ctx, zones)
    vpct = 50 if time_frame == TF.X else 95
    exe_frame = True if time_frame == TF.X else False

    valid = [z for z in all_zones if z.state != ZoneState.RED and z.penetration_pct <= vpct] #
    valid = [z for z in valid if not z.invalidated]
    result = filter_buy_sell_zones_v2(valid, is_execute=exe_frame, cs=cs, for_frps=for_frps) 
    # proc_zones = format_zone_ranges(valid, df, exe_frame)
    return result, all_zones







def process_qualified_zones_setup(file_path : str, time_frame: TF, last_d_time) -> list[Zone]:

    df, violation_df = load_preprocess_data(file_path, last_d_time)
    
    cs = CandleSeries(
        o=df['open'].tolist(),
        h=df['high'].tolist(),
        l=df['low'].tolist(),
        c=df['close'].tolist(),
        ts=df['unix_timestamp'].tolist()
    )

    violation_cs = CandleSeries(
        o=violation_df['open'].tolist(),
        h=violation_df['high'].tolist(),
        l=violation_df['low'].tolist(),
        c=violation_df['close'].tolist(),
        ts=violation_df['unix_timestamp'].tolist()
    )
    # ctx = TrendContext(
    #     regime_E=TrendRegime.UP, regime_A=TrendRegime.UP, regime_X=TrendRegime.UP,
    #     quadrant_E=Quadrant.Q3, quadrant_A=Quadrant.Q3, quadrant_X=Quadrant.Q3,
    #     allow_long=True, allow_short=False
    # )
    # pipeline = SDEnginePipeline()
    detector = ZoneDetector(Config())
    qualifier = ZoneQualifier(Config())
    multi_zone = MultiZoneHandler(Config())
    gap_module = GapModule()

    atr_vals = atr(cs.h, cs.l, cs.c, Config().atr_period)
    atr_now = float(atr_vals[-1]) if atr_vals and atr_vals[-1] else 1.0
    # atr_X_val = atr_X[-1] if atr_X[-1] else 1.0
        
    # EMA for regime classification (v3.1)
    atr_ema = ema([a if a else 0.0 for a in atr_vals], 20)
    atr_avg = float(atr_ema[-1]) if atr_ema and atr_ema[-1] else atr_now
    vol = volatility_regime(atr_now, atr_avg, Config())
        
    # EMA-20 of close for confluence
    close_ema = ema(cs.c, 20)
    ema_20 = float(close_ema[-1]) if close_ema and close_ema[-1] else None

    zones = detector.detect("TEST", time_frame, cs) # ctx, entry_price=df['close'].iloc[-1]

    if time_frame == TF.X:
        gap_zones = gap_module.detect("TEST", time_frame, cs, vol, opposing_zones=zones)
        # print(gap_zones, "llllllllllllllllllllllllllllllllllllllllllllllllllllllll")
        zones.extend(gap_zones)
        
    # resolved_zones, replaced_ids = multi_zone.process_overlaps(zones, atr_now)
    opp_distal = None
    # for z in zones:
        # if z.zone_id in replaced_ids:
            # z.replaced_by_composite = True
        
    # # 4. Qualify zones (only non-replaced)
    all_zones = zones #+ [z for z in resolved_zones if z.is_composite]
        
    for zone in all_zones:
        # if zone.replaced_by_composite:
        #     continue
        zone.bars_since = cs.n - zone.created_idx
        qualifier.update_violation(violation_cs, zone)
        qualifier.update_retest(violation_cs, zone)

        qualifier.compute_structure_removal(violation_cs, zone, opp_distal)

        if zone.ztype in [ZoneType.GDZ, ZoneType.GSZ] and time_frame == TF.X:
            gap_module.check_session_acceptance(cs, zone, zone.distal)

        
        # for z in zones:
        #     qualifier.update_violation(cs, z)
    # qualifier.update_violation(("TEST", TF.X, cs, ctx, zones)
    

    # for items in all_zones:
    #     if items.ztype in [ZoneType.GDZ, ZoneType.GSZ]:
    #         print(items.state, items.penetration_pct)
    vpct = 50 if time_frame == TF.X else 95
    exe_frame = True if time_frame == TF.X else False

    valid = [z for z in all_zones if z.state != ZoneState.RED and (0.0 <= z.penetration_pct <= vpct)] # 
    # invalid_zones = [z for z in all_zones if z not in valid]#.state == ZoneState.RED and z.penetration_pct > vpct]
    qualified_zones = []
    for v_zones in valid:
        check_valid = qualifier.check_preceding_zone_vilation(v_zones, all_zones, cs)
        if check_valid: qualified_zones.append(v_zones)
    # invalid_zones = sorted(invalid_zones, key=lambda x: x.created_ts, reverse=True)
    # for inv in invalid_zones:
    #     print(inv.ztype, inv.proximal, inv.distal, inv.created_ts)
    multi_zone.process_overlaps(zones=qualified_zones, atr_x=atr_now)
    multi_zone.find_consecutive_stack(zones=qualified_zones, atr_x=atr_now)
    


    # proc_zones = format_zone_ranges(qualified_zones, df, exe_frame)
    return qualified_zones, all_zones



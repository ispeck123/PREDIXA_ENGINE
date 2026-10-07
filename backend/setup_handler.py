from scripts.stock_utils import utility
import pandas_ta as ta
import pandas as pd
import numpy as np
from scipy.signal import argrelextrema
from typing import Optional


class Setup_Handler:
    def __init__(self, stock_tick, country_dir, last_d_time, time_frame, exe_tf):
        self.stock_tick = stock_tick
        self.last_d_time = last_d_time
        self.country_dir = country_dir
        self.exe_tf = exe_tf
        self.time_frame = time_frame
        self.util = utility(time_frame)

    def get_execute_df(self):
        exe_file_path = f"{self.country_dir}/processed_data_files/{self.stock_tick}_{self.exe_tf}.csv"
        df = pd.read_csv(exe_file_path)
        df['timestamp'] = pd.to_datetime(df['timestamp'], dayfirst = True)
        df = df[df.timestamp <= self.last_d_time]
        return df

    def overlaps_strict(self, a, b):
        # Treats (x2 == y1) as NO overlap (i.e., no positive-length intersection)
        (x1, x2), (y1, y2) = a, b
        return max(x1, y1) < min(x2, y2)
    
    def compute_swings(self, order: int = 1):
        """
        Precompute swing highs/lows based only on past candles.
        order = how many candles left/right to confirm a swing.
        """
        # Swing lows (local minima)
        df = self.get_execute_df()
        df['swing_low'] = np.nan
        lows_idx = argrelextrema(df['low'].values, np.less_equal, order=order)[0]
        df.loc[lows_idx, 'swing_low'] = df['low'].iloc[lows_idx]

        # Swing highs (local maxima)
        df['swing_high'] = np.nan
        highs_idx = argrelextrema(df['high'].values, np.greater_equal, order=order)[0]
        df.loc[highs_idx, 'swing_high'] = df['high'].iloc[highs_idx]
        
        return df

    def _atr14(self, df: pd.DataFrame) -> float:
        h, l, c = df['high'].values, df['low'].values, df['close'].values
        pc = np.r_[c[-2], c[:-1]]  # previous close aligned
        tr = np.maximum(h - l, np.maximum(np.abs(h - pc), np.abs(l - pc)))
        return float(pd.Series(tr).rolling(14, min_periods=1).mean().iloc[-1])

    def _calc_stop_params(self, entry: float, df, tick_size: float = 0.05,
                      k_spread=2.0, k_atr=0.20, k_tick=1.0):
        spread = float(df.get('ask', pd.Series([0])).iloc[-1]) - float(df.get('bid', pd.Series([0])).iloc[-1])
        atr = self._atr14(df)
        # Percent-of-entry components
        by_spread = (k_spread * max(spread, 0)) / entry if entry else 0
        by_atr    = (k_atr * atr) / entry if entry else 0
        by_tick   = (k_tick * tick_size) / entry if entry else 0
        buffer_pct = max(by_spread, by_atr, by_tick)
        min_move_pct = max(0.5 * buffer_pct, by_tick)  # avoid smaller than a tick
        return buffer_pct, min_move_pct

    def get_consecute_percent_as_per_cmp(self, cmp_price):
        if 0 <= cmp_price <= 200:
            return 0.03
        elif 200 < cmp_price <= 350:
            return 0.025
        elif 350 < cmp_price <= 500:
            return 0.02
        elif 500 < cmp_price <= 1000:
            return 0.0175
        elif 1000 < cmp_price <= 2000:
            return 0.015
        elif 2000 < cmp_price <= 5000:
            return 0.0125
        elif 5000 < cmp_price <= 10000:
            return 0.01
        elif 10000 < cmp_price <= 20000:
            return 0.0075
        elif 20000 < cmp_price <= 50000:
            return 0.005
        elif 50000 < cmp_price <= 100000:
            return 0.0001
        else:
            return 0.0005   
    
    def refine_stop(
        self,
        side: str,
        current_stop: float,
        entry: float,
        max_stop_pct: float = 0.03,   # kept for signature compatibility; not used
        buffer_pct: Optional[float] = None,
        min_move_pct: Optional[float] = None,
        allow_breakeven: bool = True   # kept for signature compatibility; not used
    ) -> float:
        """
        Simplified stop logic using recent swings only.

        BUY:
        - Choose the most-recent swing low strictly below current_stop.
        - New stop = swing_low * (1 - buffer_pct), clamped to < min(current_stop, entry).
        SELL:
        - Choose the most-recent swing high strictly above current_stop.
        - New stop = swing_high * (1 + buffer_pct), clamped to > max(current_stop, entry).

        - If no valid swing found or move < min_move_pct -> keep current_stop.
        """

        if side not in ("buy", "sell"):
            raise ValueError("side must be 'buy' or 'sell'")

        eps = 1e-9
        df = self.compute_swings()

        # Auto buffer/min-move if not provided (uses your existing helper)
        if buffer_pct is None or min_move_pct is None:
            auto_buf, auto_min = self._calc_stop_params(entry, df, tick_size=getattr(self, "tick_size", 0.05))
            buffer_pct = auto_buf if buffer_pct is None else buffer_pct
            min_move_pct = auto_min if min_move_pct is None else min_move_pct

        # Safety: non-negative buffer
        buffer_pct = max(0.0, float(buffer_pct))
        min_move_pct = 0.0 if min_move_pct is None else max(0.0, float(min_move_pct))

        def moved_enough(new_stop: float, old_stop: float) -> bool:
            if min_move_pct <= 0:
                return True
            base = max(abs(old_stop), eps)
            return abs(new_stop - old_stop) / base >= min_move_pct

        if side == "buy":
            # Want a swing low strictly below current_stop
            swings = df["swing_low"].dropna().astype(float)
            candidates = swings[swings < current_stop]
            if candidates.empty:
                return float(current_stop)

            # Most recent swing (assuming df is chronological)
            s = float(candidates.iloc[-1])
            proposed = s * (1 - buffer_pct)

            # Never allow stop >= entry or >= current_stop
            proposed = min(proposed, entry - eps, current_stop - eps)

            # If clamping killed the move, do nothing
            if proposed <= 0 or proposed >= current_stop - eps:
                return float(current_stop)

            return float(proposed) if moved_enough(proposed, current_stop) else float(current_stop)

        else:  # SELL
            # Want a swing high strictly above current_stop
            swings = df["swing_high"].dropna().astype(float)
            candidates = swings[swings > current_stop]
            if candidates.empty:
                return float(current_stop)

            s = float(candidates.iloc[-1])
            proposed = s * (1 + buffer_pct)

            # Never allow stop <= entry or <= current_stop
            proposed = max(proposed, entry + eps, current_stop + eps)

            if proposed <= current_stop + eps:
                return float(current_stop)

            return float(proposed) if moved_enough(proposed, current_stop) else float(current_stop)

    
    def check_consecute_overlap(self, range1, range2):
        """
        Check if two numeric ranges (tuples) overlap.

        Args:
            range1 (tuple): First range as (start, end).
            range2 (tuple): Second range as (start, end).

        Returns:
            bool: True if they overlap, False if they are completely separate.
        """
        start1, end1 = min(range1), max(range1)
        start2, end2 = min(range2), max(range2)
        return not (end1 < start2 or end2 < start1)

    def find_single_overlap_points(self, price_ranges, is_dz):
        # Sort the ranges by their starting point
        # price_ranges = sorted(price_ranges, key=lambda x: x[0])
        overlapping_points = []
        # Iterate over the sorted ranges and check for overlap
        for i in range(len(price_ranges)):
            for j in range(i + 1, len(price_ranges)):
                # Get the current pair of ranges
                range1 = price_ranges[i]
                range2 = price_ranges[j]

                if max(range1[0], range2[0]) <= min(range1[1], range2[1]):
                    # Calculate the overlapping range
                    overlap_start = max(range1[0], range2[0])
                    overlap_end = min(range1[1], range2[1])
                    # print("overlap_start overlap_end", overlap_start, overlap_end)
                    avg_point = max(overlap_start, overlap_end)
                    avg_point = round(avg_point, 2)
                    min_point = min(min(range1), min(range2))
                    overlapping_points.append(avg_point)
                    overlapping_points.append(min_point)
        # Return the list of single overlap points or an empty list if none
        if is_dz:
            return sorted(set(overlapping_points), reverse=True)
        else:
            return sorted(set(overlapping_points), reverse=False)

    def dynamic_percentage_distance(self, cmp, base_percentage=7.5, reference_cmp=500, k=0.1):
        dynamic_percentage = base_percentage / (1 + k * cmp / reference_cmp)
        return dynamic_percentage

    def get_consecutive_zones(self, conse_dz, conse_sz, cmp, is_DZ):
        # print(conse_sz, "#####################")
        found_conz_zone = False
        conz_entry = None
        stop_loss = None
        if is_DZ:
            if len(conse_dz) >= 2:
                conse_dz = sorted(conse_dz, reverse=True)
                # print("here.................88888888888888888", self.check_consecute_overlap(conse_dz[0], conse_dz[1]), self.exe_tf)
                if not self.check_consecute_overlap(conse_dz[0], conse_dz[1]):
                    print("not here.................9999999999999999999999999", conse_dz[0], conse_dz[1])
                    range1 = min(conse_dz[0])
                    range2 = max(conse_dz[1])
                    # print("not here.................9999999999999999999999999", conse_dz[0], conse_dz[1])
                    conz_entry = range2 # round((range1+range2)/2, 2)
                    stop_loss = min(conse_dz[1])
                    zone_diff = abs(range2 - range1)
                    conse_percent = self.get_consecute_percent_as_per_cmp(cmp)
                    within_per = zone_diff <= (cmp*conse_percent)
                    # print(within_per, ut.calculate_percentage_distance(cmp, conz_entry), self.dynamic_percentage_distance(self.cmp_price))
                    print(self.exe_tf, zone_diff, cmp*conse_percent, conse_percent, cmp, "###############################################")
                    print("$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$", within_per, self.util.calculate_percentage_distance(cmp, conz_entry), self.dynamic_percentage_distance(cmp)+3)
                    # if within_per and (self.util.calculate_percentage_distance(cmp, conz_entry) <= self.dynamic_percentage_distance(cmp)+3):
                    if within_per and (range2 <= conz_entry <= range1):
                        found_conz_zone = True
        else:
            if len(conse_sz) >= 2:
                conse_dz = sorted(conse_sz, reverse=False)
                if not self.check_consecute_overlap(conse_sz[0], conse_sz[1]):
                    range1 = max(conse_sz[0])
                    range2 = min(conse_sz[1])
                    conz_entry = range1
                    stop_loss = max(conse_sz[1])
                    zone_diff = abs(range2 - range1)
                    conse_percent = self.get_consecute_percent_as_per_cmp(cmp)
                    within_per = zone_diff <= (cmp*conse_percent)
                    print(zone_diff, cmp*conse_percent, "#########################################")
                    # print("$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$", within_per, self.util.calculate_percentage_distance(cmp, conz_entry), self.dynamic_percentage_distance(cmp)+3)
                    # if within_per and (self.util.calculate_percentage_distance(cmp, conz_entry) <= self.dynamic_percentage_distance(cmp)+3):
                    if within_per and (range1 <= conz_entry <= range2):
                        found_conz_zone = True

        return found_conz_zone, conz_entry, stop_loss


    def get_overlapping_zones(self, exe_dz, exe_sz, is_DZ):
        found_overlapping_zone = False
        Stop_loss = None
        entry = None
        if is_DZ:
            if len(exe_dz) >= 2:
                exe_dz = sorted(exe_dz, reverse=True)
                osp_strict = self.overlaps_strict(exe_dz[0], exe_dz[1])
                overlapping_avg_points = self.find_single_overlap_points(exe_dz, is_DZ)
                # print("overlapping points, buy", overlapping_avg_points)
                high_r = max(max(exe_dz[0]), max(exe_dz[1]))
                first_low_r = min(exe_dz[0])
                low_r = min(min(exe_dz[0]), min(exe_dz[1]))
                if len(overlapping_avg_points) > 1:
                    entry = max(overlapping_avg_points) #[0]
                    Stop_loss = min(sorted(exe_dz, reverse=True)[1])
                    if osp_strict and first_low_r <= entry <= high_r and low_r <= entry <= high_r:
                        found_overlapping_zone = True
                    if entry == Stop_loss:
                        Stop_loss = self.util.calculate_atr(self.get_execute_df(), entry)
        else:
            if len(exe_sz) >= 2:
                exe_sz = sorted(exe_sz, reverse=False)

                # print("exe_sz.............**************************************", exe_sz)
                osp_strict = self.overlaps_strict(exe_sz[0], exe_sz[1])
                overlapping_avg_points = self.find_single_overlap_points(exe_sz, is_DZ)
                # print("overlapping points, sell", overlapping_avg_points)
                high_r = max(max(exe_sz[0]), max(exe_sz[1]))
                first_low_r = min(exe_sz[0])
                low_r = min(min(exe_sz[0]), min(exe_sz[1]))
                if len(overlapping_avg_points) > 1:
                    entry = min(overlapping_avg_points[1:]) #[1]
                    Stop_loss = high_r # max(sorted(exe_sz, reverse=True)[1])
                    if osp_strict and low_r <= entry <= high_r and first_low_r <= entry <= high_r:
                        found_overlapping_zone = True
                    # if entry == Stop_loss:
                    #     Stop_loss = self.util.calculate_atr_sell(self.get_execute_df(), entry)

        return found_overlapping_zone, entry, Stop_loss
    
    
 
    
    def calculate_ema_zone(self, exe_dz, exe_sz, is_DZ):
        # ut = utility()
        found_ema_zone = False
        entry = None
        stop_loss = None
        df = self.get_execute_df()
        
        df['EMA_20'] = ta.ema(df['close'], length=20)
        if is_DZ:
            if len(exe_dz) > 0:
                start_t = max(df[df['low'] == min(exe_dz[0])]['timestamp'])
                interim_df = df[df['close'] == max(exe_dz[0])]['timestamp']
                if interim_df.empty:
                    interim_df = df[df['open'] == max(exe_dz[0])]['timestamp']
                end_t = max(interim_df)
                ema_df = df[df['timestamp'].between(start_t, end_t)]['EMA_20'].to_list()
                # print(exe_dz, ema_df, "$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$")
                within_range = any((min(exe_dz[0]) * 0.999 <= value <= max(exe_dz[0]) * 1.001) for value in ema_df)
                # any(min(exe_dz[0]) <= value <= max(exe_dz[0]) for value in ema_df)
                if within_range:
                    entry = max(exe_dz[0])
                    stop_loss = min(exe_dz[0])
                    # if not(2.5 <= ut.calculate_percentage_distance(entry, stop_loss) <= 15):
                    #     stop_loss = ut.calculate_atr(self.get_execute_df(), entry, 14)
                    found_ema_zone = True
        else:
            # print('EMA EXE SZ', exe_sz)
            if len(exe_sz) > 0:
                start_t = max(df[df['high'] == max(exe_sz[0])]['timestamp'])
                interim_df = df[df['close'] == min(exe_sz[0])]['timestamp']
                if interim_df.empty:
                    interim_df = df[df['open'] == min(exe_sz[0])]['timestamp']
                end_t = max(interim_df)
                ema_df = df[df['timestamp'].between(start_t, end_t)]['EMA_20'].to_list()
                within_range = any((min(exe_sz[0]) * 0.999 <= value <= max(exe_sz[0]) * 1.001) for value in ema_df)
                if within_range:
                    entry = min(exe_sz[0])  # For supply, entry is the lower value (top-down approach)
                    stop_loss = max(exe_sz[0])
                    # print(ut.calculate_percentage_distance(entry, stop_loss), "%%%%%%%%%%%%%%%%%%%%%%%")
                    # if not(1 <= ut.calculate_percentage_distance(entry, stop_loss) <= 15):
                    #     stop_loss = ut.calculate_atr_sell(self.get_execute_df(), entry, 14)
                    found_ema_zone = True

        return found_ema_zone, entry, stop_loss
    
    def get_overlapped_buy_decition(self, cmp, dz_distance_list, dz_ana_distance_percent, dz_eva_distance_percent, overlap_dz_ana, overlap_dz_eva):
        found_overlapping_point = False
        ut = self.util
        entry = None
        Stop_loss = None
        dz_distance_list = list(filter(lambda x: x is not None, dz_distance_list))
        if len(dz_distance_list) > 0:
            # print(dz_distance_list)
            if min(dz_distance_list) == dz_ana_distance_percent:
                entry = overlap_dz_ana[0][1]
                Stop_loss = ut.calculate_atr(self.get_execute_df(), entry, period=14)
                # found_overlapping_point = True
            elif min(dz_distance_list) == dz_eva_distance_percent:
                entry = overlap_dz_eva[0][1]
                Stop_loss = ut.calculate_atr(self.get_execute_df(), entry, period=14)
                # Stop_loss = min(overlap_dz_eva[0])
                # found_overlapping_point = True
        if entry is not None:
            if ut.calculate_percentage_distance(cmp, entry) <= self.dynamic_percentage_distance(cmp):
                found_overlapping_point = True

        return found_overlapping_point, entry, Stop_loss
    
    def get_overlapped_supply_decision(self, cmp, sz_distance_list, sz_ana_distance_percent, sz_eva_distance_percent, overlap_sz_ana, overlap_sz_eva):
        found_overlapping_point = False
        ut = self.util
        entry = None
        stop_loss = None
        sz_distance_list = list(filter(lambda x: x is not None, sz_distance_list))
        
        if len(sz_distance_list) > 0:
            # print(sz_distance_list)
            if min(sz_distance_list) == sz_ana_distance_percent:
                entry = min(overlap_sz_ana[0])  # Entry is typically the top of the supply zone
                stop_loss = ut.calculate_atr_sell(self.get_execute_df(), entry, period=14)
            elif min(sz_distance_list) == sz_eva_distance_percent:
                entry = min(overlap_sz_eva[0])
                stop_loss = ut.calculate_atr_sell(self.get_execute_df(), entry, period=14)
                
        if entry is not None:
            if ut.calculate_percentage_distance(cmp, entry) <= self.dynamic_percentage_distance(cmp):
                found_overlapping_point = True

        return found_overlapping_point, entry, stop_loss

    
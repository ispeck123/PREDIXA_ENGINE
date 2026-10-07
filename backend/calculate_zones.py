import pandas as pd
import numpy as np
from datetime import timedelta, datetime
from shared.config.settings import stock_logic_config, stock_data_dir_config
from concurrent.futures import ProcessPoolExecutor
from scripts.stock_logic import is_close_greater_than_open #mark_bad_zone_records
from functools import lru_cache
from scripts.trade_engine import process_zones
from scripts.models import TF
import copy

class ZoneCalculator:
    def __init__(self, csv_path, tick, last_d_time, is_execute, dz_vp=0.50, sz_vp=0.50):
        self.csv_path = csv_path
        self.tick = tick
        self.last_d_time = last_d_time
        self.is_execute = is_execute
        self.dz_vp = dz_vp
        self.sz_vp = sz_vp
        self._load_and_preprocess_data()

    def evaluate_minimal_breach_and_gap_up(self, ):
        pass

    def determine_zone_type(self, f_record, non_base_records, base_low: float, base_high: float, bearish_body_ratio: float = 1, bearish_count_margin: int = 1):
        
        def body(c):  # real body size
            return abs(float(c['close']) - float(c['open']))

        in_dir = 'R' if bool(f_record['is_bullish']) else 'D'
        base_range = float(base_high) - float(base_low)

        if base_range <= 0:
            return None

        if not non_base_records:
            return None

        highs  = [float(c['high'])  for c in non_base_records]
        lows   = [float(c['low'])   for c in non_base_records]
        closes = [float(c['close']) for c in non_base_records]

        max_high = max(highs)
        min_low  = min(lows)

        bull_cnt   = sum(1 for c in non_base_records if bool(c['is_bullish']))
        bear_cnt   = len(non_base_records) - bull_cnt
        bull_body  = sum(body(c) for c in non_base_records if bool(c['is_bullish']))
        bear_body  = sum(body(c) for c in non_base_records if not bool(c['is_bullish']))

        last = non_base_records[-1]
        last_close = float(last['close'])
        last_type_bool = bool(last['is_bullish'])
        legout_len   = len(non_base_records)
        last_is_bear = not last_type_bool
        first_two_bull = (
            legout_len >= 2 and all(bool(c['is_bullish']) for c in non_base_records[:2])
        )

        out_dir = None

        r_thresh = base_high if self.is_execute else base_high + (0.10 * base_range) + (0.10 * base_range)
        broke_above = any(cl > r_thresh for cl in closes)
        broke_below = any(cl < float(base_low) for cl in closes)

        if broke_below:
        # Any bearish close breaking below the base -> D
            out_dir = 'D'
        elif broke_above:
            if legout_len <= 2:
                # Old behavior: legout considered bullish only if there are no bearish candles
                if bear_cnt == 0:
                    out_dir = 'R'
            else:
            # **NEW LOGIC for legout_len > 2**
            # - If last legout is bearish => treat as bearish legout (D)
            # - Else if first 2 candles are bullish => treat as bullish legout (R)
            # - Else fall back to old majority behavior
                if first_two_bull and last_is_bear:
                    out_dir = 'R'
                elif first_two_bull and bear_cnt == 0:
                    out_dir = 'R'
                elif first_two_bull:
                    out_dir = 'R'
                elif last_type_bool:
                    out_dir = 'R'
                else:
                    # fallback: any bearish presence -> D, otherwise R
                    out_dir = 'D' if bear_cnt > 0 else 'R'
        
        else:
             # No clear break above or below. Use structure of legout + majority.
            if legout_len > 2:
                # **NEW LOGIC again for longer legout**
                if last_is_bear:
                    out_dir = 'D'
                elif first_two_bull:
                    out_dir = 'R'
                else:
                    out_dir = 'D' if bear_cnt > 0 else 'R'
            else:
                # For short legouts keep old simple rule
                out_dir = 'D' if bear_cnt > 0 else 'R'




        # if any(cl > r_thresh for cl in closes) and bear_cnt == 0:
        #     out_dir = 'R'
        # # 2) D by ANY bearish close break
        # elif any(cl < float(base_low) for cl in closes):
        #     out_dir = 'D'
        # else:
        #     # 3) Bearish majority fallback (count; tie -> body dominance)
        #     if bear_cnt > 0:
        #         out_dir = 'D'
        #     elif bear_cnt == 0:
        #         out_dir = 'R'
        #     else:
        #         out_dir = None
        
        
        if out_dir is None:
            return None
        mapping = {
            ('R', 'R'): 'RBR',
            ('D', 'D'): 'DBD',
            ('R', 'D'): 'RBD',
            ('D', 'R'): 'DBR',
        }
        return mapping.get((in_dir, out_dir))

        # """Determine the zone type based on the given record."""
        # if bool(f_record['is_bullish']) and bool(l_record['is_bullish']):
        #     return "RBR"
        # elif not(bool(f_record['is_bullish'])) and not(bool(l_record['is_bullish'])):
        #     return "DBD"
        # elif bool(f_record['is_bullish']) and not(bool(l_record['is_bullish'])):
        #     return "RBD"
        # elif not(bool(f_record['is_bullish'])) and bool(l_record['is_bullish']):
        #     return "DBR"
        # else:
        #     return None

    def check_zone_type_validity_demand(self, zone_type):
        if zone_type in ["RBR", "DBR"]:
            return True
        else:
            return False

    def check_zone_type_validity_supply(self, zone_type):
        if zone_type in ["RBD", "DBD"]:
            return True
        else:
            return False

    # def _is_valid_zone(self, base_index, end_index, is_group):
    #     """
    #     Validate if the zone from base_index to end_index is not a BADZONE.
    #     Assumes there's only one is_basing candle at base_index.
    #     """
    #     if self.is_execute:

    #         # if is_group:
    #         #     if abs(end_index - base_index) > 4:
    #         #         return False
    #         #     else:
    #         #         return True
    #         base_row = self.df.iloc[base_index]
    #         base_range = base_row['high'] - base_row['low']
    #         base_count = 0
    #         for k in range(base_index, end_index):
    #             if bool(self.df.iloc[k]['is_basing']):
    #                 base_count += 1
    #         if base_count > 4 and is_group:
    #             return False
    #         elif is_group:
    #             return True
    #         # Scan next candles after base_index
    #         non_basing_count = 0
    #         consecutive_count = 0
    #         i = base_index + 1

    #         while i <= end_index:
    #             row = self.df.iloc[i]
    #             if not bool(row['is_basing']):
    #                 consecutive_count += 1
    #                 non_basing_count += 1
    #             else:
    #                 if consecutive_count > 0:
    #                     break
    #             i += 1

    #         if non_basing_count >= 2:
    #             return True  # Rule 1 satisfied
    #         elif non_basing_count == 1:
    #             non_base_row = self.df.iloc[base_index + 1]
    #             non_base_range = non_base_row['high'] - non_base_row['low']
    #             return non_base_range >= 2.5 * base_range  # Rule 2
    #         return False  # BADZONE
    #     else:
    #         return True
    # def _is_valid_zone(self, base_index, end_index, base_range):
    #     if not self.is_execute:
    #         return True
    #     df = self.df.copy()
    #     # Fast boolean/array access
    #     is_basing = df['is_basing'].values
    #     highs = df['high'].values
    #     lows = df['low'].values
        
    #     # ---- Find consecutive basing candles starting at base_index
    #     i = base_index
    #     n = len(df)
    #     base_run_len = 0
    #     while i <= end_index and i < n and bool(is_basing[i]):
    #         base_run_len += 1
    #         i += 1
        
    #     # Hard discard if >=5 basing candles
    #     if base_run_len >= 5:
    #         return False

    #     # Exactly 2 or 3 basing -> valid
    #     if base_run_len in (2, 3):
    #         # last_base_idx = base_index + base_run_len - 1
    #         # base_range = float(highs[last_base_idx] - lows[last_base_idx])
    #         j = i  # first candle after the basing run
    #         non_basing_run = 0
    #         while j <= end_index and j < n and not bool(is_basing[j]):
    #             non_basing_run += 1
    #             j += 1
    #         if non_basing_run >= 2:
    #             return True
    #         if non_basing_run == 1 and (i < n):
    #             one_nb_range = float(highs[i] - lows[i])
    #             upper = 5 * base_range
    #             # print(one_nb_range, base_range, (one_nb_range <= upper), "****************************")
    #             return (one_nb_range <= upper)

    #         return False
        
    #     # For 1 or 4 basing candles, apply the enhanced rule
    #     if base_run_len in (1, 4):
    #         # compute (H-L) of the LAST basing candle in the run
    #         # last_base_idx = base_index + base_run_len - 1
    #         # base_range = float(highs[last_base_idx] - lows[last_base_idx])

    #         # count consecutive non-basing right after the basing run
    #         j = i  # first candle after the basing run
    #         non_basing_run = 0
    #         while j <= end_index and j < n and not bool(is_basing[j]):
    #             non_basing_run += 1
    #             j += 1

    #         # Condition A: >=2 consecutive non-basing -> valid
    #         if non_basing_run >= 2:
    #             return True

    #         # Condition B: exactly 1 non-basing -> must be 2.5x the last basing candle's range
    #         if non_basing_run == 1 and (i < n):
    #             one_nb_range = float(highs[i] - lows[i])
    #             lower = 2.25 * base_range
    #             upper = 5 * base_range
    #             return (one_nb_range >= lower) and (one_nb_range <= upper)

    #         # Otherwise -> BADZONE
    #         return False
        
    #     # If there are 0 basing candles starting at base_index (unexpected), treat as BADZONE
    #     return False

    def _is_valid_zone(self, base_index, end_index, base_range):
        if not self.is_execute:
            return True

        df = self.df
        is_basing = df['is_basing'].values
        highs = df['high'].values
        lows = df['low'].values

        n = len(df)

        # ---------- helper: compute basic overlap ----------
        def _ranges_overlap(a_low, a_high, b_low, b_high) -> bool:
            return (a_low <= b_high) and (a_high >= b_low)

        # ---------- helper: quick validity check for neighbor zone (WITHOUT proximity logic) ----------
        # This avoids recursion loops.
        def _neighbor_zone_is_valid(nb_base_start: int, nb_base_end: int) -> bool:
            # Hard discard if >=5 basing candles (same as main)
            base_len = nb_base_end - nb_base_start + 1
            if base_len >= 5:
                return False

            # Find consecutive non-basing right after the basing run
            j = nb_base_end + 1
            non_basing_run = 0
            while j < n and not bool(is_basing[j]):
                non_basing_run += 1
                j += 1

            # If neighbor has >=2 non-base candles after base -> valid
            if non_basing_run >= 2:
                return True

            # If neighbor has exactly 1 non-base candle, apply your rules:
            if non_basing_run == 1 and (nb_base_end + 1) < n:
                one_nb_range = float(highs[nb_base_end + 1] - lows[nb_base_end + 1])
                upper = 5 * float(base_range)

                # IMPORTANT: 2.5x should apply ONLY to single base candle
                if base_len == 1:
                    lower = 2.25 * float(base_range)
                    return (one_nb_range >= lower) and (one_nb_range <= upper)
                else:
                    # for 2,3,4 base candles: allow 1 leg-out if it is not too large
                    return one_nb_range <= upper

            return False

        # ---------- helper: proximity exception (preceding OR following, closest only) ----------
        def _proximity_exception_ok(curr_base_start: int, curr_end: int) -> bool:
            # Current zone range (use base..end_index window for overlap check)
            curr_low = float(np.min(lows[curr_base_start:curr_end + 1]))
            curr_high = float(np.max(highs[curr_base_start:curr_end + 1]))

            # ---- check PRECEDING neighbor (closest) ----
            prev = curr_base_start - 1
            # move left to find nearest basing candle
            while prev >= 0 and not bool(is_basing[prev]):
                prev -= 1
            if prev >= 0:
                prev_base_end = prev
                while prev >= 0 and bool(is_basing[prev]):
                    prev -= 1
                prev_base_start = prev + 1

                # determine how many non-base candles separate prev zone and current base
                prev_zone_end = prev_base_end
                while prev_zone_end + 1 < curr_base_start and not bool(is_basing[prev_zone_end + 1]):
                    prev_zone_end += 1

                gap_candles = curr_base_start - prev_zone_end - 1  # non-base candles between zones
                if gap_candles <= 1:
                    prev_low = float(np.min(lows[prev_base_start:prev_zone_end + 1]))
                    prev_high = float(np.max(highs[prev_base_start:prev_zone_end + 1]))

                    # "proximity based on overlap"
                    if _ranges_overlap(curr_low, curr_high, prev_low, prev_high):
                        # neighbor must be valid on its own
                        if _neighbor_zone_is_valid(prev_base_start, prev_base_end):
                            return True

            # ---- check FOLLOWING neighbor (closest) ----
            nxt = curr_end + 1
            # move right to find nearest basing candle
            while nxt < n and not bool(is_basing[nxt]):
                nxt += 1
            if nxt < n:
                next_base_start = nxt
                while nxt < n and bool(is_basing[nxt]):
                    nxt += 1
                next_base_end = nxt - 1

                # determine how many non-base candles separate current zone and next base
                gap_candles = next_base_start - curr_end - 1
                if gap_candles <= 1:
                    # extend next zone through its immediate non-basing run for overlap range
                    next_zone_end = next_base_end
                    while next_zone_end + 1 < n and not bool(is_basing[next_zone_end + 1]):
                        next_zone_end += 1

                    next_low = float(np.min(lows[next_base_start:next_zone_end + 1]))
                    next_high = float(np.max(highs[next_base_start:next_zone_end + 1]))

                    if _ranges_overlap(curr_low, curr_high, next_low, next_high):
                        if _neighbor_zone_is_valid(next_base_start, next_base_end):
                            return True

            return False

        # ---- Find consecutive basing candles starting at base_index
        i = base_index
        base_run_len = 0
        while i <= end_index and i < n and bool(is_basing[i]):
            base_run_len += 1
            i += 1

        # Hard discard if >=5 basing candles
        if base_run_len >= 5:
            return False

        # Count consecutive non-basing right after basing run
        j = i
        non_basing_run = 0
        while j <= end_index and j < n and not bool(is_basing[j]):
            non_basing_run += 1
            j += 1

        # Condition A: >=2 consecutive non-basing -> valid (for ALL base_len)
        if non_basing_run >= 2:
            return True

        # Condition B: exactly 1 non-basing -> apply rule, otherwise allow proximity exception
        if non_basing_run == 1 and (i < n):
            one_nb_range = float(highs[i] - lows[i])
            upper = 4 * float(base_range)

            if base_run_len == 1:
                # 2.5x (2.25) rule ONLY for single basing candle
                lower = 2.5 * float(base_range)
                if (one_nb_range >= lower) and (one_nb_range <= upper):
                    # print("single base candle.........................######################################", base_range, one_nb_range)
                    return True
                else:
                    # print("single base candle.........................######################################", base_range, one_nb_range)
                    return False
                # failed strict 2.5x -> try proximity exception
                # return _proximity_exception_ok(base_index, end_index)

            else:
                # for base_run_len 2,3,4: no 2.5x lower bound, only upper bound
                if one_nb_range <= upper:
                    return True
                # failed because leg-out too large -> try proximity exception
                return _proximity_exception_ok(base_index, end_index)

        # If we reach here, zone would be invalid (0 leg-out or something else),
        # but you still want proximity exception considered for ALL cases:
        return _proximity_exception_ok(base_index, end_index)


    def _infer_freq_from_path(self, path: str) -> str:
        """
        Infer pandas frequency alias from filename/path.
        Adjust mappings as needed for your files.
        """
        p = str(path).lower()
        if "month" in p:         # monthly candles
            return "M"          # Month Start
        if "week" in p:          # weekly candles
            return "W"       # Week starts Monday (change to W-SUN if needed)
        if "daily" in p or "day" in p:
            return "D"           # calendar day
        if "sixty" in p or "60" in p or "hour" in p:
            return "H"           # hourly
        # add more if you have: 15m, 5m, 1m…
        if "seventy_five" in p or "75" in p:
            return "75T"
        if "fifteen" in p or "15" in p:
            return "15T"
        if "five" in p or "5" in p:
            return "5T"
        if "one" in p or "1m" in p:
            return "T"           # 1-minute
        # default: treat as daily if unknown
        return "D"
    
    def _start_of_current_period(self, ts: pd.Timestamp, tf: str, week_start: int = 0) -> pd.Timestamp:
        """
        Compute the start of the *current* period that contains ts.
        We will keep data with timestamp < returned cutoff (i.e., only completed candles).

        week_start: 0=Monday .. 6=Sunday
        """
        ts = pd.Timestamp(ts)

        if tf == "M":
            # Month start at 00:00
            return ts.replace(day=1, hour=0, minute=0, second=0, microsecond=0, nanosecond=0)

        if tf == "W":
            # Week start (default Monday). Compute Monday 00:00 of current week.
            # If you need Sunday, set week_start=6.
            weekday = ts.weekday()  # Monday=0 ... Sunday=6
            market_close_time = ts.replace(hour=15, minute=30, second=0, microsecond=0, nanosecond=0)
            monday_start = (ts - pd.Timedelta(days=weekday)).normalize()

            if weekday < 4 or (weekday == 4 and ts < market_close_time):
                prev_monday = monday_start - pd.Timedelta(days=7)
                return prev_monday.replace(hour=17, minute=30, second=0, microsecond=0, nanosecond=0)
            else:
                return monday_start.replace(hour=17, minute=30, second=0, microsecond=0, nanosecond=0)
            # delta_days = (ts.weekday() - week_start) % 7
            # start = (ts - pd.Timedelta(days=delta_days)).normalize()
            # return start

        if tf == "D":
            # Day start at 00:00
            return ts.normalize()

        if tf == "H":
            # Hour start
            return ts.replace(minute=0, second=0, microsecond=0, nanosecond=0)

        if tf.endswith("T"):  # minute bars like '15T','5T','T'
            minutes = 1 if tf == "T" else int(tf[:-1])
            minute_bucket = (ts.minute // minutes) * minutes
            return ts.replace(minute=minute_bucket, second=0, microsecond=0, nanosecond=0)

        # Fallback: treat as daily
        return ts.normalize()
        


    def _return_ath_and_pth(self, timestamp_unix):
        # --- Zone row ---
        zone_row = self.df[self.df['unix_timestamp'] == timestamp_unix]
        if zone_row.empty:
            return 0.0, 0.0, 0.0, 0.0, 0.0
        
        zone_idx = zone_row.index[0]
        zone_date = zone_row.iloc[0]['date']
        zone_high = zone_row.iloc[0]['high'] or 0.0


        # All-Time High up to the zone row
        all_time_high = self.df.loc[:zone_idx, 'high'].max()
        # --- Zone-wise previous day high ---
        zone_prev_day_df = self.df[self.df['date'] < zone_date]
        zone_prev_day_high = None
        zone_prev_day_low = None
        if not zone_prev_day_df.empty:
            zone_prev_day = zone_prev_day_df['date'].max()
            zone_day_df = zone_prev_day_df[zone_prev_day_df['date'] == zone_prev_day]
            zone_prev_day_high = zone_day_df['high'].max()
            zone_prev_day_low = zone_day_df['low'].min()
        else:
            zone_prev_day_high = zone_high
            zone_prev_day_low = zone_high * 0.98

        # --- CMP-wise previous day high (based on last row in df) ---
        cmp_row = self.df.iloc[-1]
        cmp_date = cmp_row['date']
        cmp_prev_day_high = None
        cmp_prev_day_low = None
        cmp_prev_day_df = self.df[self.df['date'] < cmp_date]
        if not cmp_prev_day_df.empty:
            cmp_prev_day = cmp_prev_day_df['date'].max()
            cmp_day_df = cmp_prev_day_df[cmp_prev_day_df['date'] == cmp_prev_day]
            cmp_prev_day_high = cmp_day_df['high'].max()
            cmp_prev_day_low = cmp_day_df['low'].min()
        else:
            cmp_prev_day_high = zone_row['close'] or zone_high
            cmp_prev_day_low = (zone_row['close'] or zone_high) * 0.98

        return all_time_high, zone_prev_day_high, zone_prev_day_low, cmp_prev_day_high, cmp_prev_day_low

    # def _return_ath_and_pth(self, timestamp_unix):
    #     base_idx = self.df[self.df['unix_timestamp'] == timestamp_unix].index
    #     if len(base_idx) == 0:
    #         return None, None, None  # Not found
    #     base_idx = base_idx[0]
    #     current_idx = base_idx + 2
    #     # if current_idx >= len(self.df):
    #     #     return None, None, None
    #     current_row = self.df.iloc[current_idx]
    #     current_time = current_row['unix_timestamp']
    #     current_date = current_row['date']

    #     fdf = self.df[self.df['unix_timestamp'] <= current_time]
    #     trading_dates = sorted(fdf['date'].unique())
    #     try:
    #         current_date_index = trading_dates.index(current_date)
    #     except ValueError:
    #         print("VALUE ERROR...............................................PPPPP")
    #         return None, None, None
    #     previous_date = trading_dates[current_date_index - 1]
    #     prev_df = fdf[fdf['date'] == previous_date]
    #     all_time_high = fdf['high'].max()
    #     previous_high = prev_df['high'].max() #if not prev_df.empty else None
    #     previous_low = prev_df['low'].min() #if not prev_df.empty else None

    #     return all_time_high, previous_high, previous_low
    
    def _slice_list_by_time(self, data, prev_t, next_t):
        for idx, stamp in enumerate(data):
            t1 = min(stamp[0]['time'], stamp[1]['time'])
            t2 = max(stamp[0]['time'], stamp[1]['time'])
            if t1 == prev_t and t2 == next_t:
                return data[0:idx]
        return []
    
    def get_preceding_zones(self, qual_zone, check_zone_list, is_dz):
        preceding_zones = []
        qual_zone_high = max(qual_zone[0]['price'], qual_zone[1]['price'])
        qual_zone_low = min(qual_zone[0]['price'], qual_zone[1]['price'])
        if is_dz:
            for items in check_zone_list:
                if min(items[0]['price'], items[1]['price']) >= qual_zone_high:
                    preceding_zones.append(items)
        else:
            for items in check_zone_list:
                if max(items[0]['price'], items[1]['price']) <= qual_zone_low:
                    preceding_zones.append(items)
        return sorted(preceding_zones, key=lambda z: z[0]["time"], reverse=True)
    
    def format_zone_ranges(self, data):
        zone_ranges = []
        # print(data, "LLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLL")
        lbs = -3 if self.is_execute else -1
        for entry in data:
            if entry is not None:
                point1 = {"time": int(min(entry["time_range"])), "price": float(min(entry["range"])) }
                point2 = {"time": int(self.df['unix_timestamp'].iloc[lbs]), "price": float(max(entry["range"])) }
                zone_ranges.append([point1, point2])
        return zone_ranges
    
    def format_zone_ranges_only(self, data):
        zone_ranges = []
        # print(data, "LLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLL")
        for entry in data:

            if entry is not None:
                point1 = {"time": int(entry["time_range"][0]), "price": float(min(entry["range"])) }
                point2 = {"time": int(entry["time_range"][1]), "price": float(max(entry["range"])) }
                zone_ranges.append([point1, point2])
        # print('LLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLL')
        return zone_ranges
    
    def _get_base_zone_indices(self):
        """Vectorized operation to find base zone indices"""
        mask = (self.df['is_basing'] == 1) & (self.df['ideal_zone'] != 'BADZONE')
        return self.df[mask].index.tolist()

    def _get_wick_values(self, row, is_DZ):
        """Vectorized wick value calculation"""
        if self.is_execute:
            if is_DZ:
                return np.where(row['is_bullish'], row['close'], row['open'])
            else:
                return np.where(row['is_bullish'], row['open'], row['close'])
        return row['high']
    
    def _calculate_zone_range(self, indices):
        """Vectorized calculation of zone price range"""
        subset = self.df.iloc[indices]
        all_low_or_high = []
        if self.zone_type == 'DZ':
            lows = subset['low'].values
            highs = self._get_wick_values(subset, True) if self.is_execute else subset['high'].values
            all_low_or_high.append(lows)
            
        else:
            highs = subset['high'].values
            lows = self._get_wick_values(subset, False) if self.is_execute else subset['low'].values
            all_low_or_high.append(highs)
        return (np.min(lows), np.max(highs), all_low_or_high)

    def _calculate_abs_zone_range(self, indices):
        """Vectorized calculation of zone price range"""
        subset = self.df.iloc[indices]
        lows = subset['low'].values
        highs = subset['high'].values
        return (np.min(lows), np.max(highs))
    
    def _calculate_all_zones_and_types(self):
        base_indices = self._get_base_zone_indices()
        base_groups, base_singles = self.find_consecutive_indices(base_indices)
        valid_zones = []
        # print(dz_groups, dz_singles)

    def annotate_gaps(self, inp_df: pd.DataFrame, threshold_pct: float = 0.1,
                  ts_col: str = "unix_timestamp") -> pd.DataFrame:
        out = inp_df.copy()
        out["gap_type"] = None
        out["gap_size"] = 0.0
        out["gap_start_time"] = pd.NA
        out["gap_start_price"] = pd.NA
        out["gap_end_time"] = pd.NA
        out["gap_end_price"] = pd.NA

        for i in range(1, len(out)):
            prev = out.iloc[i-1]
            curr = out.iloc[i]

            prev_high, prev_low = prev["high"], prev["low"]
            curr_high, curr_low, curr_close = curr["high"], curr["low"], curr["close"]

            # Gap Up
            if curr_low > prev_high:
                gap = curr_low - prev_high
                if gap >= (threshold_pct / 100.0) * curr_close:
                    out.at[i, "gap_type"] = "Gap Up"
                    out.at[i, "gap_size"] = round(gap, 2)
                    out.at[i, "gap_start_time"] = int(prev[ts_col])
                    out.at[i, "gap_start_price"] = float(prev_high)
                    out.at[i, "gap_end_time"] = int(curr[ts_col])
                    out.at[i, "gap_end_price"] = float(curr_low)

            # Gap Down
            elif curr_high < prev_low:
                gap = prev_low - curr_high
                if gap >= (threshold_pct / 100.0) * curr_close:
                    out.at[i, "gap_type"] = "Gap Down"
                    out.at[i, "gap_size"] = round(gap, 2)
                    out.at[i, "gap_start_time"] = int(prev[ts_col])
                    out.at[i, "gap_start_price"] = float(prev_low)
                    out.at[i, "gap_end_time"] = int(curr[ts_col])
                    out.at[i, "gap_end_price"] = float(curr_high)

        return out
                
    def _load_and_preprocess_data(self):
        """Load and preprocess data once during initialization"""
        self.df = pd.read_csv(self.csv_path)
        col = 'tradeDate' if 'tradeDate' in self.df.columns else 'timestamp'
        self.df[col] = pd.to_datetime(self.df[col], dayfirst=True)
        self.df = self.df[self.df[col] <= self.last_d_time]
        self.current_price = self.df['close'].iloc[-1]
        self.violation_df = self.df.copy()
        freq = self._infer_freq_from_path(self.csv_path)
        cutoff = self._start_of_current_period(self.last_d_time, freq)
        # print(freq, cutoff, "*****************************************************************")
        if freq == 'W':
            self.df = self.df[self.df[col] <= cutoff]
        else:
            self.df = self.df[self.df[col] < cutoff]
        if not(str(self.csv_path).__contains__('monthly') or str(self.csv_path).__contains__('weekly') or str(self.csv_path).__contains__('daily')):
            one_year_ago = self.last_d_time - pd.DateOffset(years=1)
            self.df = self.df[self.df[col] >= one_year_ago]
            # self.df.reset_index(inplace=True)
        self.df.reset_index(inplace=True)
        # self.violation_df.reset_index(inplace=True)
        self.df = self.calculate_base_candles(self.df)
        self._precompute_columns()
        
    # def calculate_base_candles(self, dataframe):
    #     """Convert boolean columns to proper bool type"""
    #     return self.calculate_base_candles(self.df)

    # def calculate_base_candles(self, dataframe):
    #     try:
    #         dataframe1 = dataframe
    #         rows, cols = dataframe1.shape
    #         count = 0
    #         for row in range(rows):
    #             val1 = abs(dataframe1.loc[row, 'open'] - dataframe1.loc[row, 'close'])
    #             val2 = 0.5 * abs(dataframe1.loc[row, 'high'] - dataframe1.loc[row, 'low'])
    #             if val1 < val2:
    #                 dataframe1.loc[row, 'is_basing'] = 1
    #                 count += 1
    #             else:
    #                 dataframe1.loc[row, 'is_basing'] = 0
    #         # print(f"\n{count} rows updated with is_basing values as True")
    #         return dataframe1
    #     except Exception as e:
    #         # Raise the exception.
    #         #raise e
    #         return dataframe
    def calculate_base_candles(self, df: pd.DataFrame) -> pd.DataFrame:
        required = {"open", "close", "high", "low"}
        missing = required - set(df.columns)
        if missing:
            raise KeyError(f"Missing required columns: {sorted(missing)}")

        out = df.copy()
        col = 'tradeDate' if 'tradeDate' in out.columns else 'timestamp'
        out = out.sort_values(col).reset_index(drop=True)
        body = (out["open"] - out["close"]).abs()
        range_ = (out["high"] - out["low"]).abs()
        mask = body < 0.5 * range_
        out["is_basing"] = mask.astype(np.int8)
        out["is_leg_out"] = (~mask).astype(np.int8)
        
        # if self.is_execute:
        if self.is_execute:
            # out = mark_bad_zone_records(out)
            out['ideal_zone'] = ""
            mask = out['is_basing'].eq(1)
            grp = (mask != mask.shift(fill_value=False)).cumsum()
            run_len = mask.groupby(grp).transform('sum')
            out.loc[mask & (run_len >= 5), 'ideal_zone'] = 'BADZONE'

            # grp = (out['is_basing'].ne(out['is_basing'].shift())).cumsum()
            # group_sizes = out.groupby(grp)['is_basing'].transform("size")
            # out.loc[(out['is_basing'] == 1) & (group_sizes >= 5), "ideal_zone"] = "BADZONE"
            # out.loc[mask, "ideal_zone"] = "BADZONE"
        else:
            out['ideal_zone'] = ""
        return out
            
    def _precompute_columns(self):
        """Precompute frequently used columns"""
        col = 'tradeDate' if 'tradeDate' in self.df.columns else 'timestamp'
        self.df['unix_timestamp'] = (self.df[col].astype(np.int64) // 10**9).astype(int)
        self.df['date'] = self.df[col].dt.date
        
        # print(self.df.tail(), self.csv_path)
        # print(self.csv_path, self.df.columns, len(self.df))
        self.df = self.annotate_gaps(self.df)

    def ranges_intersect(self, zone_range, post_leg_out_data, is_demand):
        """Vectorized zone violation check using pandas operations"""
        y2, y1 = min(zone_range), max(zone_range)
        total_range = abs(y1 - y2)
        if is_demand:
            violate_threshold = self.dz_vp if self.is_execute else 0.05
        else:
            violate_threshold = self.sz_vp if self.is_execute else 0.05
        if is_demand:
            violate_price = y2 + (total_range * violate_threshold)
            # Check if any subsequent lows violate the threshold
            # print(post_leg_out_data['low'] <= violate_price)
            return (post_leg_out_data['low'] <= violate_price).any()
        else:
            violate_price = y1 - (total_range * violate_threshold)
            # Check if any subsequent highs violate the threshold
            return (post_leg_out_data['high'] >= violate_price).any()
    
    def ranges_intersect_with_violation(self, zone_range, post_data, is_demand):
        """Vectorized zone violation check using pandas operations"""
        y2, y1 = min(zone_range), max(zone_range)
        total_range = abs(y1 - y2)
        if is_demand:
            violate_threshold = self.dz_vp if self.is_execute else 0.02
        else:
            violate_threshold = self.sz_vp if self.is_execute else 0.02
        
        if is_demand:
            violate_price = y2 + (total_range * violate_threshold)
            violating_candles = post_data[post_data['low'] <= violate_price]
            # Check if any subsequent lows violate the threshold
            return (post_data['low'] <= violate_price).any(), violating_candles
        else:
            violate_price = y1 - (total_range * violate_threshold)
            violating_candles = post_data[post_data['high'] >= violate_price]
            # Check if any subsequent highs violate the threshold
            return (post_data['high'] >= violate_price).any(), violating_candles


    def check_zone_violation(self, check_start_index, zone_range, is_demand):
        """Optimized violation check using vectorized operations"""
        # Get data after zone formation
        col = 'tradeDate' if 'tradeDate' in self.df.columns else 'timestamp'
        start_ts = self.df.iloc[check_start_index][col]
        self.violation_df.sort_values(by=col, inplace=True, ascending=True)
        post_leg_out_data = self.violation_df[self.violation_df[col] > start_ts]
        
        # Find first leg out occurrence
        # leg_out_mask = post_zone_data['is_leg_out']
        # if leg_out_mask.sum() == 0:  # No leg out found
            # return False
        
        # first_leg_out_idx = leg_out_mask.idxmax() + 1
        # post_leg_out_data = post_zone_data #.loc[first_leg_out_idx:]
        # print(post_leg_out_data)
        return self.ranges_intersect(zone_range, post_leg_out_data, is_demand)
        
    def find_consecutive_indices(self, arr):
        """Find groups of consecutive indices using vectorized operations"""
        # if not arr:
        #     return [], []
            
        # arr = np.array(arr)
        # diffs = np.diff(arr)
        # breaks = np.where(diffs != 1)[0] + 1
        # groups = np.split(arr, breaks)
        # return [g.tolist() for g in groups if len(g) > 1], [x for x in arr if x not in np.concatenate(groups)]
        if not arr or arr is None:
            return [], []
        # Convert to NumPy array and ensure it’s 1D
        arr = np.atleast_1d(np.array(arr))
        # Handle single value case
        if arr.size == 1:
            return [], [int(arr[0])]  # Convert NumPy scalar to Python int
        # Find differences between consecutive elements
        diffs = np.diff(arr)
        # Identify where breaks occur (diff != 1)
        breaks = np.where(diffs != 1)[0] + 1
        # Split into groups based on breaks
        groups = np.split(arr, breaks)
        # Separate consecutive groups (len > 1) and singles (len == 1)
        consecutive_groups = [g.tolist() for g in groups if len(g) > 1]  # Already lists
        single_indices = [int(g[0]) for g in groups if len(g) == 1]  # Convert scalars to int
        return consecutive_groups[::-1], single_indices[::-1]
    

    def _check_prededing_leg_out_violation(self, leg_out_element, first_pre_zone, isDZ, check_zone_continuation: bool = False):
        leg_out_high = max(leg_out_element[0]['price'], leg_out_element[1]['price'])
        leg_out_low  = min(leg_out_element[0]['price'], leg_out_element[1]['price'])

        zone_high = max(first_pre_zone[0]['price'], first_pre_zone[1]['price'])
        zone_low  = min(first_pre_zone[0]['price'], first_pre_zone[1]['price'])

        if first_pre_zone:
            zone_high = max(first_pre_zone[0]['price'], first_pre_zone[1]['price'])
            zone_low = min(first_pre_zone[0]['price'], first_pre_zone[1]['price'])
        else:
            zone_high, zone_low = None, None

        # if first_pre_zone:
        if isDZ:
            return leg_out_high >= zone_high or (check_zone_continuation and leg_out_high >= zone_low)
        else:
            return leg_out_low <= zone_low or (check_zone_continuation and leg_out_low <= zone_high)
        


        
        
        # if isDZ:
        #     if not check_zone_continuation:
        #         return leg_out_high >= zone_high
        #     else:
        #         return leg_out_high >= zone_high and leg_out_low <= zone_low



            # leg_out_high = max(leg_out_element[0]['price'], leg_out_element[1]['price'])
            # return leg_out_high >= first_pre_zone[1]['price'] or leg_out_high >= first_pre_zone[0]['price']


            # leg_out_low = min(leg_out_element[0]['price'], leg_out_element[1]['price'])
            # return leg_out_low <= first_pre_zone[0]['price']

    def _qualify_zones(self, is_Dz: bool):
        pass    




class GAPZoneCalculator(ZoneCalculator):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
    
    def detect_and_format_gaps(self, threshold_pct=0.1):
        df = self.df.copy()
        df['gap_type'] = None
        df['gap_size'] = 0.0
        gap_ups = []
        gap_downs = []
        for i in range(1, len(df)):
            prev = df.loc[i - 1]
            curr = df.loc[i]
            prev_high = prev['high']
            prev_low = prev['low']
            curr_high = curr['high']
            curr_low = curr['low']
            curr_close = curr['close']
            if curr_low > prev_high:  # Gap Up
                gap = curr_low - prev_high
                if gap >= (threshold_pct / 100) * curr_close:
                    df.loc[i, 'gap_type'] = 'Gap Up'
                    df.loc[i, 'gap_size'] = round(gap, 2)

                    gap_ups.append([
                        {
                            "time": int(prev['unix_timestamp']),
                            "price": prev_high
                        },
                        {
                            "time": int(curr['unix_timestamp']),
                            "price": curr_low
                        }
                    ])

            elif curr_high < prev_low:  # Gap Down
                gap = prev_low - curr_high
                if gap >= (threshold_pct / 100) * curr_close:
                    df.loc[i, 'gap_type'] = 'Gap Down'
                    df.loc[i, 'gap_size'] = round(gap, 2)

                    gap_downs.append([
                        {
                            "time": int(prev['unix_timestamp']),
                            "price": prev_low
                        },
                        {
                            "time": int(curr['unix_timestamp']),
                            "price": curr_high
                        }
                    ])

        return {
            "gap_ups": gap_ups,
            "gap_downs": gap_downs
        }



class DemandZoneCalculator(ZoneCalculator):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.zone_type = 'DZ'

    def calculate_all_zones(self, with_format: bool):
        base_indices = self._get_base_zone_indices()
        dz_groups, dz_singles = self.find_consecutive_indices(base_indices)
        valid_zones = []
        # print(dz_groups, dz_singles)
        for group in dz_groups:
            zone = self._process_group(group, False)
            if zone: 
                valid_zones.append(zone) 
                
        for single in dz_singles:
            zone = self._process_single(single, False)
            if zone: valid_zones.append(zone)
        if with_format:
            return self.format_zone_ranges_only(valid_zones)
        else:
            return valid_zones
        
    def calculate_zone_with_details(self, max_zones: int = 10):
        base_indices = self._get_base_zone_indices()
        dz_groups, dz_singles = self.find_consecutive_indices(base_indices)
        valid_zones = []
        i = j = 0
        # print(dz_groups, dz_singles)
        while (i < len(dz_groups) or j < len(dz_singles)) and len(valid_zones) < max_zones:
            use_group = False
            if i < len(dz_groups) and j < len(dz_singles):
            # Compare last index of group vs single index
                if dz_groups[i][-1] > dz_singles[j]:
                    use_group = True
            elif i < len(dz_groups):
                use_group = True
            
            if use_group:
                group = dz_groups[i]
                i += 1
                zone = self._process_group(group, False)
            else:
                single = dz_singles[j]
                j += 1
                zone = self._process_single(single, False)

            if zone and not self.check_zone_violation(zone['last_leg_out_index'],
                                                  zone['base_range'], True):
                valid_zones.append(zone)
        
        return valid_zones
        # for group in dz_groups:
        #     zone = self._process_group(group, False)
        #     if zone: 
        #         if not self.check_zone_violation(zone['last_leg_out_index'], zone['base_range'], True):
        #             valid_zones.append(zone)
        # for single in dz_singles:
        #     zone = self._process_single(single, False)
        #     if zone:
        #         if not(self.check_zone_violation(zone['last_leg_out_index'], zone['base_range'], True)): valid_zones.append(zone)
        # return valid_zones

    def calculate_zones(self, max_zones: int = 10):
        base_indices = self._get_base_zone_indices()
        dz_groups, dz_singles = self.find_consecutive_indices(base_indices)
        valid_zones = []
        i = j = 0
        # print(dz_groups, dz_singles)
        while (i < len(dz_groups) or j < len(dz_singles)) and len(valid_zones) < max_zones:
            use_group = False
            if i < len(dz_groups) and j < len(dz_singles):
            # Compare last index of group vs single index
                if dz_groups[i][-1] > dz_singles[j]:
                    use_group = True
            elif i < len(dz_groups):
                use_group = True
            
            if use_group:
                group = dz_groups[i]
                i += 1
                zone = self._process_group(group, False)
            else:
                single = dz_singles[j]
                j += 1
                zone = self._process_single(single, False)

            if zone and not self.check_zone_violation(zone['last_leg_out_index'],
                                                  zone['base_range'], True):
                valid_zones.append(zone)
        # for group in dz_groups:
        #     zone = self._process_group(group, False)
        #     if zone:
        #         if not(self.check_zone_violation(zone['last_leg_out_index'], zone['base_range'], True)):
        #             valid_zones.append(zone)
                
        # for single in dz_singles:
        #     zone = self._process_single(single, False)
        #     if zone:
        #         if not(self.check_zone_violation(zone['last_leg_out_index'], zone['base_range'], True)): 
        #             valid_zones.append(zone)
                
        return self.format_zone_ranges(valid_zones)
    
    def calculate_downtrend_zones(self):
        base_indices = self._get_base_zone_indices()
        dz_groups, dz_singles = self.find_consecutive_indices(base_indices)
        valid_zones = []
        # print(dz_groups, dz_singles)
        for group in dz_groups:
            zone = self._process_group(group, False)
            if zone and not self.check_zone_violation(group[-1], zone['base_range'], True):
                if zone['z_type'] == 'DBR':
                    valid_zones.append(zone)
                
        for single in dz_singles:
            zone = self._process_single(single, False)
            if zone:
                if zone['z_type'] == 'DBR':
                    if not(self.check_zone_violation(zone['end_index'], zone['base_range'], True)): valid_zones.append(zone)
                
        return self.format_zone_ranges(valid_zones)
    
    def calculate_zones_with_leg_out(self, max_zones: int = 10):
        base_indices = self._get_base_zone_indices()
        dz_groups, dz_singles = self.find_consecutive_indices(base_indices)
        valid_zones = []
        i = j = 0
        # print(dz_groups, dz_singles)
        while (i < len(dz_groups) or j < len(dz_singles)) and len(valid_zones) < max_zones:
            use_group = False
            if i < len(dz_groups) and j < len(dz_singles):
            # Compare last index of group vs single index
                if dz_groups[i][-1] > dz_singles[j]:
                    use_group = True
            elif i < len(dz_groups):
                use_group = True
            
            if use_group:
                group = dz_groups[i]
                i += 1
                zone = self._process_group(group, False)
            else:
                single = dz_singles[j]
                j += 1
                zone = self._process_single(single, False)

            if zone and not self.check_zone_violation(zone['last_leg_out_index'],
                                                  zone['base_range'], True):
                valid_zones.append(zone)
        # print(dz_groups, dz_singles)
        # for group in dz_groups:
        #     zone = self._process_group(group, False)
        #     if zone and not self.check_zone_violation(zone['last_leg_out_index'], zone['base_range'], True):
        #         valid_zones.append(self._process_group(group, True))
                
        # for single in dz_singles:
        #     zone = self._process_single(single, False)
        #     if zone:
        #         if not(self.check_zone_violation(zone['last_leg_out_index'], zone['base_range'], True)): valid_zones.append(self._process_single(single, True))
        return self.format_zone_ranges(valid_zones)
    
    def calculate_zones_with_leg_out_downtrend(self):
        base_indices = self._get_base_zone_indices()
        dz_groups, dz_singles = self.find_consecutive_indices(base_indices)
        valid_zones = []
        # print(dz_groups, dz_singles)
        for group in dz_groups:
            zone = self._process_group(group, False)
            if zone and not self.check_zone_violation(group[-1], zone['base_range'], True):
                if zone['z_type'] == 'DBR':
                    valid_zones.append(self._process_group(group, True))
                
        for single in dz_singles:
            zone = self._process_single(single, False)
            if zone:
                if zone['z_type'] == 'DBR':
                    if not(self.check_zone_violation(zone['end_index'], zone['base_range'], True)): valid_zones.append(self._process_single(single, True))
                
        return self.format_zone_ranges(valid_zones)
    
    def calculate_zones_with_leg_out_without_violation(self):
        base_indices = self._get_base_zone_indices()
        dz_groups, dz_singles = self.find_consecutive_indices(base_indices)
        valid_zones = []
        for group in dz_groups:
            zone = self._process_group(group, True)
            if zone: valid_zones.append(zone)
        for single in dz_singles:
            zone = self._process_single(single, True)
            if zone: valid_zones.append(zone)
        if None in valid_zones:
            valid_zones.remove(None)
        return valid_zones
        
    
    def _process_group(self, group_indices, with_leg_out):
        """Process consecutive demand zone candles"""
        # print(len(self.df), group_indices)
        all_legout_low = []
        gap_values = []
        if group_indices[-1] + 1 < len(self.df):
            low, high, all_base_low = self._calculate_zone_range(group_indices)
            abs_base_candle_low, abs_base_candle_high = self._calculate_abs_zone_range(group_indices)
            base_range_low, base_range_high = float(low), float(high) 
            if not(low <= self.current_price <= high) or with_leg_out or not(self.is_execute):
                prev_t = self.df.iloc[group_indices[0]-1]['unix_timestamp']
                next_t = self.df.iloc[group_indices[-1]+1]['unix_timestamp']
                end_idx = group_indices[-1]
                gap_values.append(self.df.iloc[end_idx]['gap_type'])
                past_leg_out_index = group_indices[0] - 1
                while end_idx+1 < len(self.df) and self.df.iloc[end_idx+1]['is_leg_out']:
                    end_idx += 1
                    low = min(low, self.df.iloc[end_idx]['low'], self.df.iloc[past_leg_out_index]['low'])
                    all_legout_low.append(self.df.iloc[end_idx]['low'])
                    gap_values.append(self.df.iloc[end_idx]['gap_type'])
                    if with_leg_out:
                        high = max(high, self.df.iloc[end_idx]['high'], self.df.iloc[past_leg_out_index]['high'])
                
                if end_idx == group_indices[-1]:
                    return None
                first_record = self.df.iloc[group_indices[0] - 1]
                # last_record = self.df.iloc[end_idx]
                non_base_df = self.df.iloc[group_indices[-1] + 1 : end_idx+1]
                non_base_records = non_base_df.to_dict(orient='records')

                z_type = self.determine_zone_type(first_record, non_base_records, base_range_low, base_range_high)
                is_demand = self.check_zone_type_validity_demand(z_type)
                has_gap_up = any(g == 'Gap Up' for g in gap_values)
                # all_base_low_list = [float(np.ravel(x)[0]) for x in all_base_low]
                all_base_low_list = [float(np.min(np.ravel(x))) for x in all_base_low]
                all_legout_low_list = [float(np.min(np.ravel(x))) for x in all_legout_low] if len(all_legout_low) > 0 else []
                abs_base_range = abs(high - abs_base_candle_low)
                if self.is_execute:
                    if len(all_legout_low) > 0:
                        # val_zone_idt = min(all_legout_low) < min(all_base_low)
                        base_floor = float(min(all_base_low_list))
                        legout_floor = float(min(all_legout_low_list))
                        breached = legout_floor < base_floor

                        zone_height = max(1e-8, float(high - low))
                        violation_depth = max(0.0, base_floor - legout_floor)  # positive if breached
                        minimal_breach = breached and (violation_depth <= 0.10 * zone_height)
                    else:
                        breached = True
                        minimal_breach = False
                    # print(base_range_low, base_range_high, z_type, is_demand, breached, minimal_breach, len(all_legout_low), self._is_valid_zone(group_indices[0], end_idx, abs_base_range) and (not breached or minimal_breach) and is_demand, "##################################")
                    if self._is_valid_zone(group_indices[0], end_idx, abs_base_range) and (not breached or minimal_breach) and is_demand: # and (not breached or minimal_breach)
                        return {
                            'type': 'DZ',
                            'range': (low, high),
                            'base_range': (base_range_low, base_range_high),
                            'time_range': (prev_t, next_t),
                            'start_index' : group_indices[0], 
                            'end_index': group_indices[-1],
                            'last_leg_out_index' : end_idx,
                            'z_type' : z_type
                        }
                    
                else:
                    if self._is_valid_zone(group_indices[0], end_idx, abs_base_range) and (len(all_legout_low) > 0) and is_demand: # and (not breached or minimal_breach)
                        return {
                            'type': 'DZ',
                            'range': (low, high),
                            'base_range': (base_range_low, base_range_high),
                            'time_range': (prev_t, next_t),
                            'start_index' : group_indices[0], 
                            'end_index': group_indices[-1],
                            'last_leg_out_index' : end_idx,
                            'z_type' : z_type
                        }
    
    def _process_single(self, index, with_leg_out):
        """Process single demand zone candle"""
        all_legout_low = []
        gap_values = []
        row = self.df.iloc[index]
        if bool(row['is_bullish']):
            high = row['close'] if self.is_execute else row['high']
        else:
            high = row['open'] if self.is_execute else row['high']
        low = row['low'] #self._get_wick_values(row, True) if self.is_execute else row['low']
        # print(row, "DAILY_ROW")
        # Include subsequent leg-out candles
        abs_base_candle_low = row['low']
        abs_base_candle_high = row['high']
        base_candle_low = low
        base_candle_high = high
        past_leg_out_index = index - 1
        end_idx = index
        gap_values.append(self.df.iloc[end_idx]['gap_type'])
        while end_idx+1 < len(self.df) and self.df.iloc[end_idx+1]['is_leg_out']:
            end_idx += 1
            low = min(low, self.df.iloc[end_idx]['low'], self.df.iloc[past_leg_out_index]['low'])
            all_legout_low.append(float(self.df.iloc[end_idx]['low']))
            gap_values.append(self.df.iloc[end_idx]['gap_type'])
            if with_leg_out:
                high = max(high, self.df.iloc[end_idx]['high'], self.df.iloc[past_leg_out_index]['high'])
        
        if end_idx == index:
            return None
        if not(low <= self.current_price <= high) or with_leg_out or not(self.is_execute):
            prev_t = self.df.iloc[index-1]['unix_timestamp']
            next_t = self.df.iloc[end_idx+1]['unix_timestamp'] if end_idx+1 < len(self.df) else self.df.iloc[-1]['unix_timestamp']
            first_record = self.df.iloc[index - 1]
            # last_record = self.df.iloc[end_idx]
            non_base_df = self.df.iloc[index + 1 : end_idx + 1]
            non_base_records = non_base_df.to_dict(orient='records')
            z_type = self.determine_zone_type(first_record, non_base_records, base_candle_low, base_candle_high)
            is_demand = self.check_zone_type_validity_demand(z_type)
            has_gap_up = any(g == 'Gap Up' for g in gap_values)
            all_legout_low_list = [float(np.min(np.ravel(x))) for x in all_legout_low] if len(all_legout_low) > 0 else []
            abs_base_range = abs(high - abs_base_candle_low)
            # z_type = self.determine_zone_type(first_record, last_record)
            if self.is_execute:
                if len(all_legout_low_list) > 0:
                    base_floor = base_candle_low
                    legout_floor = float(min(all_legout_low_list))
                    breached = legout_floor < base_floor
                    zone_height = max(1e-8, float(high - low))
                    violation_depth = max(0.0, base_floor - legout_floor)  # positive if breached
                    minimal_breach = breached and (violation_depth <= 0.10 * zone_height)
                else:
                    breached = True
                    minimal_breach = False
                if self._is_valid_zone(index, end_idx, abs_base_range) and (not breached or  minimal_breach) and is_demand:
                    return {
                        'type': 'DZ',
                        'range': (float(low), float(high)),
                        'base_range': (float(base_candle_low), float(base_candle_high)),
                        'time_range': (prev_t, next_t),
                        'start_index' : index,
                        'end_index': end_idx,
                        'last_leg_out_index' : end_idx,
                        'z_type' : z_type
                    }
            else:
                # print("single zone", base_candle_low, base_candle_high, self._is_valid_zone(index, end_idx, False), len(all_legout_low))
                if self._is_valid_zone(index, end_idx, abs_base_range) and (len(all_legout_low) > 0) and is_demand: # and (not breached or  minimal_breach)
                    return {
                    'type': 'DZ',
                    'range': (float(low), float(high)),
                    'base_range': (float(base_candle_low), float(base_candle_high)),
                    'time_range': (prev_t, next_t),
                    'start_index' : index,
                    'end_index': end_idx,
                    'last_leg_out_index' : end_idx,
                    'z_type' : z_type
                }


class SupplyZoneCalculator(ZoneCalculator):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.zone_type = 'SZ'

    def calculate_zones_with_leg_out_without_violation(self):
        base_indices = self._get_base_zone_indices()
        sz_groups, sz_singles = self.find_consecutive_indices(base_indices)
        valid_zones = []

        for group in sz_groups:
            zone = self._process_group(group, True)
            if zone: valid_zones.append(zone)
        for single in sz_singles:
            zone = self._process_single(single, True)
            if zone: valid_zones.append(zone)
        if None in valid_zones:
            valid_zones.remove(None)
        return valid_zones

    def calculate_all_zones(self, with_format):
        base_indices = self._get_base_zone_indices()
        sz_groups, sz_singles = self.find_consecutive_indices(base_indices)
        valid_zones = []
        for group in sz_groups:
            zone = self._process_group(group, False)
            if zone: valid_zones.append(zone)
        for single in sz_singles:
            zone = self._process_single(single, False)
            if zone: valid_zones.append(zone)
        if with_format:
            return self.format_zone_ranges_only(valid_zones)
        else:
            return valid_zones
        
    def calculate_zones_with_leg_out(self, max_zones: int = 10):
        base_indices = self._get_base_zone_indices()
        sz_groups, sz_singles = self.find_consecutive_indices(base_indices)
        valid_sell_zones = []
        i = j = 0
        while (i < len(sz_groups) or j < len(sz_singles)) and len(valid_sell_zones) < max_zones:
            use_group = False
            if i < len(sz_groups) and j < len(sz_singles):
            # Compare last index of group vs single index
                if sz_groups[i][-1] > sz_singles[j]:
                    use_group = True
            elif i < len(sz_groups):
                use_group = True
            
            if use_group:
                group = sz_groups[i]
                i += 1
                zone = self._process_group(group, False)
            else:
                single = sz_singles[j]
                j += 1
                zone = self._process_single(single, False)

            if zone and not self.check_zone_violation(zone['last_leg_out_index'],
                                                  zone['base_range'], False):
                valid_sell_zones.append(zone)
        # for group in sz_groups:
        #     zone = self._process_group(group, False)
        #     if zone: 
        #         if not self.check_zone_violation(zone['last_leg_out_index'], zone['base_range'], False):
        #             # print("GROUP ZONE ITERATION APPEND", group, self._process_group(group, True))
        #             valid_sell_zones.append(self._process_group(group, True))
        # for single in sz_singles:
        #     zone = self._process_single(single, False)
        #     if zone:
        #         if not self.check_zone_violation(zone['last_leg_out_index'], zone['base_range'], False):
        #             valid_sell_zones.append(self._process_single(single, True))     
        # print(valid_sell_zones, 'all_zone_list SUPPLY..........................')
        return self.format_zone_ranges(valid_sell_zones)
    
    def calculate_zone_with_details(self):
        base_indices = self._get_base_zone_indices()
        sz_groups, sz_singles = self.find_consecutive_indices(base_indices)
        valid_zones = []
        # print(dz_groups, dz_singles)
        for group in sz_groups:
            zone = self._process_group(group, False)
            if zone: 
                if not self.check_zone_violation(zone['last_leg_out_index'], zone['base_range'], False):
                    valid_zones.append(zone)
        for single in sz_singles:
            zone = self._process_single(single, False)
            if zone: 
                if not self.check_zone_violation(zone['last_leg_out_index'], zone['base_range'], False):
                    valid_zones.append(zone)
        return valid_zones

    def calculate_zones(self, max_zones: int = 10):
        base_indices = self._get_base_zone_indices()
        sz_groups, sz_singles = self.find_consecutive_indices(base_indices)
        valid_zones = []
        i = j = 0
        while (i < len(sz_groups) or j < len(sz_singles)) and len(valid_zones) < max_zones:
            use_group = False
            if i < len(sz_groups) and j < len(sz_singles):
            # Compare last index of group vs single index
                if sz_groups[i][-1] > sz_singles[j]:
                    use_group = True
            elif i < len(sz_groups):
                use_group = True
            
            if use_group:
                group = sz_groups[i]
                i += 1
                zone = self._process_group(group, False)
            else:
                single = sz_singles[j]
                j += 1
                zone = self._process_single(single, False)

            if zone and not self.check_zone_violation(zone['last_leg_out_index'],
                                                  zone['base_range'], False):
                valid_zones.append(zone)
        # for group in sz_groups:
        #     zone = self._process_group(group, False)
        #     if zone: #and not 
        #         if not(self.check_zone_violation(zone['last_leg_out_index'], zone['base_range'], False)):
        #             valid_zones.append(zone)
                
        # for single in sz_singles:
        #     zone = self._process_single(single, False)
        #     if zone: 
        #         if not(self.check_zone_violation(zone['last_leg_out_index'], zone['base_range'], False)):
        #             valid_zones.append(zone)
                
        return self.format_zone_ranges(valid_zones)
    
    def _process_group(self, group_indices, with_leg_out):
        """Process consecutive supply zone candles"""
        all_legout_high = []
        if group_indices[-1] + 1 < len(self.df):
            low, high, all_base_high = self._calculate_zone_range(group_indices)
            abs_base_candle_low, abs_base_candle_high = self._calculate_abs_zone_range(group_indices)
            base_low, base_high = low, high
            prev_t = self.df.iloc[group_indices[0]-1]['unix_timestamp']
            next_t = self.df.iloc[group_indices[-1]+1]['unix_timestamp']
            end_idx = group_indices[-1]
            past_leg_out_index = group_indices[0] - 1
            while end_idx+1 < len(self.df) and self.df.iloc[end_idx+1]['is_leg_out']:
                end_idx += 1
                high = max(high, self.df.iloc[end_idx]['high'], self.df.iloc[past_leg_out_index]['high'])
                all_legout_high.append(self.df.iloc[end_idx]['high'])
                if with_leg_out:
                    low = min(low, self.df.iloc[end_idx]['low'], self.df.iloc[past_leg_out_index]['low'])
            # print(low, self.current_price, high, group_indices)
            if end_idx == group_indices[-1]:
                return None
            if not(low <= self.current_price <= high) or with_leg_out or not(self.is_execute):
                first_record = self.df.iloc[group_indices[0] - 1]
                # last_record = self.df.iloc[end_idx]
                non_base_df = self.df.iloc[group_indices[-1] + 1 : end_idx + 1]
                non_base_records = non_base_df.to_dict(orient='records')
                z_type = self.determine_zone_type(first_record, non_base_records, base_low, base_high)
                is_supply = self.check_zone_type_validity_supply(z_type)

                all_base_high_list = [float(np.max(np.ravel(x))) for x in all_base_high]
                all_legout_high_list = [float(np.max(np.ravel(x))) for x in all_legout_high] if len(all_legout_high) > 0 else []
                abs_base_range = abs(high - abs_base_candle_low)

                if self.is_execute:
                    if len(all_legout_high_list) > 0:
                        # val_zone_idt = max(all_legout_high) > max(all_base_high)
                        base_floor = float(max(all_base_high_list))
                        legout_floor = float(max(all_legout_high_list))
                        breached = legout_floor > base_floor

                        zone_height = max(1e-8, float(high - low))
                        violation_depth = max(0.0, legout_floor - base_floor)  # positive if breached
                        minimal_breach = breached and (violation_depth <= 0.10 * zone_height)
                    else:
                        breached = True
                        minimal_breach = False
                    if self._is_valid_zone(group_indices[0], end_idx, abs_base_range) and (not breached or minimal_breach) and is_supply:
                        return {
                            'type': 'SZ',
                            'range': (low, high),
                            'base_range': (base_low, base_high),
                            'time_range': (prev_t, next_t),
                            'start_index' : group_indices[0],
                            'end_index': group_indices[-1],
                            'last_leg_out_index' : end_idx,
                            'z_type' : z_type
                        }
                else:
                    if self._is_valid_zone(group_indices[0], end_idx, abs_base_range) and (len(all_legout_high) > 0) and is_supply: # and (not breached or minimal_breach)
                        return {
                            'type': 'SZ',
                            'range': (low, high),
                            'base_range': (base_low, base_high),
                            'time_range': (prev_t, next_t),
                            'start_index' : group_indices[0], 
                            'end_index': group_indices[-1],
                            'last_leg_out_index' : end_idx,
                            'z_type' : z_type
                        }
    
                
    
    def _process_single(self, index, with_leg_out):
        """Process single supply zone candle"""
        all_legout_high = []
        row = self.df.iloc[index]
        high = row['high']
        low = self._get_wick_values(row, False) if self.is_execute else row['low']
        # Include subsequent leg-out candles
        base_low, base_high = float(low), float(high)
        abs_base_candle_low = row['low']
        abs_base_candle_high = row['high']
        past_leg_out_index = index - 1
        end_idx = index
        while end_idx+1 < len(self.df) and self.df.iloc[end_idx+1]['is_leg_out']:
            end_idx += 1
            high = max(high, self.df.iloc[end_idx]['high'], self.df.iloc[past_leg_out_index]['high'])
            all_legout_high.append(self.df.iloc[end_idx]['high'])
            if with_leg_out:
                low = max(low, self.df.iloc[end_idx]['low'], self.df.iloc[past_leg_out_index]['low'])
        
        if end_idx == index:
            return None
        if not(low <= self.current_price <= high) or with_leg_out or not(self.is_execute):
            prev_t = self.df.iloc[index-1]['unix_timestamp']
            next_t = self.df.iloc[end_idx+1]['unix_timestamp'] if end_idx+1 < len(self.df) else self.df.iloc[-1]['unix_timestamp']
            first_record = self.df.iloc[index - 1]
            # last_record = self.df.iloc[end_idx]
            non_base_df = self.df.iloc[index + 1 : end_idx + 1]
            
            non_base_records = non_base_df.to_dict(orient='records')
            z_type = self.determine_zone_type(first_record, non_base_records, base_low, base_high)

            is_supply = self.check_zone_type_validity_supply(z_type)
            all_legout_high_list = [float(np.max(np.ravel(x))) for x in all_legout_high] if len(all_legout_high) > 0 else []
            abs_base_range = abs(abs_base_candle_high - low)

            if self.is_execute:
                if len(all_legout_high) > 0:
                    # val_zone_idt = max(all_legout_high) > float(base_high)
                    base_floor = float(base_low)
                    legout_floor = float(max(all_legout_high_list))
                    breached = legout_floor > base_floor
                    zone_height = max(1e-8, float(high - low))
                    violation_depth = max(0.0, legout_floor - base_floor)  # positive if breached
                    minimal_breach = breached and (violation_depth <= 0.10 * zone_height)
                else:
                    breached = True
                    minimal_breach = False
                if self._is_valid_zone(index, end_idx, abs_base_range) and (not breached or  minimal_breach) and is_supply:
                    return {
                        'type': 'SZ',
                        'range': (float(low), float(high)),
                        'base_range': (base_low, base_high),
                        'time_range': (prev_t, next_t),
                        'start_index' : index,
                        'end_index': end_idx,
                        'last_leg_out_index' : end_idx,
                        'z_type' : z_type
                    }
            else:
                if self._is_valid_zone(index, end_idx, abs_base_range) and (len(all_legout_high) > 0) and is_supply:
                    return {
                        'type': 'SZ',
                        'range': (float(low), float(high)),
                        'base_range': (base_low, base_high),
                        'time_range': (prev_t, next_t),
                        'start_index' : index,
                        'end_index': end_idx,
                        'last_leg_out_index' : end_idx,
                        'z_type' : z_type
                    }
                    



class ZoneAnalyzer:
    def __init__(self, dz_calculator : DemandZoneCalculator, sz_calculator: SupplyZoneCalculator):
        self.dz_calculator = dz_calculator
        self.sz_calculator = sz_calculator
        
    def analyze(self):
        demand_zones = self.dz_calculator.calculate_all_zones(True)
        supply_zones = self.sz_calculator.calculate_all_zones(True)
        # return self._filter_overlapping_zones(demand_zones, supply_zones)
        return demand_zones + supply_zones
    
    def get_all_zones(self):
        return self.analyze()
    
    def get_filtered_fixed_buy_zone_for_fixature(self, demand_zones, supply_zones):
        if demand_zones:
            demand_zones = sorted(demand_zones, key=lambda z: z[0]["time"], reverse=True)
        if supply_zones:
            supply_zones = sorted(supply_zones, key=lambda z: z[0]["time"], reverse=True)
        if demand_zones and supply_zones:
            overlapping_indexes = self._filter_overlapping_zones(demand_zones, supply_zones)
            for rng in sorted(overlapping_indexes, reverse=True):
                if 0 <= rng < len(demand_zones):
                    demand_zones.pop(rng)
        # if demand_zones and supply_zones:
        #     overlapping_indexes = self._filter_overlapping_zones(demand_zones, supply_zones)
        #     for rng in overlapping_indexes:
        #         if 0 <= rng < len(demand_zones):
        #             demand_zones.pop(rng)
        return demand_zones

    
    def determine_zone_type_old(self, f_record, l_record):
        """Determine the zone type based on the given record."""
        if bool(f_record['is_bullish']) and bool(l_record['is_bullish']):
            return "RBR"
        elif not(bool(f_record['is_bullish'])) and not(bool(l_record['is_bullish'])):
            return "DBD"
        elif bool(f_record['is_bullish']) and not(bool(l_record['is_bullish'])):
            return "RBD"
        elif not(bool(f_record['is_bullish'])) and bool(l_record['is_bullish']):
            return "DBR"
        else:
            return None
    
    def get_filtered_buy_sell_zone(self, demand_zones, supply_zones):
        if demand_zones:
            demand_zones = sorted(demand_zones, key=lambda z: z[0]["time"], reverse=True)
        if supply_zones:
            supply_zones = sorted(supply_zones, key=lambda z: z[0]["time"], reverse=True)
        if self.dz_calculator.is_execute and self.sz_calculator.is_execute:    
            if demand_zones and supply_zones:
                overlapping_indexes = self._filter_overlapping_zones(demand_zones, supply_zones)
                if overlapping_indexes:
                    demand_zones = [dz for i, dz in enumerate(demand_zones) if i not in overlapping_indexes]
                demand_zones = sorted(demand_zones, key=lambda z: z[0]["time"], reverse=True)
                bind_data = {
                    'BUY' : demand_zones,
                    'SELL' : supply_zones
                }
                return bind_data

            else:
                bind_data = {
                    'BUY' : demand_zones,
                    'SELL' : supply_zones
                }
                return bind_data

        else:
            supply_zones_filter = supply_zones[:1] if supply_zones else []
            demand_zones_filter = demand_zones[:1] if demand_zones else []
            if demand_zones:
                demand_zones_filter = demand_zones[:1]
            
            if supply_zones:
                supply_zones_filter = supply_zones[:1]
            
            if demand_zones_filter and supply_zones_filter:
                ov = self._filter_overlapping_zones(demand_zones_filter, supply_zones_filter)
                if ov:
                    demand_zones_filter = [dz for i, dz in enumerate(demand_zones_filter) if i not in ov]
                    if not demand_zones_filter:
                        keep = []
                        for dz in demand_zones:
                            check_ov = self._filter_overlapping_zones([dz], supply_zones[:1])
                            if not check_ov:
                                keep.append(dz)
                                break  # only append the first non-overlapping replacement
                        demand_zones_filter = keep
            else:
                demand_zones_filter = demand_zones_filter or []
                supply_zones_filter = supply_zones_filter or []


            bind_data = {
                'BUY' : demand_zones_filter,
                'SELL' : supply_zones_filter
            }
            return bind_data
        
    def calculate_seperate_zones(self, with_formatting):
        buy_zones = sorted(self.dz_calculator.calculate_zones_with_leg_out_without_violation(), key=lambda z: min(z["time_range"]), reverse=True)
        sell_zones = sorted(self.sz_calculator.calculate_zones_with_leg_out_without_violation(), key=lambda z: min(z["time_range"]), reverse=True)
        if with_formatting:
            return self.dz_calculator.format_zone_ranges_only(buy_zones), self.sz_calculator.format_zone_ranges_only(sell_zones)
        else:
            return buy_zones, sell_zones

    def check_trend_violation(self, violation_price, post_data, is_demand):
        if is_demand:
            return (post_data['low'] <= violation_price).any()
        else:
            return (post_data['high'] >= violation_price).any()
        
    def calculate_overall_trend(self):
        # buy_z, sell_z = self.calculate_seperate_zones(False)
        buy_z = self.dz_calculator.calculate_zones_with_leg_out_without_violation()

        if len(buy_z) >= 2:
            buy_z = sorted(buy_z, key=lambda z: min(z["time_range"]), reverse=True)[:2]
            # sell_z = sorted(sell_z, key=lambda z: min(z["time_range"]), reverse=True)[:2]
            first_buy_zone = buy_z[0]
            first_buy_zone_range = first_buy_zone['range'] # (min(first_buy_zone['base_range']), self.dz_calculator.df.iloc[first_buy_zone['end_index']]['high'])
            first_buy_post_data = self.dz_calculator.df.loc[first_buy_zone['last_leg_out_index']+1:]
            second_buy_zone = buy_z[1]
            second_buy_zone_range = second_buy_zone['range'] #, self.dz_calculator.df.iloc[second_buy_zone['end_index']]['high'])
            second_buy_post_data = self.dz_calculator.df.loc[second_buy_zone['last_leg_out_index']+1:]
            print("Trend Calculation Buy Zones", first_buy_zone_range, second_buy_zone_range)
            first_zone_violated = self.check_trend_violation(min(first_buy_zone_range), first_buy_post_data, True)
            second_zone_violated = self.check_trend_violation(min(second_buy_zone_range), second_buy_post_data, True)
            # print('first_zone_violated',  min(fvl['low'].to_list()), max(fvl['high'].to_list()))
            # print('second_zone_violated', min(svl['low'].to_list()), max(svl['high'].to_list()))
            if not first_zone_violated and not second_zone_violated:
                return "uptrend"
            elif first_zone_violated and second_zone_violated:
                return "downtrend"
            elif first_zone_violated or second_zone_violated:
                # print(first_zone_violated, second_zone_violated, "#*#*#*#*#*")
                # if first_zone_violated:
                #     vc_low = min(fvl['low'].to_list())
                #     vc_high = max(fvl['high'].to_list())
                #     ath, zpth, zptl, cmppth, cmpptl = self.dz_calculator._return_ath_and_pth(min(first_buy_zone['time_range']))
                #     if vc_low <= zptl:
                #         return "downtrend"
                #     if vc_high >= zpth:
                #         return "uptrend"
                #     else:
                return "sideways"

                # if second_zone_violated:
                #     vc_low = min(svl['low'].to_list())
                #     vc_high = max(svl['high'].to_list())
                #     ath, zpth, zptl, cmppth, cmpptl = self.dz_calculator._return_ath_and_pth(min(second_buy_zone['time_range']))
                #     # print(vc_low, vc_high, pth, ptl, "555555555555555555")
                #     if vc_low <= zptl:
                #         return "downtrend"
                #     if vc_high >= zpth:
                #         return "uptrend"
                #     else:
                #         return "sideways"
        else:
            return "uptrend"
    
    def get_qualified_buy_zones(self, trend_bool, check_zone_continuation=True):
        new_qualified_zone_list = []
        violated_preeceding_zone_list = []

        if trend_bool:
            valid_ranges_list = sorted(
                self.dz_calculator.calculate_zones(),
                key=lambda z: z[0]["time"],
                reverse=True,
            )
            all_leg_out_list = sorted(
                self.dz_calculator.calculate_zones_with_leg_out(),
                key=lambda z: z[0]["time"],
                reverse=True,
            )
        else:
            v_zones = self.dz_calculator.calculate_downtrend_zones()
            all_v_zones = self.dz_calculator.calculate_zones_with_leg_out_downtrend()
            if len(v_zones) > 0 and len(all_v_zones) > 0:
                valid_ranges_list = sorted(
                    v_zones,
                    key=lambda z: z[0]["time"],
                    reverse=True,
                )
                all_leg_out_list = sorted(
                    all_v_zones,
                    key=lambda z: z[0]["time"],
                    reverse=True,
                )
            else:
                return []
        
        if len(valid_ranges_list) == 0 or len(all_leg_out_list) == 0:
            return []

        all_zones_list = sorted(
            self.get_all_zones(),
            key=lambda z: z[0]["time"],
            reverse=True,
        )

        for idx, elements in enumerate(all_leg_out_list):
            is_qualified_zone = False
            prev_time = min(elements[0]['time'], elements[1]['time'])
            next_time = max(elements[0]['time'], elements[1]['time'])

            time_sliced_list = self.dz_calculator._slice_list_by_time(
                all_zones_list, prev_time, next_time
            )

            preceding_zones = self.dz_calculator.get_preceding_zones(
                valid_ranges_list[idx],
                time_sliced_list,
                True
            )

            if len(preceding_zones) > 0:
                is_qualified_zone = self.dz_calculator._check_prededing_leg_out_violation(
                    elements,
                    preceding_zones[0],
                    True,
                    check_zone_continuation
                )

                if not is_qualified_zone:
                    ath, zpth, zptl, cmppth, cmpptl = self.dz_calculator._return_ath_and_pth(prev_time)
                    leg_out_high = max(elements[0]['price'], elements[1]['price'])
                    # If leg-out (or effective high considered by dz_calculator) >= previous high
                    # we still consider the zone qualified.
                    is_qualified_zone = leg_out_high >= zpth

                if not is_qualified_zone and check_zone_continuation:
                    df = getattr(self.dz_calculator, "df", None)
                    if df is not None and {"unix_timestamp", "high"}.issubset(df.columns):
                        idx_matches = df.index[df["unix_timestamp"] == prev_time].tolist()
                        if idx_matches:
                            legout_idx = idx_matches[0]
                            lookahead_bars = 20
                            df_after = df.iloc[legout_idx + 1: legout_idx + 1 + lookahead_bars]
                            if not df_after.empty:
                                ath_upto_legout = df.loc[:legout_idx, "high"].max()
                                if (df_after["high"] >= zpth).any():
                                    is_qualified_zone = True
                                elif (df_after["high"] >= ath_upto_legout).any():
                                    is_qualified_zone = True
                                elif (df_after["high"] >= ath).any():
                                    is_qualified_zone = True

                if is_qualified_zone:
                    violated_preeceding_zone_list.append(preceding_zones[0])
            else:
                ath, zpth, zptl, cmppth, cmpptl = self.dz_calculator._return_ath_and_pth(prev_time)
                leg_out_high = max(elements[0]['price'], elements[1]['price'])
                is_qualified_zone = (leg_out_high >= zpth)

                if not is_qualified_zone and check_zone_continuation:
                    df = getattr(self.dz_calculator, "df", None)
                    if df is not None and {"unix_timestamp", "high"}.issubset(df.columns):
                        idx_matches = df.index[df["unix_timestamp"] == prev_time].tolist()
                        if idx_matches:
                            legout_idx = idx_matches[0]
                            lookahead_bars = 20
                            df_after = df.iloc[legout_idx + 1: legout_idx + 1 + lookahead_bars]
                            if not df_after.empty:
                                ath_upto_legout = df.loc[:legout_idx, "high"].max()
                                if (df_after["high"] >= zpth).any():
                                    is_qualified_zone = True
                                elif (df_after["high"] >= ath_upto_legout).any():
                                    is_qualified_zone = True
                                elif (df_after["high"] >= ath).any():
                                    is_qualified_zone = True

            if is_qualified_zone:
                new_qualified_zone_list.append(valid_ranges_list[idx])

        all_leg_out_list_sorted = sorted(all_leg_out_list, key=lambda z: z[0]["time"], reverse=False)
        valid_ranges_list_sorted = sorted(valid_ranges_list, key=lambda z: z[0]["time"], reverse=False)

        for idx, elements in enumerate(all_leg_out_list_sorted):
            if idx == len(all_leg_out_list_sorted) - 1:
                break

            check_element = valid_ranges_list_sorted[idx]
            check_plus = valid_ranges_list_sorted[idx + 1]

            if check_element not in new_qualified_zone_list and check_plus in new_qualified_zone_list:
                new_qualified_zone_list.append(check_element)

        return sorted(new_qualified_zone_list, key=lambda z: z[0]["time"], reverse=True)
    
    # def get_qualified_buy_zones(self, trend_bool):
    #     new_qualified_zone_list = []
    #     violated_preeceding_zone_list = []
    #     if trend_bool:
    #         valid_ranges_list = sorted(self.dz_calculator.calculate_zones(), key=lambda z: z[0]["time"], reverse=True)
    #         all_leg_out_list = sorted(self.dz_calculator.calculate_zones_with_leg_out(), key=lambda z: z[0]["time"], reverse=True)
    #     else:
    #         v_zones = self.dz_calculator.calculate_downtrend_zones()
    #         all_v_zones = self.dz_calculator.calculate_zones_with_leg_out_downtrend()
    #         if len(v_zones) > 0 and len(all_v_zones) > 0:
    #             valid_ranges_list = sorted(v_zones, key=lambda z: z[0]["time"], reverse=True)
    #             all_leg_out_list = sorted(all_v_zones, key=lambda z: z[0]["time"], reverse=True)
    #         else:
    #             return new_qualified_zone_list
    #     # all_zones_list = sorted(self.get_all_zones(), key=lambda z: z[0]["time"], reverse=True)
    #     # for idx, elements in enumerate(all_leg_out_list):
    #     #     is_qualified_zone = False
    #     #     prev_time = min(elements[0]['time'], elements[1]['time'])
    #     #     next_time = max(elements[0]['time'], elements[1]['time'])

    #     #     time_sliced_list = self.dz_calculator._slice_list_by_time(all_zones_list, prev_time, next_time)
    #     #     preceding_zones = self.dz_calculator.get_preceding_zones(valid_ranges_list[idx], time_sliced_list, True)
    #     #     if len(preceding_zones) > 0:
    #     #         is_qualified_zone = self.dz_calculator._check_prededing_leg_out_violation(elements, preceding_zones[0], True)
    #     #         if not(is_qualified_zone):
    #     #             ath, zpth, zptl, cmppth, cmpptl = self.dz_calculator._return_ath_and_pth(prev_time)
    #     #             is_qualified_zone = True if max(elements[0]['price'], elements[1]['price']) >= zpth else False
    #     #         if is_qualified_zone: violated_preeceding_zone_list.append(preceding_zones[0])
    #     #     else:
    #     #         ath, zpth, zptl, cmppth, cmpptl = self.dz_calculator._return_ath_and_pth(prev_time)
    #     #         is_qualified_zone = True if max(elements[0]['price'], elements[1]['price']) >= zpth else False
    #     #     if is_qualified_zone:
    #     #         new_qualified_zone_list.append(valid_ranges_list[idx])
        
    #     # all_leg_out_list = sorted(all_leg_out_list, key=lambda z: z[0]["time"], reverse=False)
    #     # valid_ranges_list = sorted(valid_ranges_list, key=lambda z: z[0]["time"], reverse=False)    
    #     # for idx, elements in enumerate(all_leg_out_list):
    #     #     if idx == len(all_leg_out_list) - 1:
    #     #         break
    #     #     check_element = valid_ranges_list[idx]
    #     #     check_plus = valid_ranges_list[idx+1]
    #     #     if check_element not in new_qualified_zone_list:
    #     #         if check_plus in new_qualified_zone_list:
    #     #             new_qualified_zone_list.append(check_element)
    #     new_qualified_zone_list = valid_ranges_list

    #     return sorted(new_qualified_zone_list, key=lambda z: z[0]["time"], reverse=True)
    def get_qualified_sell_zones(self, check_zone_continuation=True):
        new_qualified_zone_list = []
        violated_preeceding_zone_list = []

        valid_ranges_list = sorted(self.sz_calculator.calculate_zones(),
                                key=lambda z: z[0]["time"], reverse=True)
        all_leg_out_list = sorted(self.sz_calculator.calculate_zones_with_leg_out(),
                                key=lambda z: z[0]["time"], reverse=True)

        if len(valid_ranges_list) == 0 or len(all_leg_out_list) == 0:
            return []

        all_zones_list = sorted(self.get_all_zones(),
                                key=lambda z: z[0]["time"], reverse=True)

        # -------- primary loop (build initial qualified list)
        for idx, elements in enumerate(all_leg_out_list):
            is_qualified_zone = False
            prev_time = min(elements[0]['time'], elements[1]['time'])
            next_time = max(elements[0]['time'], elements[1]['time'])

            time_sliced_list = self.sz_calculator._slice_list_by_time(
                all_zones_list, prev_time, next_time,
            )

            preceding_zones = self.sz_calculator.get_preceding_zones(
                valid_ranges_list[idx], time_sliced_list, False,
            )

            leg_out_high = max(elements[0]['price'], elements[1]['price'])
            leg_out_low  = min(elements[0]['price'], elements[1]['price'])

            if len(preceding_zones) > 0:
                is_qualified_zone = self.sz_calculator._check_prededing_leg_out_violation(
                    elements, preceding_zones[0], False, check_zone_continuation,
                )
                if not is_qualified_zone:
                    ath, zpth, zptl, cmppth, cmpptl = self.sz_calculator._return_ath_and_pth(prev_time)
                    is_qualified_zone = leg_out_low <= zptl

                if is_qualified_zone:
                    violated_preeceding_zone_list.append(preceding_zones[0])

            else:
                ath, zpth, zptl, cmppth, cmpptl = self.sz_calculator._return_ath_and_pth(prev_time)
                if leg_out_high >= ath:
                    is_qualified_zone = True
                if not is_qualified_zone:
                    is_qualified_zone = leg_out_low <= zptl

                if not is_qualified_zone and check_zone_continuation:
                    df = getattr(self.sz_calculator, "df", None)
                    if df is not None and {"unix_timestamp", "high", "low"}.issubset(df.columns):
                        idx_matches = df.index[df["unix_timestamp"] == next_time].tolist()
                        if idx_matches:
                            legout_idx = idx_matches[0]
                            df_after = df.iloc[legout_idx + 1: legout_idx + 21]
                            if not df_after.empty:
                                atl_upto_legout = df.loc[:legout_idx, "low"].min()
                                if (df_after["low"] <= zptl).any():
                                    is_qualified_zone = True
                                elif (df_after["low"] <= atl_upto_legout).any():
                                    is_qualified_zone = True
                                elif (df_after["high"] >= ath).any():
                                    is_qualified_zone = True

            if is_qualified_zone:
                new_qualified_zone_list.append(valid_ranges_list[idx])

        # -------- secondary loop (post-process ONCE): propagate qualification forward by 1
        valid_ranges_list_sorted = sorted(valid_ranges_list, key=lambda z: z[0]["time"], reverse=False)

        for i in range(len(valid_ranges_list_sorted) - 1):
            check_element = valid_ranges_list_sorted[i]
            check_plus    = valid_ranges_list_sorted[i + 1]
            if check_element in new_qualified_zone_list and check_plus not in new_qualified_zone_list:
                new_qualified_zone_list.append(check_plus)

        return sorted(new_qualified_zone_list, key=lambda z: z[0]["time"], reverse=True)

    

    # def get_qualified_sell_zones(self, check_zone_continuation=True):
    #     new_qualified_zone_list = []
    #     violated_preeceding_zone_list = []
    #     valid_ranges_list = sorted(
    #         self.sz_calculator.calculate_zones(),
    #         key=lambda z: z[0]["time"],
    #         reverse=True,
    #     )
    #     all_leg_out_list = sorted(
    #         self.sz_calculator.calculate_zones_with_leg_out(),
    #         key=lambda z: z[0]["time"],
    #         reverse=True,
    #     )

    #     if len(valid_ranges_list) == 0 or len(all_leg_out_list) == 0:
    #         return []

    #     all_zones_list = sorted(
    #         self.get_all_zones(),
    #         key=lambda z: z[0]["time"],
    #         reverse=True,
    #     )

    #     for idx, elements in enumerate(all_leg_out_list):
    #         is_qualified_zone = False
    #         prev_time = min(elements[0]['time'], elements[1]['time'])
    #         next_time = max(elements[0]['time'], elements[1]['time'])

    #         time_sliced_list = self.sz_calculator._slice_list_by_time(
    #             all_zones_list,
    #             prev_time,
    #             next_time,
    #         )

    #         preceding_zones = self.sz_calculator.get_preceding_zones(
    #             valid_ranges_list[idx],
    #             time_sliced_list,
    #             False,
    #         )

    #         leg_out_high = max(elements[0]['price'], elements[1]['price'])
    #         leg_out_low = min(elements[0]['price'], elements[1]['price'])

    #         if len(preceding_zones) > 0:
    #         # --- (A) Check if leg-out (and optionally continuation) violates preceding zone
    #             is_qualified_zone = self.sz_calculator._check_prededing_leg_out_violation(
    #                 elements,
    #                 preceding_zones[0],
    #                 False,
    #                 check_zone_continuation,
    #             )
    #             if not is_qualified_zone:
    #                 ath, zpth, zptl, cmppth, cmpptl = self.sz_calculator._return_ath_and_pth(prev_time)
    #                 # For supply: we want to see if price pushed down far enough
    #                 is_qualified_zone = leg_out_low <= zptl

    #             if is_qualified_zone:
    #                 violated_preeceding_zone_list.append(preceding_zones[0])
            
    #         else:
    #             ath, zpth, zptl, cmppth, cmpptl = self.sz_calculator._return_ath_and_pth(prev_time)
    #             if leg_out_high >= ath:
    #                 is_qualified_zone = True

    #             if not is_qualified_zone:
    #                 is_qualified_zone = leg_out_low <= zptl

    #             if not is_qualified_zone and check_zone_continuation:
    #                 df = getattr(self.sz_calculator, "df", None)
    #                 if df is not None and {"unix_timestamp", "high", "low"}.issubset(df.columns):
    #                     idx_matches = df.index[df["unix_timestamp"] == next_time].tolist()
    #                     if idx_matches:
    #                         legout_idx = idx_matches[0]
    #                         lookahead_bars = 20
    #                         df_after = df.iloc[legout_idx + 1: legout_idx + 1 + lookahead_bars]

    #                         if not df_after.empty:
    #                             atl_upto_legout = df.loc[:legout_idx, "low"].min()
    #                             if (df_after["low"] <= zptl).any():
    #                                 is_qualified_zone = True
    #                             # (3b) Or breaks all-time low up to leg-out
    #                             elif (df_after["low"] <= atl_upto_legout).any():
    #                                 is_qualified_zone = True
    #                             # (3c) Or later candles push up to / beyond ATH
    #                             #      (same spirit as your "leg_out_high >= ath" rule)
    #                             elif (df_after["high"] >= ath).any():
    #                                 is_qualified_zone = True

    #         if is_qualified_zone:
    #             new_qualified_zone_list.append(valid_ranges_list[idx])

    #         all_leg_out_list_sorted = sorted(all_leg_out_list, key=lambda z: z[0]["time"], reverse=False)
    #         valid_ranges_list_sorted = sorted(valid_ranges_list, key=lambda z: z[0]["time"], reverse=False)

    #         for idx, elements in enumerate(all_leg_out_list_sorted):
    #             if idx == len(valid_ranges_list_sorted) - 1:
    #                 break

    #             check_element = valid_ranges_list_sorted[idx]
    #             check_plus = valid_ranges_list_sorted[idx + 1]

    #             if check_element in new_qualified_zone_list and check_plus not in new_qualified_zone_list:
    #                 new_qualified_zone_list.append(check_plus)

    #     return sorted(new_qualified_zone_list, key=lambda z: z[0]["time"], reverse=True)
    
    
    def get_qualified_alterated_zones(self, trend):
        with ProcessPoolExecutor() as executor:
            demand_zones_future = executor.submit(self.get_qualified_buy_zones, trend)
            supply_zones_future = executor.submit(self.get_qualified_sell_zones)
            demand_zones = demand_zones_future.result()
            supply_zones = supply_zones_future.result()
        # print(demand_zones, supply_zones)
        # print(supply_zones, "////////////////////////????????????????????????????????????????")
        if demand_zones and supply_zones:
            overlapping_indexes = self._filter_overlapping_zones(demand_zones, supply_zones)
            for rng in overlapping_indexes:
                if 0 <= rng < len(demand_zones):
                    demand_zones.pop(rng)
        bind_data = {
            'Buy' : demand_zones,
            'Sell' : supply_zones
        }
        # print("Qualified Buy sell data ............*********************")
        # print(bind_data)
        # print("###########################################")
        return bind_data
    


    def _filter_overlapping_zones(self, demand, supply):
        def is_overlap(range1, range2):
            # Ensure correct ordering
            low1, high1 = sorted([range1[0]['price'], range1[1]['price']])
            low2, high2 = sorted([range2[0]['price'], range2[1]['price']])
            return high1 > low2 and high2 > low1
        
        overlapped = set()
        
        for r2 in supply:
            for idx, r1 in enumerate(demand):
                if is_overlap(r1, r2):
                    overlapped.add(idx)
    
        return overlapped

    # def _filter_overlapping_zones_with_details(self, demand, supply):
    #     def is_overlap(range1, range2):
    #         # Unpack the ranges

    #         low1, high1 = range1[0].get('price'), range1[1].get('price')
    #         low2, high2 = range2[0].get('price'), range2[1].get('price')
    #         return not (high1 < low2 or high2 < low1)
    #     overlapping_indexes = []
        
    #     for r2 in supply:
    #         for idx, r1 in enumerate(demand):
    #             if is_overlap(r1, r2):
    #                 overlapping_indexes.append(idx)
    
    #     return overlapping_indexes
        # return demand, supply
    

# class ZONE_TIME_FIXATURE:
#     def __init__(self, tick, time_frame, last_d_time, country_dir) -> None:
#         # self.csv_path = 
#         self.tick = tick
#         self.last_d_time = last_d_time
#         if time_frame == 25:
#             self.time_list = ['daily', 'sixty', 'fifteen']
#         else:
#             self.time_list = getattr(stock_logic_config, f"TIME_FRAMES_{time_frame}")
#         self.eval_csv_path = f"{country_dir}/processed_data_files/{self.tick}_{self.time_list[0]}.csv"
#         self.ana_csv_path = f"{country_dir}/processed_data_files/{self.tick}_{self.time_list[1]}.csv"
#         self.exe_csv_path = f"{country_dir}/processed_data_files/{self.tick}_{self.time_list[-1]}.csv"
#         # self.cbsz = Calculate_BUY_SELL_ZONES(csv_path, tick, last_d_time)

#         self.eva_dz_calc = DemandZoneCalculator(self.eval_csv_path, self.tick, self.last_d_time, False)
#         self.ana_dz_calc = DemandZoneCalculator(self.ana_csv_path, self.tick, self.last_d_time, False)
#         self.eva_sz_calc = SupplyZoneCalculator(self.eval_csv_path, self.tick, self.last_d_time, False)
#         self.ana_sz_calc = SupplyZoneCalculator(self.ana_csv_path, self.tick, self.last_d_time, False)
#         self.eva_zone_analyser = ZoneAnalyzer(self.eva_dz_calc, self.eva_sz_calc)
#         self.ana_zone_analyser = ZoneAnalyzer(self.ana_dz_calc, self.ana_sz_calc)

#     def find_closest(self, lst, target):
#         return min(lst, key=lambda x: abs(x - target))
    

#     def replace_timestamps(self, data, reference_list, act_stamp):
#         for sublist in data:
#             for entry in sublist:
#                 if entry['time'] not in reference_list:
#                     entry['time'] = self.find_closest(reference_list, entry['time'])
#                 # if entry['act'] not in reference_list:
#                 entry['act'] = act_stamp
#         return data

#     def get_all_execute_timestamp_list(self, csv_path):
#         df = pd.read_csv(csv_path)
#         df['timestamp'] = pd.to_datetime(df['timestamp'], dayfirst = True)
#         df = df[df.timestamp <= self.last_d_time]
#         df['timestamp'] = (df['timestamp'].astype(np.int64) // 10**9).astype(int)
#         return df['timestamp'].to_list()

#     def calculate_and_adjust_dz(self):
#         out_dict = {}
#         eval_dz_list = DemandZoneCalculator(self.eval_csv_path, self.tick, self.last_d_time, False).calculate_zones()
#         ana_dz_list = DemandZoneCalculator(self.ana_csv_path, self.tick, self.last_d_time, False).calculate_zones()
#         exe_time_list = self.get_all_execute_timestamp_list(self.exe_csv_path)
#         updated_eval_list = self.replace_timestamps(eval_dz_list, exe_time_list, exe_time_list[::-1][0])
#         updated_ana_list = self.replace_timestamps(ana_dz_list, exe_time_list, exe_time_list[::-1][0])
#         out_dict[self.time_list[0]] = updated_eval_list
#         out_dict[self.time_list[1]] = updated_ana_list

#         return out_dict

#     def calculate_and_adjust_sz(self):
#         out_dict = {}
#         # eval_dz_list = SupplyZoneCalculator(self.eval_csv_path, self.tick, self.last_d_time, False).calculate_zones()
#         # ana_dz_list = SupplyZoneCalculator(self.ana_csv_path, self.tick, self.last_d_time, False).calculate_zones()
#         eval_dz_list = self.eva_zone_analyser.get_filtered_fixed_buy_zone_for_fixature(self.eva_dz_calc.calculate_zones(), self.eva_sz_calc.calculate_zones())
#         ana_dz_list = self.ana_zone_analyser.get_filtered_fixed_buy_zone_for_fixature(self.ana_dz_calc.calculate_zones(), self.ana_sz_calc.calculate_zones())
#         exe_time_list = self.get_all_execute_timestamp_list(self.exe_csv_path)
#         updated_eval_list = self.replace_timestamps(eval_dz_list, exe_time_list, exe_time_list[::-1][0])
#         updated_ana_list = self.replace_timestamps(ana_dz_list, exe_time_list, exe_time_list[::-1][0])
#         out_dict[self.time_list[0]] = updated_eval_list
#         out_dict[self.time_list[1]] = updated_ana_list
        
#         return out_dict



class ZONE_TIME_FIXATURE_FUTURES:
    def __init__(self, tick, time_frame, last_d_time, exp_num, data_dir) -> None:
        # self.csv_path = 
        self.tick = tick
        self.last_d_time = last_d_time
        self.time_list = getattr(stock_logic_config, f"FUTURE_TIME_FRAME_{time_frame}")
        self.eval_csv_path = f"{data_dir}/latest_data_csv/{self.tick}_{exp_num}_{self.time_list[0]}.csv"
        self.ana_csv_path = f"{data_dir}/latest_data_csv/{self.tick}_{exp_num}_{self.time_list[1]}.csv"
        self.exe_csv_path = f"{data_dir}/latest_data_csv/{self.tick}_{exp_num}_{self.time_list[-1]}.csv"
        # self.cbsz = Calculate_BUY_SELL_ZONES(csv_path, tick, last_d_time)
        # self.eva_dz_calc = DemandZoneCalculator(self.eval_csv_path, self.tick, self.last_d_time, False)
        # self.ana_dz_calc = DemandZoneCalculator(self.ana_csv_path, self.tick, self.last_d_time, False)

        # self.eva_sz_calc = SupplyZoneCalculator(self.eval_csv_path, self.tick, self.last_d_time, False)
        # self.ana_sz_calc = SupplyZoneCalculator(self.ana_csv_path, self.tick, self.last_d_time, False)

        # self.eva_zone_analyser = ZoneAnalyzer(self.eva_dz_calc, self.eva_sz_calc)

        # self.ana_zone_analyser = ZoneAnalyzer(self.ana_dz_calc, self.ana_sz_calc)
        self.eva_zones = process_zones(self.eval_csv_path, TF.E, self.last_d_time)
        self.ana_zones = process_zones(self.ana_csv_path, TF.A, self.last_d_time)

    def find_closest(self, lst, target):
        return int(min(lst, key=lambda x: abs(x - target)))
    

    def replace_timestamps(self, data, reference_list, act_stamp):
        for sublist in data:
            for entry in sublist:
                if entry['time'] not in reference_list:
                    entry['time'] = self.find_closest(reference_list, entry['time'])
                # if entry['act'] not in reference_list:
                entry['act'] = act_stamp
        return data

    def calculate_analyse_eval_overlap(self):
        return {
            'Buy' : self.calculate_and_adjust_analyse_dz(),
            'Sell' : self.calculate_and_adjust_analyse_sz()
        }

    def calculate_and_adjust_analyse_dz(self):
        eval_dz_list = copy.deepcopy(self.eva_zones['Buy'])
        ana_time_list = self.get_all_execute_timestamp_list(self.ana_csv_path)
        updated_eval_dz_list = self.replace_timestamps(eval_dz_list, ana_time_list, ana_time_list[::-1][0])
        updated_eval_dz_list = sorted(updated_eval_dz_list, key=lambda z: z[0]["time"], reverse=True)
        return [updated_eval_dz_list[0]] if len(updated_eval_dz_list) > 0 else []

    def calculate_and_adjust_analyse_sz(self):
        eval_sz_list = copy.deepcopy(self.eva_zones['Sell'])
        ana_time_list = self.get_all_execute_timestamp_list(self.ana_csv_path)
        updated_eval_sz_list = self.replace_timestamps(eval_sz_list, ana_time_list, ana_time_list[::-1][0])
        updated_eval_sz_list = sorted(updated_eval_sz_list, key=lambda z: z[0]["time"], reverse=True)
        return [updated_eval_sz_list[0]] if len(updated_eval_sz_list) > 0 else []

    def get_all_execute_timestamp_list(self, csv_path):
        df = pd.read_csv(csv_path)
        col = 'tradeDate' if 'tradeDate' in df.columns else 'timestamp'
        df[col] = pd.to_datetime(df[col], dayfirst = True)
        df = df[df[col] <= self.last_d_time]
        df[col] = (df[col].astype(np.int64) // 10**9).astype(int)
        return df[col].to_list()

    def calculate_and_adjust_dz(self):
        out_dict = {}
        # eval_dz_list = DemandZoneCalculator(self.eval_csv_path, self.tick, self.last_d_time, False).calculate_zones()
        # ana_dz_list = DemandZoneCalculator(self.ana_csv_path, self.tick, self.last_d_time, False).calculate_zones()
        # eval_dz_list = self.eva_zone_analyser.get_filtered_fixed_buy_zone_for_fixature(self.eva_dz_calc.calculate_zones(), self.eva_sz_calc.calculate_zones())
        # ana_dz_list = self.ana_zone_analyser.get_filtered_fixed_buy_zone_for_fixature(self.ana_dz_calc.calculate_zones(), self.ana_sz_calc.calculate_zones())
        eval_dz_list = copy.deepcopy(self.eva_zones['Buy'])
        ana_dz_list = copy.deepcopy(self.ana_zones['Buy'])

        exe_time_list = self.get_all_execute_timestamp_list(self.exe_csv_path)
        updated_eval_list = self.replace_timestamps(eval_dz_list, exe_time_list, exe_time_list[::-1][0])
        updated_ana_list = self.replace_timestamps(ana_dz_list, exe_time_list, exe_time_list[::-1][0])
        out_dict[self.time_list[0]] = updated_eval_list
        out_dict[self.time_list[1]] = updated_ana_list

        return out_dict

    def calculate_and_adjust_sz(self):
        out_dict = {}
        # eval_dz_list = SupplyZoneCalculator(self.eval_csv_path, self.tick, self.last_d_time, False).calculate_zones()
        # ana_dz_list = SupplyZoneCalculator(self.ana_csv_path, self.tick, self.last_d_time, False).calculate_zones()
        eval_sz_list = copy.deepcopy(self.eva_zones['Sell'])
        ana_sz_list = copy.deepcopy(self.ana_zones['Sell'])
        exe_time_list = self.get_all_execute_timestamp_list(self.exe_csv_path)
        updated_eval_list = self.replace_timestamps(eval_sz_list, exe_time_list, exe_time_list[::-1][0])
        updated_ana_list = self.replace_timestamps(ana_sz_list, exe_time_list, exe_time_list[::-1][0])
        out_dict[self.time_list[0]] = updated_eval_list
        out_dict[self.time_list[1]] = updated_ana_list
        
        return out_dict

class ZONE_TIME_FIXATURE:
    def __init__(self, tick, time_frame, last_d_time, country_dir) -> None:
        # self.csv_path = 
        self.tick = tick
        self.last_d_time = last_d_time
        if time_frame == 25:
            self.time_list = ['weekly', 'daily', 'seventy_five']
        else:
            self.time_list = getattr(stock_logic_config, f"TIME_FRAME_EXE_{time_frame}")
        self.eval_csv_path = f"{country_dir}/latest_data_csv/{self.tick}_{self.time_list[0]}.csv"
        self.ana_csv_path = f"{country_dir}/latest_data_csv/{self.tick}_{self.time_list[1]}.csv"
        self.exe_csv_path = f"{country_dir}/latest_data_csv/{self.tick}_{self.time_list[-1]}.csv"
        # self.cbsz = Calculate_BUY_SELL_ZONES(csv_path, tick, last_d_time)
        # self.eva_dz_calc = DemandZoneCalculator(self.eval_csv_path, self.tick, self.last_d_time, False)
        # self.ana_dz_calc = DemandZoneCalculator(self.ana_csv_path, self.tick, self.last_d_time, False)

        # self.eva_sz_calc = SupplyZoneCalculator(self.eval_csv_path, self.tick, self.last_d_time, False)
        # self.ana_sz_calc = SupplyZoneCalculator(self.ana_csv_path, self.tick, self.last_d_time, False)

        # self.eva_zone_analyser = ZoneAnalyzer(self.eva_dz_calc, self.eva_sz_calc)

        # self.ana_zone_analyser = ZoneAnalyzer(self.ana_dz_calc, self.ana_sz_calc)
        self.eva_zones = process_zones(self.eval_csv_path, TF.E, self.last_d_time)
        self.ana_zones = process_zones(self.ana_csv_path, TF.A, self.last_d_time)



    def find_closest(self, lst, target):
        return min(lst, key=lambda x: abs(x - target))
    

    # def replace_timestamps(self, data, reference_list, act_stamp):
    #     for sublist in data:
    #         for entry in sublist:
    #             entry['act'] = act_stamp
    #             if entry['time'] not in reference_list:
    #                 entry['time'] = self.find_closest(reference_list, entry['time'])
    #             # if entry['act'] not in reference_list:
    #     for sublist in data:
    #         for entry in sublist:
    #             print(entry)
    #     return data
    def replace_timestamps(self, data, reference_list, act_stamp):
        # print("FUNCTION CALLED WITH act_stamp:", act_stamp)
        # print("DATA LENGTH:", len(data))

        for sublist_index, sublist in enumerate(data):
            # print("SUBLIST:", sublist_index)

            for entry_index, entry in enumerate(sublist):
                # print("BEFORE:", entry_index, entry)

                entry['act'] = act_stamp

                if entry['time'] not in reference_list:
                    entry['time'] = self.find_closest(reference_list, entry['time'])

                # print("AFTER :", entry_index, entry)

        return data

    def get_all_execute_timestamp_list(self, csv_path):
        df = pd.read_csv(csv_path)
        col = 'tradeDate' if 'tradeDate' in df.columns else 'timestamp'
        df[col] = pd.to_datetime(df[col], dayfirst = True)
        df = df[df[col] <= self.last_d_time]
        df[col] = (df[col].astype(np.int64) // 10**9).astype(int)
        return sorted(df[col].to_list(), reverse=False)

    def calculate_and_adjust_dz(self):
        out_dict = {}
        # eval_dz_list = DemandZoneCalculator(self.eval_csv_path, self.tick, self.last_d_time, False).calculate_zones()
        # ana_dz_list = DemandZoneCalculator(self.ana_csv_path, self.tick, self.last_d_time, False).calculate_zones()
        # eval_dz_list = self.eva_zone_analyser.get_filtered_fixed_buy_zone_for_fixature(self.eva_dz_calc.calculate_zones(), self.eva_sz_calc.calculate_zones())
        # eval_dz_list = self.eva_zone_analyser.get_filtered_buy_sell_zone(self.eva_dz_calc.calculate_zones(), self.eva_sz_calc.calculate_zones())['BUY']
        eval_dz_list = copy.deepcopy(self.eva_zones['Buy'])
        # print("####################################################################$$$$$$$$$$$$$$$$$$$$$")
        # print("eval_dz_list", eval_dz_list)
        # print("####################################################################$$$$$$$$$$$$$$$$$$$$$")
        # ana_dz_list = self.ana_zone_analyser.get_filtered_fixed_buy_zone_for_fixature(self.ana_dz_calc.calculate_zones(), self.ana_sz_calc.calculate_zones())
        # ana_dz_list = self.ana_zone_analyser.get_filtered_buy_sell_zone(self.ana_dz_calc.calculate_zones(), self.ana_sz_calc.calculate_zones())['BUY']
        ana_dz_list = copy.deepcopy(self.ana_zones['Buy'])
        exe_time_list = self.get_all_execute_timestamp_list(self.exe_csv_path)

        act_stamp = exe_time_list[::-1][0]

        # print("act_stamp", act_stamp)

        updated_eval_list = self.replace_timestamps(eval_dz_list, exe_time_list, act_stamp)
        updated_eval_list = sorted(updated_eval_list, key=lambda z: z[0]["time"], reverse=True)
        updated_ana_list = self.replace_timestamps(ana_dz_list, exe_time_list, act_stamp)
        updated_ana_list = sorted(updated_ana_list, key=lambda z: z[0]["time"], reverse=True)
        out_dict[self.time_list[0]] = [updated_eval_list[0]] if len(updated_eval_list) > 0 else []
        out_dict[self.time_list[1]] = [updated_ana_list[0]] if len(updated_ana_list) > 0 else []

        return out_dict

    def calculate_analyse_eval_overlap(self):
        return {
            'Buy' : self.calculate_and_adjust_analyse_dz(),
            'Sell' : self.calculate_and_adjust_analyse_sz()
        }

    def calculate_and_adjust_analyse_dz(self):
        eval_dz_list = copy.deepcopy(self.eva_zones['Buy'])
        ana_time_list = self.get_all_execute_timestamp_list(self.ana_csv_path)
        updated_eval_dz_list = self.replace_timestamps(eval_dz_list, ana_time_list, ana_time_list[::-1][0])
        updated_eval_dz_list = sorted(updated_eval_dz_list, key=lambda z: z[0]["time"], reverse=True)
        return [updated_eval_dz_list[0]] if len(updated_eval_dz_list) > 0 else []

    def calculate_and_adjust_analyse_sz(self):
        eval_sz_list = copy.deepcopy(self.eva_zones['Sell'])
        ana_time_list = self.get_all_execute_timestamp_list(self.ana_csv_path)
        updated_eval_sz_list = self.replace_timestamps(eval_sz_list, ana_time_list, ana_time_list[::-1][0])
        updated_eval_sz_list = sorted(updated_eval_sz_list, key=lambda z: z[0]["time"], reverse=True)
        return [updated_eval_sz_list[0]] if len(updated_eval_sz_list) > 0 else []

    def calculate_and_adjust_sz(self):
        out_dict = {}
        # eval_sz_list = SupplyZoneCalculator(self.eval_csv_path, self.tick, self.last_d_time, False).calculate_zones()
        # ana_sz_list = SupplyZoneCalculator(self.ana_csv_path, self.tick, self.last_d_time, False).calculate_zones()
        eval_sz_list = copy.deepcopy(self.eva_zones['Sell'])
        ana_sz_list = copy.deepcopy(self.ana_zones['Sell'])
        exe_time_list = self.get_all_execute_timestamp_list(self.exe_csv_path)
        updated_eval_list = self.replace_timestamps(eval_sz_list, exe_time_list, exe_time_list[::-1][0])
        updated_ana_list = self.replace_timestamps(ana_sz_list, exe_time_list, exe_time_list[::-1][0])
        updated_eval_list = sorted(updated_eval_list, key=lambda z: z[0]["time"], reverse=True)
        updated_ana_list = sorted(updated_ana_list, key=lambda z: z[0]["time"], reverse=True)
        out_dict[self.time_list[0]] = [updated_eval_list[0]] if len(updated_eval_list) > 0 else []
        out_dict[self.time_list[1]] = [updated_ana_list[0]] if len(updated_ana_list) > 0 else []
        
        return out_dict




class ZONE_TIME_FIXATURE_COMMODITY:
    def __init__(self, tick, time_frame, last_d_time, exp_num, data_dir) -> None:
        # self.csv_path = 
        self.tick = tick
        self.last_d_time = last_d_time
        self.time_list = getattr(stock_logic_config, f"COMMODITY_TIME_FRAME_{time_frame}")
        self.eval_csv_path = f"{data_dir}/latest_data_csv/{self.tick}_{exp_num}_{self.time_list[0]}.csv"
        self.ana_csv_path = f"{data_dir}/latest_data_csv/{self.tick}_{exp_num}_{self.time_list[1]}.csv"
        self.exe_csv_path = f"{data_dir}/latest_data_csv/{self.tick}_{exp_num}_{self.time_list[-1]}.csv"
        # self.cbsz = Calculate_BUY_SELL_ZONES(csv_path, tick, last_d_time)
        # self.eva_dz_calc = DemandZoneCalculator(self.eval_csv_path, self.tick, self.last_d_time, False)
        # self.ana_dz_calc = DemandZoneCalculator(self.ana_csv_path, self.tick, self.last_d_time, False)

        # self.eva_sz_calc = SupplyZoneCalculator(self.eval_csv_path, self.tick, self.last_d_time, False)
        # self.ana_sz_calc = SupplyZoneCalculator(self.ana_csv_path, self.tick, self.last_d_time, False)

        # self.eva_zone_analyser = ZoneAnalyzer(self.eva_dz_calc, self.eva_sz_calc)

        # self.ana_zone_analyser = ZoneAnalyzer(self.ana_dz_calc, self.ana_sz_calc)
        self.eva_zones = process_zones(self.eval_csv_path, TF.E, self.last_d_time)
        self.ana_zones = process_zones(self.ana_csv_path, TF.A, self.last_d_time)

    def find_closest(self, lst, target):
        return int(min(lst, key=lambda x: abs(x - target)))

    def calculate_analyse_eval_overlap(self):
        return {
            'Buy' : self.calculate_and_adjust_analyse_dz(),
            'Sell' : self.calculate_and_adjust_analyse_sz()
        }

    def calculate_and_adjust_analyse_dz(self):
        eval_dz_list = copy.deepcopy(self.eva_zones['Buy'])
        ana_time_list = self.get_all_execute_timestamp_list(self.ana_csv_path)
        updated_eval_dz_list = self.replace_timestamps(eval_dz_list, ana_time_list, ana_time_list[::-1][0])
        updated_eval_dz_list = sorted(updated_eval_dz_list, key=lambda z: z[0]["time"], reverse=True)
        return [updated_eval_dz_list[0]] if len(updated_eval_dz_list) > 0 else []

    def calculate_and_adjust_analyse_sz(self):
        eval_sz_list = copy.deepcopy(self.eva_zones['Sell'])
        ana_time_list = self.get_all_execute_timestamp_list(self.ana_csv_path)
        updated_eval_sz_list = self.replace_timestamps(eval_sz_list, ana_time_list, ana_time_list[::-1][0])
        updated_eval_sz_list = sorted(updated_eval_sz_list, key=lambda z: z[0]["time"], reverse=True)
        return [updated_eval_sz_list[0]] if len(updated_eval_sz_list) > 0 else []
    

    def replace_timestamps(self, data, reference_list, act_stamp):
        for sublist in data:
            for entry in sublist:
                if entry['time'] not in reference_list:
                    entry['time'] = self.find_closest(reference_list, entry['time'])
                # if entry['act'] not in reference_list:
                entry['act'] = act_stamp
        return data

    def get_all_execute_timestamp_list(self, csv_path):
        df = pd.read_csv(csv_path)
        col = 'tradeDate' if 'tradeDate' in df.columns else 'timestamp'
        df[col] = pd.to_datetime(df[col], dayfirst = True)
        df = df[df[col] <= self.last_d_time]
        df[col] = (df[col].astype(np.int64) // 10**9).astype(int)
        return df[col].to_list()

    def calculate_and_adjust_dz(self):
        out_dict = {}
        # eval_dz_list = DemandZoneCalculator(self.eval_csv_path, self.tick, self.last_d_time, False).calculate_zones()
        # ana_dz_list = DemandZoneCalculator(self.ana_csv_path, self.tick, self.last_d_time, False).calculate_zones()
        # get_filtered_buy_sell_zone
        # eval_dz_list = self.eva_zone_analyser.get_filtered_fixed_buy_zone_for_fixature(self.eva_dz_calc.calculate_zones(), self.eva_sz_calc.calculate_zones())
        # ana_dz_list = self.ana_zone_analyser.get_filtered_fixed_buy_zone_for_fixature(self.ana_dz_calc.calculate_zones(), self.ana_sz_calc.calculate_zones())
        # eval_dz_list = self.eva_zone_analyser.get_filtered_buy_sell_zone(self.eva_dz_calc.calculate_zones(), self.eva_sz_calc.calculate_zones())['BUY']
        # ana_dz_list = self.ana_zone_analyser.get_filtered_buy_sell_zone(self.ana_dz_calc.calculate_zones(), self.ana_sz_calc.calculate_zones())['BUY']
        eval_dz_list = copy.deepcopy(self.eva_zones['Buy'])
        ana_dz_list = copy.deepcopy(self.ana_zones['Buy'])

        exe_time_list = self.get_all_execute_timestamp_list(self.exe_csv_path)
        updated_eval_list = self.replace_timestamps(eval_dz_list, exe_time_list, exe_time_list[::-1][0])
        updated_ana_list = self.replace_timestamps(ana_dz_list, exe_time_list, exe_time_list[::-1][0])
        out_dict[self.time_list[0]] = updated_eval_list
        out_dict[self.time_list[1]] = updated_ana_list

        return out_dict

    def calculate_and_adjust_sz(self):
        out_dict = {}
        eval_sz_list = copy.deepcopy(self.eva_zones['Sell'])
        ana_sz_list = copy.deepcopy(self.ana_zones['Sell'])
        exe_time_list = self.get_all_execute_timestamp_list(self.exe_csv_path)
        updated_eval_list = self.replace_timestamps(eval_sz_list, exe_time_list, exe_time_list[::-1][0])
        updated_ana_list = self.replace_timestamps(ana_sz_list, exe_time_list, exe_time_list[::-1][0])
        out_dict[self.time_list[0]] = updated_eval_list
        out_dict[self.time_list[1]] = updated_ana_list
        
        return out_dict

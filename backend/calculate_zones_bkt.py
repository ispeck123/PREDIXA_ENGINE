import pandas as pd
import numpy as np
from datetime import timedelta, datetime
from shared.config.settings import stock_logic_config, stock_data_dir_config
# from concurrent.futures import ProcessPoolExecutor
from scripts.stock_logic import is_close_greater_than_open
from functools import lru_cache

class ZoneCalculator:
    def __init__(self, csv_path, tick, last_d_time, is_execute):
        self.csv_path = csv_path
        self.tick = tick
        self.last_d_time = last_d_time
        self.is_execute = is_execute
        self._load_and_preprocess_data()

    def evaluate_minimal_breach_and_gap_up(self, ):
        pass

    def determine_zone_type(self, f_record, l_record):
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
    def _is_valid_zone(self, base_index, end_index, is_group):
        if not self.is_execute:
            return True
        df = self.df.copy()
        # Fast boolean/array access
        is_basing = df['is_basing'].values
        highs = df['high'].values
        lows = df['low'].values
        
        # ---- Find consecutive basing candles starting at base_index
        i = base_index
        n = len(df)
        base_run_len = 0
        while i <= end_index and i < n and bool(is_basing[i]):
            base_run_len += 1
            i += 1
        
        # Hard discard if >=5 basing candles
        if base_run_len >= 5:
            return False

        # Exactly 2 or 3 basing -> valid
        if base_run_len in (2, 3):
            return True
        
        # For 1 or 4 basing candles, apply the enhanced rule
        if base_run_len in (1, 4):
            # compute (H-L) of the LAST basing candle in the run
            last_base_idx = base_index + base_run_len - 1
            base_range = float(highs[last_base_idx] - lows[last_base_idx])

            # count consecutive non-basing right after the basing run
            j = i  # first candle after the basing run
            non_basing_run = 0
            while j <= end_index and j < n and not bool(is_basing[j]):
                non_basing_run += 1
                j += 1

            # Condition A: >=2 consecutive non-basing -> valid
            if non_basing_run >= 2:
                return True

            # Condition B: exactly 1 non-basing -> must be 2.5x the last basing candle's range
            if non_basing_run == 1 and (i < n):
                one_nb_range = float(highs[i] - lows[i])
                return one_nb_range >= 2.5 * base_range

            # Otherwise -> BADZONE
            return False
        
        # If there are 0 basing candles starting at base_index (unexpected), treat as BADZONE
        return False
        


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
        for entry in data:
            if entry is not None:
                point1 = {"time": int(min(entry["time_range"])), "price": float(min(entry["range"])) }
                point2 = {"time": int(self.df['unix_timestamp'].iloc[-3]), "price": float(max(entry["range"])) }
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
        self.df['timestamp'] = pd.to_datetime(self.df['timestamp'], dayfirst=True)
        self.df = self.df[self.df.timestamp <= self.last_d_time]
        if str(self.csv_path).__contains__('daily') or str(self.csv_path).__contains__('sixty'):
            one_year_ago = self.last_d_time - pd.DateOffset(years=2)
            self.df = self.df[self.df['timestamp'] >= one_year_ago]
            self.df.reset_index(inplace=True)
        self.df.reset_index(inplace=True)
        self._convert_bool_columns()
        self._precompute_columns()
        
    def _convert_bool_columns(self):
        """Convert boolean columns to proper bool type"""
        self.df = self.calculate_base_candles(self.df)

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
        body = (out["open"] - out["close"]).abs()
        range_ = (out["high"] - out["low"]).abs()
        mask = body < 0.5 * range_
        out["is_basing"] = mask.astype(np.int8)
        return out
            
    def _precompute_columns(self):
        """Precompute frequently used columns"""
        self.df['unix_timestamp'] = (self.df['timestamp'].astype(np.int64) // 10**9).astype(int)
        self.df['date'] = self.df['timestamp'].dt.date
        # print(self.df.tail(), self.csv_path)
        self.current_price = self.df['close'].iloc[-1]
        self.df = self.annotate_gaps(self.df)

    def ranges_intersect(self, zone_range, post_leg_out_data, is_demand):
        """Vectorized zone violation check using pandas operations"""
        y2, y1 = min(zone_range), max(zone_range)
        total_range = abs(y1 - y2)

        violate_threshold = 0.5 if self.is_execute else 0.25
        if is_demand:
            violate_price = y2 + (total_range * violate_threshold)
            # Check if any subsequent lows violate the threshold
            return (post_leg_out_data['low'] <= violate_price).any()
        else:
            violate_price = y1 - (total_range * violate_threshold)
            # Check if any subsequent highs violate the threshold
            return (post_leg_out_data['high'] >= violate_price).any()
    
    def ranges_intersect_with_violation(self, zone_range, post_data, is_demand):
        """Vectorized zone violation check using pandas operations"""
        y2, y1 = min(zone_range), max(zone_range)
        total_range = abs(y1 - y2)

        violate_threshold = 0.5 if self.is_execute else 0.25
        
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
        post_zone_data = self.df.iloc[check_start_index+1:]
        
        # Find first leg out occurrence
        # leg_out_mask = post_zone_data['is_leg_out']
        # if leg_out_mask.sum() == 0:  # No leg out found
            # return False
        
        # first_leg_out_idx = leg_out_mask.idxmax() + 1
        post_leg_out_data = post_zone_data #.loc[first_leg_out_idx:]
        
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
        return consecutive_groups, single_indices
    

    def _check_prededing_leg_out_violation(self, leg_out_element, first_pre_zone, isDZ):
        if isDZ:
            leg_out_high = max(leg_out_element[0]['price'], leg_out_element[1]['price'])
            return leg_out_high >= first_pre_zone[1]['price'] or leg_out_high >= first_pre_zone[0]['price']
        else:
            leg_out_low = min(leg_out_element[0]['price'], leg_out_element[1]['price'])
            return leg_out_low <= first_pre_zone[0]['price']

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
            if zone: valid_zones.append(zone) 
                
        for single in dz_singles:
            zone = self._process_single(single, False)
            if zone: valid_zones.append(zone)
        if with_format:
            return self.format_zone_ranges_only(valid_zones)
        else:
            return valid_zones
        
    def calculate_zone_with_details(self):
        base_indices = self._get_base_zone_indices()
        dz_groups, dz_singles = self.find_consecutive_indices(base_indices)
        valid_zones = []
        # print(dz_groups, dz_singles)
        for group in dz_groups:
            zone = self._process_group(group, False)
            if zone: 
                if not self.check_zone_violation(zone['last_leg_out_index'], zone['base_range'], True):
                    valid_zones.append(zone)
        for single in dz_singles:
            zone = self._process_single(single, False)
            if zone:
                if not(self.check_zone_violation(zone['last_leg_out_index'], zone['base_range'], True)): valid_zones.append(zone)
        return valid_zones

    def calculate_zones(self):
        base_indices = self._get_base_zone_indices()
        dz_groups, dz_singles = self.find_consecutive_indices(base_indices)
        valid_zones = []
        # print(dz_groups, dz_singles)

        for group in dz_groups:
            zone = self._process_group(group, False)
            if zone:
                if not(self.check_zone_violation(zone['last_leg_out_index'], zone['base_range'], True)):
                    valid_zones.append(zone)
                
        for single in dz_singles:
            zone = self._process_single(single, False)
            if zone:
                if not(self.check_zone_violation(zone['last_leg_out_index'], zone['base_range'], True)): 
                    valid_zones.append(zone)
                
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
    
    def calculate_zones_with_leg_out(self):
        base_indices = self._get_base_zone_indices()
        dz_groups, dz_singles = self.find_consecutive_indices(base_indices)
        valid_zones = []
        # print(dz_groups, dz_singles)
        for group in dz_groups:
            zone = self._process_group(group, False)
            if zone and not self.check_zone_violation(zone['last_leg_out_index'], zone['base_range'], True):
                valid_zones.append(self._process_group(group, True))
                
        for single in dz_singles:
            zone = self._process_single(single, False)
            if zone:
                if not(self.check_zone_violation(zone['last_leg_out_index'], zone['base_range'], True)): valid_zones.append(self._process_single(single, True))
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
            base_range_low, base_range_high = float(low), float(high) 
            if not(low <= self.current_price <= high) or with_leg_out:
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
                last_record = self.df.iloc[end_idx]
                z_type = self.determine_zone_type(first_record, last_record)
                has_gap_up = any(g == 'Gap Up' for g in gap_values)
                all_base_low_list = [float(np.ravel(x)[0]) for x in all_base_low]
                all_legout_low_list = [float(np.ravel(x)[0]) for x in all_legout_low] if len(all_legout_low) > 0 else []
                
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
                    if self._is_valid_zone(group_indices[0], end_idx, True) and (not breached or minimal_breach): # and (not breached or minimal_breach)
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
                    if self._is_valid_zone(group_indices[0], end_idx, True) and len(all_legout_low) > 0 : # and (not breached or minimal_breach)
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
        if not(low <= self.current_price <= high) or with_leg_out:
            prev_t = self.df.iloc[index-1]['unix_timestamp']
            next_t = self.df.iloc[end_idx+1]['unix_timestamp'] if end_idx+1 < len(self.df) else self.df.iloc[-1]['unix_timestamp']
            first_record = self.df.iloc[index - 1]
            last_record = self.df.iloc[end_idx]
            z_type = self.determine_zone_type(first_record, last_record)
            has_gap_up = any(g == 'Gap Up' for g in gap_values)
            all_legout_low_list = [float(np.ravel(x)[0]) for x in all_legout_low] if len(all_legout_low) > 0 else []
            
            z_type = self.determine_zone_type(first_record, last_record)
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
                if self._is_valid_zone(index, end_idx, False) and (not breached or  minimal_breach):
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
                if self._is_valid_zone(index, end_idx, False) and len(all_legout_low) > 0: # and (not breached or  minimal_breach)
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
        
    def calculate_zones_with_leg_out(self):
        base_indices = self._get_base_zone_indices()
        sz_groups, sz_singles = self.find_consecutive_indices(base_indices)
        valid_sell_zones = []
        for group in sz_groups:
            zone = self._process_group(group, False)
            if zone: 
                if not self.check_zone_violation(zone['last_leg_out_index'], zone['base_range'], False):
                    # print("GROUP ZONE ITERATION APPEND", group, self._process_group(group, True))
                    valid_sell_zones.append(self._process_group(group, True))
        for single in sz_singles:
            zone = self._process_single(single, False)
            if zone:
                if not self.check_zone_violation(zone['last_leg_out_index'], zone['base_range'], False):
                    valid_sell_zones.append(self._process_single(single, True))     
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

    def calculate_zones(self):
        base_indices = self._get_base_zone_indices()
        sz_groups, sz_singles = self.find_consecutive_indices(base_indices)
        valid_zones = []
        
        for group in sz_groups:
            zone = self._process_group(group, False)
            if zone: #and not 
                if not(self.check_zone_violation(zone['last_leg_out_index'], zone['base_range'], False)):
                    valid_zones.append(zone)
                
        for single in sz_singles:
            zone = self._process_single(single, False)
            if zone: 
                if not(self.check_zone_violation(zone['last_leg_out_index'], zone['base_range'], False)):
                    valid_zones.append(zone)
                
        return self.format_zone_ranges(valid_zones)
    
    def _process_group(self, group_indices, with_leg_out):
        """Process consecutive supply zone candles"""
        all_legout_high = []
        if group_indices[-1] + 1 < len(self.df):
            low, high, all_base_high = self._calculate_zone_range(group_indices)
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
            if not(low <= self.current_price <= high) or with_leg_out:
                first_record = self.df.iloc[group_indices[0] - 1]
                last_record = self.df.iloc[end_idx]
                z_type = self.determine_zone_type(first_record, last_record)
                if len(all_legout_high) > 0:
                    val_zone_idt = max(all_legout_high) > max(all_base_high)
                else:
                    val_zone_idt = [False]
                if self._is_valid_zone(group_indices[0], end_idx, True) and not(all(val_zone_idt)):
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
        if not(low <= self.current_price <= high) or with_leg_out:
            prev_t = self.df.iloc[index-1]['unix_timestamp']
            next_t = self.df.iloc[end_idx+1]['unix_timestamp'] if end_idx+1 < len(self.df) else self.df.iloc[-1]['unix_timestamp']
            first_record = self.df.iloc[index - 1]
            last_record = self.df.iloc[end_idx]
            z_type = self.determine_zone_type(first_record, last_record)
            if len(all_legout_high) > 0:
                val_zone_idt = max(all_legout_high) > float(high)
            else:
                val_zone_idt = False
            if self._is_valid_zone(index, end_idx, False) and not(val_zone_idt):
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
        if demand_zones and supply_zones:
            overlapping_indexes = self._filter_overlapping_zones(demand_zones, supply_zones)
            for rng in overlapping_indexes:
                if 0 <= rng < len(demand_zones):
                    demand_zones.pop(rng)
        return demand_zones

    
    def determine_zone_type(self, f_record, l_record):
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
        if demand_zones and supply_zones:
            overlapping_indexes = self._filter_overlapping_zones(demand_zones, supply_zones)
            for rng in overlapping_indexes:
                if 0 <= rng < len(demand_zones):
                    demand_zones.pop(rng)
        bind_data = {
            'BUY' : demand_zones,
            'SELL' : supply_zones
        }
        return bind_data
        
    def calculate_seperate_zones(self, with_formatting):
        all_zones = sorted(self.dz_calculator.calculate_zones_with_leg_out_without_violation(), key=lambda z: min(z["time_range"]), reverse=True)
        buy_zones = []
        sell_zones = []
        for items in all_zones:
            first_record = self.dz_calculator.df.iloc[items['start_index'] - 1]
            last_record = self.dz_calculator.df.iloc[items['last_leg_out_index']]
            z_type = self.determine_zone_type(first_record, last_record)
            items['z_type'] = z_type
            if z_type == 'RBR' or z_type == 'DBR':
                buy_zones.append(items)
            elif z_type == 'DBD' or z_type == 'RBD':
                sell_zones.append(items)
            else:
                pass
                # print("unable to determine zone_type")
        if with_formatting:
            return self.dz_calculator.format_zone_ranges_only(buy_zones), self.sz_calculator.format_zone_ranges_only(sell_zones)
        else:
            return buy_zones, sell_zones
        
    def calculate_overall_trend(self):
        buy_z, sell_z = self.calculate_seperate_zones(False)
        if len(buy_z) >= 2:
            buy_z = sorted(buy_z, key=lambda z: min(z["time_range"]), reverse=True)[:2]
            # sell_z = sorted(sell_z, key=lambda z: min(z["time_range"]), reverse=True)[:2]
            first_buy_zone = buy_z[0]
            first_buy_zone_range = (min(first_buy_zone['range']), self.dz_calculator.df.iloc[first_buy_zone['end_index']]['high'])
            first_buy_post_data = self.dz_calculator.df.loc[first_buy_zone['last_leg_out_index']+1:]
            second_buy_zone = buy_z[1]
            second_buy_zone_range = (min(second_buy_zone['range']), self.dz_calculator.df.iloc[second_buy_zone['end_index']]['high'])
            second_buy_post_data = self.dz_calculator.df.loc[second_buy_zone['last_leg_out_index']+1:]
            # print("Trend Calculation Buy Zones", first_buy_zone_range, second_buy_zone_range)
            first_zone_violated, fvl = self.dz_calculator.ranges_intersect_with_violation(first_buy_zone_range, first_buy_post_data, True)
            second_zone_violated, svl = self.dz_calculator.ranges_intersect_with_violation(second_buy_zone_range, second_buy_post_data, True)
            # print('first_zone_violated',  min(fvl['low'].to_list()), max(fvl['high'].to_list()))
            # print('second_zone_violated', min(svl['low'].to_list()), max(svl['high'].to_list()))
            if not first_zone_violated and not second_zone_violated:
                return "uptrend"
            elif first_zone_violated and second_zone_violated:
                return "downtrend"
            elif first_zone_violated or second_zone_violated:
                # print(first_zone_violated, second_zone_violated, "#*#*#*#*#*")
                if first_zone_violated:
                    vc_low = min(fvl['low'].to_list())
                    vc_high = max(fvl['high'].to_list())
                    ath, zpth, zptl, cmppth, cmpptl = self.dz_calculator._return_ath_and_pth(min(first_buy_zone['time_range']))
                    if vc_low <= zptl:
                        return "downtrend"
                    if vc_high >= zpth:
                        return "uptrend"
                    else:
                        return "sideways"

                if second_zone_violated:
                    vc_low = min(svl['low'].to_list())
                    vc_high = max(svl['high'].to_list())
                    ath, zpth, zptl, cmppth, cmpptl = self.dz_calculator._return_ath_and_pth(min(second_buy_zone['time_range']))
                    # print(vc_low, vc_high, pth, ptl, "555555555555555555")
                    if vc_low <= zptl:
                        return "downtrend"
                    if vc_high >= zpth:
                        return "uptrend"
                    else:
                        return "sideways"
        else:
            return "uptrend"
    
    def get_qualified_buy_zones(self, trend_bool):
        new_qualified_zone_list = []
        violated_preeceding_zone_list = []
        if trend_bool:
            valid_ranges_list = sorted(self.dz_calculator.calculate_zones(), key=lambda z: z[0]["time"], reverse=True)
            all_leg_out_list = sorted(self.dz_calculator.calculate_zones_with_leg_out(), key=lambda z: z[0]["time"], reverse=True)
        else:
            v_zones = self.dz_calculator.calculate_downtrend_zones()
            all_v_zones = self.dz_calculator.calculate_zones_with_leg_out_downtrend()
            if len(v_zones) > 0 and len(all_v_zones) > 0:
                valid_ranges_list = sorted(v_zones, key=lambda z: z[0]["time"], reverse=True)
                all_leg_out_list = sorted(all_v_zones, key=lambda z: z[0]["time"], reverse=True)
            else:
                return new_qualified_zone_list
        all_zones_list = sorted(self.get_all_zones(), key=lambda z: z[0]["time"], reverse=True)
        for idx, elements in enumerate(all_leg_out_list):
            is_qualified_zone = False
            prev_time = min(elements[0]['time'], elements[1]['time'])
            next_time = max(elements[0]['time'], elements[1]['time'])

            time_sliced_list = self.dz_calculator._slice_list_by_time(all_zones_list, prev_time, next_time)
            preceding_zones = self.dz_calculator.get_preceding_zones(valid_ranges_list[idx], time_sliced_list, True)
            if len(preceding_zones) > 0:
                is_qualified_zone = self.dz_calculator._check_prededing_leg_out_violation(elements, preceding_zones[0], True)
                if not(is_qualified_zone):
                    ath, zpth, zptl, cmppth, cmpptl = self.dz_calculator._return_ath_and_pth(prev_time)
                    is_qualified_zone = True if max(elements[0]['price'], elements[1]['price']) >= zpth else False
                if is_qualified_zone: violated_preeceding_zone_list.append(preceding_zones[0])
            else:
                ath, zpth, zptl, cmppth, cmpptl = self.dz_calculator._return_ath_and_pth(prev_time)
                is_qualified_zone = True if max(elements[0]['price'], elements[1]['price']) >= zpth else False
            if is_qualified_zone:
                new_qualified_zone_list.append(valid_ranges_list[idx])
            
        for idx, elements in enumerate(all_leg_out_list):
            if idx == len(all_leg_out_list) - 1:
                break
            check_element = valid_ranges_list[idx]
            check_plus = valid_ranges_list[idx+1]
            if check_element not in new_qualified_zone_list:
                if check_plus in new_qualified_zone_list:
                    new_qualified_zone_list.append(check_element)

        return sorted(new_qualified_zone_list, key=lambda z: z[0]["time"], reverse=True)
    
    def get_qualified_sell_zones(self):
        new_qualified_zone_list = []
        violated_preeceding_zone_list = []
        all_leg_out_list = sorted(self.sz_calculator.calculate_zones_with_leg_out(), key=lambda z: z[0]["time"], reverse=True)
        valid_ranges_list = sorted(self.sz_calculator.calculate_zones(), key=lambda z: z[0]["time"], reverse=True)
        all_zones_list = sorted(self.get_all_zones(), key=lambda z: z[0]["time"], reverse=True)
        for idx, elements in enumerate(all_leg_out_list):
            is_qualified_zone = False
            prev_time = min(elements[0]['time'], elements[1]['time'])
            next_time = max(elements[0]['time'], elements[1]['time'])
            time_sliced_list = self.sz_calculator._slice_list_by_time(all_zones_list, prev_time, next_time)
            preceding_zones = self.sz_calculator.get_preceding_zones(valid_ranges_list[idx], time_sliced_list, False)
            
            if len(preceding_zones) > 0:
                is_qualified_zone = self.sz_calculator._check_prededing_leg_out_violation(elements, preceding_zones[0], False)
                if not(is_qualified_zone):
                    ath, zpth, zptl, cmppth, cmpptl = self.sz_calculator._return_ath_and_pth(prev_time)
                    is_qualified_zone = True if min(elements[0]['price'], elements[1]['price']) <= zptl else False
                if is_qualified_zone: violated_preeceding_zone_list.append(preceding_zones[0])
            else:
                ath, zpth, zptl, cmppth, cmpptl = self.sz_calculator._return_ath_and_pth(prev_time)
                if max(elements[0]['price'], elements[1]['price']) >= ath:
                    is_qualified_zone = True
                if not is_qualified_zone:
                    is_qualified_zone = True if min(elements[0]['price'], elements[1]['price']) <= zptl else False
                # is_qualified_zone = True
                # ath, pth, ptl = self._return_ath_and_pth(prev_time)
                # is_qualified_zone = True if elements[1]['price'] <= ptl else False
            if is_qualified_zone:
                new_qualified_zone_list.append(valid_ranges_list[idx])
                
        for idx, elements in enumerate(all_leg_out_list):
            if idx == len(all_leg_out_list) - 1:
                break
            check_element = valid_ranges_list[idx]
            check_plus = valid_ranges_list[idx+1]
            if check_element not in new_qualified_zone_list:
                if check_plus in new_qualified_zone_list:
                    new_qualified_zone_list.append(check_element)

        
        return sorted(new_qualified_zone_list, key=lambda z: z[0]["time"], reverse=True)
    
    
    def get_qualified_alterated_zones(self, trend):
        # with ProcessPoolExecutor() as executor:
        demand_zones = self.get_qualified_buy_zones(trend)
        supply_zones = self.get_qualified_sell_zones()
        # demand_zones = demand_zones_future.result()
        # supply_zones = supply_zones_future.result()
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
            # Unpack the ranges
            low1, high1 = range1[0].get('price'), range1[1].get('price')
            low2, high2 = range2[0].get('price'), range2[1].get('price')
            return not (high1 < low2 or high2 < low1)
        overlapping_indexes = []
        
        for r2 in supply:
            for idx, r1 in enumerate(demand):
                if is_overlap(r1, r2):
                    overlapping_indexes.append(idx)
    
        return overlapping_indexes
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
        self.eval_csv_path = f"{data_dir}/processed_data_files/{self.tick}_{exp_num}_{self.time_list[0]}.csv"
        self.ana_csv_path = f"{data_dir}/processed_data_files/{self.tick}_{exp_num}_{self.time_list[1]}.csv"
        self.exe_csv_path = f"{data_dir}/processed_data_files/{self.tick}_{exp_num}_{self.time_list[-1]}.csv"
        # self.cbsz = Calculate_BUY_SELL_ZONES(csv_path, tick, last_d_time)
        self.eva_dz_calc = DemandZoneCalculator(self.eval_csv_path, self.tick, self.last_d_time, False)
        self.ana_dz_calc = DemandZoneCalculator(self.ana_csv_path, self.tick, self.last_d_time, False)

        self.eva_sz_calc = SupplyZoneCalculator(self.eval_csv_path, self.tick, self.last_d_time, False)
        self.ana_sz_calc = SupplyZoneCalculator(self.ana_csv_path, self.tick, self.last_d_time, False)

        self.eva_zone_analyser = ZoneAnalyzer(self.eva_dz_calc, self.eva_sz_calc)

        self.ana_zone_analyser = ZoneAnalyzer(self.ana_dz_calc, self.ana_sz_calc)

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

    def get_all_execute_timestamp_list(self, csv_path):
        df = pd.read_csv(csv_path)
        df['timestamp'] = pd.to_datetime(df['timestamp'], dayfirst = True)
        df = df[df.timestamp <= self.last_d_time]
        df['timestamp'] = (df['timestamp'].astype(np.int64) // 10**9).astype(int)
        return df['timestamp'].to_list()

    def calculate_and_adjust_dz(self):
        out_dict = {}
        # eval_dz_list = DemandZoneCalculator(self.eval_csv_path, self.tick, self.last_d_time, False).calculate_zones()
        # ana_dz_list = DemandZoneCalculator(self.ana_csv_path, self.tick, self.last_d_time, False).calculate_zones()
        eval_dz_list = self.eva_zone_analyser.get_filtered_fixed_buy_zone_for_fixature(self.eva_dz_calc.calculate_zones(), self.eva_sz_calc.calculate_zones())
        ana_dz_list = self.ana_zone_analyser.get_filtered_fixed_buy_zone_for_fixature(self.ana_dz_calc.calculate_zones(), self.ana_sz_calc.calculate_zones())
        exe_time_list = self.get_all_execute_timestamp_list(self.exe_csv_path)
        updated_eval_list = self.replace_timestamps(eval_dz_list, exe_time_list, exe_time_list[::-1][0])
        updated_ana_list = self.replace_timestamps(ana_dz_list, exe_time_list, exe_time_list[::-1][0])
        out_dict[self.time_list[0]] = updated_eval_list
        out_dict[self.time_list[1]] = updated_ana_list

        return out_dict

    def calculate_and_adjust_sz(self):
        out_dict = {}
        eval_dz_list = SupplyZoneCalculator(self.eval_csv_path, self.tick, self.last_d_time, False).calculate_zones()
        ana_dz_list = SupplyZoneCalculator(self.ana_csv_path, self.tick, self.last_d_time, False).calculate_zones()
        exe_time_list = self.get_all_execute_timestamp_list(self.exe_csv_path)
        updated_eval_list = self.replace_timestamps(eval_dz_list, exe_time_list, exe_time_list[::-1][0])
        updated_ana_list = self.replace_timestamps(ana_dz_list, exe_time_list, exe_time_list[::-1][0])
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
        self.eval_csv_path = f"{country_dir}/processed_data_files/{self.tick}_{self.time_list[0]}.csv"
        self.ana_csv_path = f"{country_dir}/processed_data_files/{self.tick}_{self.time_list[1]}.csv"
        self.exe_csv_path = f"{country_dir}/processed_data_files/{self.tick}_{self.time_list[-1]}.csv"
        # self.cbsz = Calculate_BUY_SELL_ZONES(csv_path, tick, last_d_time)
        self.eva_dz_calc = DemandZoneCalculator(self.eval_csv_path, self.tick, self.last_d_time, False)
        self.ana_dz_calc = DemandZoneCalculator(self.ana_csv_path, self.tick, self.last_d_time, False)

        self.eva_sz_calc = SupplyZoneCalculator(self.eval_csv_path, self.tick, self.last_d_time, False)
        self.ana_sz_calc = SupplyZoneCalculator(self.ana_csv_path, self.tick, self.last_d_time, False)

        self.eva_zone_analyser = ZoneAnalyzer(self.eva_dz_calc, self.eva_sz_calc)

        self.ana_zone_analyser = ZoneAnalyzer(self.ana_dz_calc, self.ana_sz_calc)


    def find_closest(self, lst, target):
        return min(lst, key=lambda x: abs(x - target))
    

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
        df['timestamp'] = pd.to_datetime(df['timestamp'], dayfirst = True)
        df = df[df.timestamp <= self.last_d_time]
        df['timestamp'] = (df['timestamp'].astype(np.int64) // 10**9).astype(int)
        return df['timestamp'].to_list()

    def calculate_and_adjust_dz(self):
        out_dict = {}
        # eval_dz_list = DemandZoneCalculator(self.eval_csv_path, self.tick, self.last_d_time, False).calculate_zones()
        # ana_dz_list = DemandZoneCalculator(self.ana_csv_path, self.tick, self.last_d_time, False).calculate_zones()
        eval_dz_list = self.eva_zone_analyser.get_filtered_fixed_buy_zone_for_fixature(self.eva_dz_calc.calculate_zones(), self.eva_sz_calc.calculate_zones())
        ana_dz_list = self.ana_zone_analyser.get_filtered_fixed_buy_zone_for_fixature(self.ana_dz_calc.calculate_zones(), self.ana_sz_calc.calculate_zones())
        exe_time_list = self.get_all_execute_timestamp_list(self.exe_csv_path)
        updated_eval_list = self.replace_timestamps(eval_dz_list, exe_time_list, exe_time_list[::-1][0])
        updated_ana_list = self.replace_timestamps(ana_dz_list, exe_time_list, exe_time_list[::-1][0])
        out_dict[self.time_list[0]] = updated_eval_list
        out_dict[self.time_list[1]] = updated_ana_list

        return out_dict

    def calculate_and_adjust_sz(self):
        out_dict = {}
        eval_dz_list = SupplyZoneCalculator(self.eval_csv_path, self.tick, self.last_d_time, False).calculate_zones()
        ana_dz_list = SupplyZoneCalculator(self.ana_csv_path, self.tick, self.last_d_time, False).calculate_zones()
        exe_time_list = self.get_all_execute_timestamp_list(self.exe_csv_path)
        updated_eval_list = self.replace_timestamps(eval_dz_list, exe_time_list, exe_time_list[::-1][0])
        updated_ana_list = self.replace_timestamps(ana_dz_list, exe_time_list, exe_time_list[::-1][0])
        out_dict[self.time_list[0]] = updated_eval_list
        out_dict[self.time_list[1]] = updated_ana_list
        
        return out_dict




class ZONE_TIME_FIXATURE_COMMODITY:
    def __init__(self, tick, time_frame, last_d_time, exp_num, data_dir) -> None:
        # self.csv_path = 
        self.tick = tick
        self.last_d_time = last_d_time
        self.time_list = getattr(stock_logic_config, f"COMMODITY_TIME_FRAME_{time_frame}")
        self.eval_csv_path = f"{data_dir}/processed_data_files/{self.tick}_{exp_num}_{self.time_list[0]}.csv"
        self.ana_csv_path = f"{data_dir}/processed_data_files/{self.tick}_{exp_num}_{self.time_list[1]}.csv"
        self.exe_csv_path = f"{data_dir}/processed_data_files/{self.tick}_{exp_num}_{self.time_list[-1]}.csv"
        # self.cbsz = Calculate_BUY_SELL_ZONES(csv_path, tick, last_d_time)
        self.eva_dz_calc = DemandZoneCalculator(self.eval_csv_path, self.tick, self.last_d_time, False)
        self.ana_dz_calc = DemandZoneCalculator(self.ana_csv_path, self.tick, self.last_d_time, False)

        self.eva_sz_calc = SupplyZoneCalculator(self.eval_csv_path, self.tick, self.last_d_time, False)
        self.ana_sz_calc = SupplyZoneCalculator(self.ana_csv_path, self.tick, self.last_d_time, False)

        self.eva_zone_analyser = ZoneAnalyzer(self.eva_dz_calc, self.eva_sz_calc)

        self.ana_zone_analyser = ZoneAnalyzer(self.ana_dz_calc, self.ana_sz_calc)

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

    def get_all_execute_timestamp_list(self, csv_path):
        df = pd.read_csv(csv_path)
        df['timestamp'] = pd.to_datetime(df['timestamp'], dayfirst = True)
        df = df[df.timestamp <= self.last_d_time]
        df['timestamp'] = (df['timestamp'].astype(np.int64) // 10**9).astype(int)
        return df['timestamp'].to_list()

    def calculate_and_adjust_dz(self):
        out_dict = {}
        # eval_dz_list = DemandZoneCalculator(self.eval_csv_path, self.tick, self.last_d_time, False).calculate_zones()
        # ana_dz_list = DemandZoneCalculator(self.ana_csv_path, self.tick, self.last_d_time, False).calculate_zones()
        eval_dz_list = self.eva_zone_analyser.get_filtered_fixed_buy_zone_for_fixature(self.eva_dz_calc.calculate_zones(), self.eva_sz_calc.calculate_zones())
        ana_dz_list = self.ana_zone_analyser.get_filtered_fixed_buy_zone_for_fixature(self.ana_dz_calc.calculate_zones(), self.ana_sz_calc.calculate_zones())
        exe_time_list = self.get_all_execute_timestamp_list(self.exe_csv_path)
        updated_eval_list = self.replace_timestamps(eval_dz_list, exe_time_list, exe_time_list[::-1][0])
        updated_ana_list = self.replace_timestamps(ana_dz_list, exe_time_list, exe_time_list[::-1][0])
        out_dict[self.time_list[0]] = updated_eval_list
        out_dict[self.time_list[1]] = updated_ana_list

        return out_dict

    def calculate_and_adjust_sz(self):
        out_dict = {}
        eval_dz_list = SupplyZoneCalculator(self.eval_csv_path, self.tick, self.last_d_time, False).calculate_zones()
        ana_dz_list = SupplyZoneCalculator(self.ana_csv_path, self.tick, self.last_d_time, False).calculate_zones()
        exe_time_list = self.get_all_execute_timestamp_list(self.exe_csv_path)
        updated_eval_list = self.replace_timestamps(eval_dz_list, exe_time_list, exe_time_list[::-1][0])
        updated_ana_list = self.replace_timestamps(ana_dz_list, exe_time_list, exe_time_list[::-1][0])
        out_dict[self.time_list[0]] = updated_eval_list
        out_dict[self.time_list[1]] = updated_ana_list
        
        return out_dict


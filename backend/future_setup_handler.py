from scripts.stock_utils import utility
import pandas_ta as ta
import pandas as pd
from shared.config.settings import stock_data_dir_config


class Setup_Handler_futures:
    def __init__(self, stock_tick, last_d_time, time_frame, exe_tf, exp_num, data_dir):
        self.stock_tick = stock_tick
        self.last_d_time = last_d_time
        self.exp_num = exp_num
        self.exe_tf = exe_tf
        self.data_dir = data_dir
        self.time_frame = time_frame
        self.util = utility(self.time_frame)

    def get_execute_df(self):
        exe_file_path = f"{self.data_dir}/processed_data_files/{self.stock_tick}_{self.exp_num}_{self.exe_tf}.csv"
        df = pd.read_csv(exe_file_path)
        df['timestamp'] = pd.to_datetime(df['timestamp'], dayfirst = True)
        df = df[df.timestamp <= self.last_d_time]
        return df

    def get_consecute_percent_as_per_cmp(self, cmp_price):
        if 0 <= cmp_price <= 200:
            return 0.02
        elif 200 < cmp_price <= 500:
            return 0.0175
        elif 500 < cmp_price <= 1000:
            return 0.015
        elif 1000 < cmp_price <= 2000:
            return 0.0125
        else:
            return 0.001
    
    def check_consecute_overlap(self, range1, range2):
        """
        Check if two numeric ranges (tuples) overlap.

        Args:
            range1 (tuple): First range as (start, end).
            range2 (tuple): Second range as (start, end).

        Returns:
            bool: True if they overlap, False if they are completely separate.
        """
        start1, end1 = sorted(range1)
        start2, end2 = sorted(range2)
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

    # def get_consecutive_zones(self, conse_dz, conse_sz, cmp, is_DZ):
    #     # print(conse_sz, "#####################")
    #     found_conz_zone = False
    #     conz_entry = None
    #     stop_loss = None
    #     if is_DZ:
    #         if len(conse_dz) >= 2:
    #             # conse_dz = sorted(conse_dz[0], reverse=True)
    #             if not self.check_consecute_overlap(conse_dz[0], conse_dz[1]):
    #                 range1 = min(conse_dz[0])
    #                 range2 = max(conse_dz[1])
    #                 conz_entry = range2 # round((range1+range2)/2, 2)
    #                 stop_loss = min(conse_dz[1])
    #                 zone_diff = abs(range2 - range1)
    #                 within_per = zone_diff <= (cmp*0.01)
    #                 # print(within_per, ut.calculate_percentage_distance(cmp, conz_entry), self.dynamic_percentage_distance(self.cmp_price))
    #                 print(zone_diff, cmp*0.01)
    #                 print("$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$", within_per, self.util.calculate_percentage_distance(cmp, conz_entry), self.dynamic_percentage_distance(cmp)+3)
    #                 if within_per and (self.util.calculate_percentage_distance(cmp, conz_entry) <= self.dynamic_percentage_distance(cmp)+3):
    #                     found_conz_zone = True
    #     else:
    #         if len(conse_sz) >= 2:
    #             if not self.check_consecute_overlap(conse_sz[0], conse_sz[1]):
    #                 range1 = max(conse_sz[0])
    #                 range2 = min(conse_sz[1])
    #                 conz_entry = range1
    #                 stop_loss = max(conse_sz[1])
    #                 zone_diff = abs(range2 - range1)
    #                 within_per = zone_diff <= (cmp * 0.01)
    #                 print(zone_diff, cmp*0.01)
    #                 print("$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$", within_per, self.util.calculate_percentage_distance(cmp, conz_entry), self.dynamic_percentage_distance(cmp)+3)
    #                 if within_per and (self.util.calculate_percentage_distance(cmp, conz_entry) <= self.dynamic_percentage_distance(cmp)+3):
    #                     found_conz_zone = True

    #     return found_conz_zone, conz_entry, stop_loss
    def get_consecutive_zones(self, conse_dz, conse_sz, cmp, is_DZ):
        # print(conse_sz, "#####################")
        found_conz_zone = False
        conz_entry = None
        stop_loss = None
        if is_DZ:
            if len(conse_dz) >= 2:
                conse_dz = sorted(conse_dz, reverse=True)
                if not self.check_consecute_overlap(conse_dz[0], conse_dz[1]):
                    range1 = min(conse_dz[0])
                    range2 = max(conse_dz[1])
                    conz_entry = range2 # round((range1+range2)/2, 2)
                    stop_loss = min(conse_dz[1])
                    zone_diff = abs(range2 - range1)
                    conse_percent = self.get_consecute_percent_as_per_cmp(cmp)
                    within_per = zone_diff <= (cmp*conse_percent)
                    # print(within_per, ut.calculate_percentage_distance(cmp, conz_entry), self.dynamic_percentage_distance(self.cmp_price))
                    print(zone_diff, cmp*conse_percent)
                    # print("$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$", within_per, self.util.calculate_percentage_distance(cmp, conz_entry), self.dynamic_percentage_distance(cmp)+3)
                    # if within_per and (self.util.calculate_percentage_distance(cmp, conz_entry) <= self.dynamic_percentage_distance(cmp)+3):
                    if within_per and (range2 <= conz_entry <= range1):
                        found_conz_zone = True
        else:
            if len(conse_sz) >= 2:
                conse_dz = sorted(conse_sz, reverse=True)
                if not self.check_consecute_overlap(conse_sz[0], conse_sz[1]):
                    range1 = max(conse_sz[0])
                    range2 = min(conse_sz[1])
                    conz_entry = range1
                    stop_loss = max(conse_sz[1])
                    zone_diff = abs(range2 - range1)
                    conse_percent = self.get_consecute_percent_as_per_cmp(cmp)
                    within_per = zone_diff <= (cmp*conse_percent)
                    # print(zone_diff, cmp*0.01)
                    # print("$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$", within_per, self.util.calculate_percentage_distance(cmp, conz_entry), self.dynamic_percentage_distance(cmp)+3)
                    # if within_per and (self.util.calculate_percentage_distance(cmp, conz_entry) <= self.dynamic_percentage_distance(cmp)+3):
                    if within_per and (range1 <= conz_entry <= range2):
                        found_conz_zone = True

        return found_conz_zone, conz_entry, stop_loss

    # def get_overlapping_zones(self, exe_dz, exe_sz, is_DZ):
    #     found_overlapping_zone = False
    #     stop_loss = None
    #     entry = None

    #     def safe_entry_stop(exe_zones, is_buy):
    #         # Limit to 2 most recent or closest zones
    #         zones = sorted(exe_zones, reverse=is_buy)[:2]
    #         overlapping_avg_points = self.find_single_overlap_points(zones, is_buy)
    #         print(f"overlapping points, {'buy' if is_buy else 'sell'}", overlapping_avg_points)

    #         if len(overlapping_avg_points) > 1:
    #             entry = max(overlapping_avg_points) if is_buy else min(overlapping_avg_points)
    #             stop_loss = min(zones[1]) if is_buy else max(zones[1])
    #             high_r = max(max(zones[0]), max(zones[1]))
    #             low_r = min(min(zones[0]), min(zones[1]))

    #             # ✅ Avoid entry == stoploss
    #             if abs(entry - stop_loss) < 1e-3:
    #                 print("⚠️ Entry and Stoploss too close or equal, skipping overlap")
    #                 return False, None, None

    #             if low_r <= entry <= high_r:
    #                 return True, entry, stop_loss
    #         return False, None, None

    #     if is_DZ and len(exe_dz) >= 2:
    #         return safe_entry_stop(exe_dz, is_buy=True)
    #     elif not is_DZ and len(exe_sz) >= 2:
    #         return safe_entry_stop(exe_sz, is_buy=False)

    #     return False, None, None

    # def get_overlapping_zones(self, exe_dz, exe_sz, is_DZ):
    #     found_overlapping_zone = False
    #     Stop_loss = None
    #     entry = None
    #     if is_DZ:
    #         if len(exe_dz) >= 2:
    #             overlapping_avg_points = self.find_single_overlap_points(exe_dz, is_DZ)
    #             # print("overlapping points, buy", overlapping_avg_points)
    #             high_r = max(max(exe_dz[0]), max(exe_dz[1]))
    #             low_r = min(min(exe_dz[0]), min(exe_dz[1]))
    #             if len(overlapping_avg_points) > 1:
    #                 entry = max(overlapping_avg_points) #[0]
    #                 Stop_loss = min(sorted(exe_dz, reverse=True)[1])
    #                 if low_r <= entry <= high_r:
    #                     found_overlapping_zone = True
    #     else:
    #         if len(exe_sz) >= 2:
    #             overlapping_avg_points = self.find_single_overlap_points(sorted(exe_sz, reverse=True), is_DZ)
    #             # print("overlapping points, sell", overlapping_avg_points)
    #             high_r = max(max(exe_sz[0]), max(exe_sz[1]))
    #             low_r = min(min(exe_sz[0]), min(exe_sz[1]))
    #             if len(overlapping_avg_points) > 1:
    #                 entry = min(overlapping_avg_points[1:]) #[1]
    #                 Stop_loss = high_r # max(sorted(exe_sz, reverse=True)[1])
    #                 if low_r <= entry <= high_r:
    #                     found_overlapping_zone = True

    #     return found_overlapping_zone, entry, Stop_loss
    def get_overlapping_zones(self, exe_dz, exe_sz, is_DZ):
        found_overlapping_zone = False
        Stop_loss = None
        entry = None
        if is_DZ:
            if len(exe_dz) >= 2:
                exe_dz = sorted(exe_dz, reverse=True)
                overlapping_avg_points = self.find_single_overlap_points(exe_dz, is_DZ)
                # print("overlapping points, buy", overlapping_avg_points)
                high_r = max(max(exe_dz[0]), max(exe_dz[1]))
                first_low_r = min(exe_dz[0])
                low_r = min(min(exe_dz[0]), min(exe_dz[1]))
                if len(overlapping_avg_points) > 1:
                    entry = max(overlapping_avg_points) #[0]
                    Stop_loss = min(sorted(exe_dz, reverse=True)[1])
                    if first_low_r <= entry <= high_r and low_r <= entry <= high_r:
                        found_overlapping_zone = True
                    if entry == Stop_loss:
                        Stop_loss = self.util.calculate_atr(self.get_execute_df(), entry)
        else:
            if len(exe_sz) >= 2:
                exe_sz = sorted(exe_sz, reverse=True)
                overlapping_avg_points = self.find_single_overlap_points(exe_sz, is_DZ)
                # print("overlapping points, sell", overlapping_avg_points)
                high_r = max(max(exe_sz[0]), max(exe_sz[1]))
                first_low_r = min(exe_sz[0])
                low_r = min(min(exe_sz[0]), min(exe_sz[1]))
                if len(overlapping_avg_points) > 1:
                    entry = min(overlapping_avg_points[1:]) #[1]
                    Stop_loss = high_r # max(sorted(exe_sz, reverse=True)[1])
                    if low_r <= entry <= high_r and first_low_r <= entry <= high_r:
                        found_overlapping_zone = True
                    if entry == Stop_loss:
                        Stop_loss = self.util.calculate_atr_sell(self.get_execute_df(), entry)

        return found_overlapping_zone, entry, Stop_loss
    
    def calculate_ema_zone(self, exe_dz, exe_sz, is_DZ):
        ut = utility(self.time_frame)
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
                    if not(2.5 <= ut.calculate_percentage_distance(entry, stop_loss) <= 15):
                        stop_loss = ut.calculate_atr(self.get_execute_df(), entry, 14)
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
                    if not(1 <= ut.calculate_percentage_distance(entry, stop_loss) <= 15):
                        stop_loss = ut.calculate_atr_sell(self.get_execute_df(), entry, 14)
                    found_ema_zone = True

        return found_ema_zone, entry, stop_loss
    
    def get_overlapped_buy_decition(self, cmp, dz_distance_list, dz_ana_distance_percent, dz_eva_distance_percent, overlap_dz_ana, overlap_dz_eva):
        found_overlapping_point = False
        ut = utility(self.time_frame)
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
        ut = utility(self.time_frame)
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
    
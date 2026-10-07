import pandas as pd
import numpy as np
from datetime import timedelta
from scripts.stock_utils import utility
from scripts.calculate_zones_bkt import DemandZoneCalculator, SupplyZoneCalculator, ZoneAnalyzer
# from concurrent.futures import ProcessPoolExecutor
from scripts.setup_handler import Setup_Handler
from scripts.setup_reason_handler import setup_reason
from shared.config.settings import stock_logic_config
from datetime import datetime
from shared.utils.logger import logger


class Calculate_setup_execute:
    def __init__(self, stock_name, time_frame, last_dt, country_dir) -> None:
        self.stock_tick = stock_name
        self.time_frame = time_frame
        self.country_dir = country_dir
        self.last_d_time = last_dt
        self.cmp_price = None
        self.ut = utility()
        if time_frame == 25:
            self.time_list = ['weekly', 'daily', 'seventy_five']
        else:
            self.time_list = getattr(stock_logic_config, f"TIME_FRAMES_{time_frame}")
        self.SH = Setup_Handler(stock_name, country_dir, last_dt, self.time_list[-1])
        self.st_reason = setup_reason()

    def ranges_overlap(self, r1, r2):
        """Returns True if two price ranges overlap"""
        start1, end1 = min(r1), max(r1)
        start2, end2 = min(r2), max(r2)
        return start1 <= end2 and start2 <= end1

    def add_timestamp(self):
        if self.time_frame == 1:
            return timedelta(days=30).total_seconds()
        elif self.time_frame == 2:
            return timedelta(hours=720).total_seconds()
        elif self.time_frame == 3:
            return timedelta(hours=720).total_seconds()
        elif self.time_frame == 25:
            return timedelta(hours=720).total_seconds()

    def get_stock_trend(self):
        t_frame = self.time_list[1]
        file_name = f"{self.country_dir}/processed_data_files/{self.stock_tick}_{t_frame}.csv"
        dz_cal = DemandZoneCalculator(file_name, self.stock_tick, self.last_d_time, is_execute=False)
        sz_cal = SupplyZoneCalculator(file_name, self.stock_tick, self.last_d_time, is_execute=False)
        z_ana = ZoneAnalyzer(dz_cal, sz_cal)
        trend = z_ana.calculate_overall_trend()
        if trend == 'uptrend':
            return True
        elif trend == 'sideways':
            return False
        else:
            return False
        
    def find_overlaps_between_zones(self, list1, list2):
        overlaps = []
        for r1 in list1:
            for r2 in list2:
                start1, end1 = r1
                start2, end2 = r2
                overlap_start = max(start1, start2)
                overlap_end = min(end1, end2)
                if overlap_start < overlap_end:
                    overlaps.append((overlap_start, overlap_end)) # (r1, r2,             
        return overlaps
    
    def get_ea_zones_info(self, time_index, is_exe):
        eval_frame = self.time_list[time_index]
        dz_price_ranges = []
        sz_price_ranges = []
        csv_file_path = f"{self.country_dir}/processed_data_files/{self.stock_tick}_{eval_frame}.csv"
        # eval_cbsz = Calculate_BUY_SELL_ZONES(csv_file_path, self.stock_tick, self.last_d_time, is_exe)
        # with ProcessPoolExecutor(max_workers=4) as executor:
        eval_dz_cal = DemandZoneCalculator(csv_file_path, self.stock_tick, self.last_d_time, is_exe)
        eval_sz_cal = SupplyZoneCalculator(csv_file_path, self.stock_tick, self.last_d_time, is_exe)
        eval_df_dz = eval_dz_cal.calculate_zone_with_details()
        eval_df_sz = eval_sz_cal.calculate_zone_with_details()
        # eval_df_dz = eval_dz_cal.calculate_zones()
        # eval_df_sz = eval_sz_cal.calculate_zones()
        # cmp_price, cmp_time_stamp = self.get_cmp_price_tstamp(csv_file_path, self.last_d_time)
        # print(csv_file_path, cmp_price, cmp_time_stamp, "................................")
        # print(eval_df_dz, eval_df_sz)
        for demand_zones in eval_df_dz:
            dz_price_ranges.append(demand_zones["range"])
        for supply_zones in eval_df_sz:
            sz_price_ranges.append(supply_zones["range"])

        dz_filtered = []
        for dz in dz_price_ranges:
            if not any(self.ranges_overlap(dz, sz) for sz in sz_price_ranges):
                dz_filtered.append(dz)
        sz_filtered = []
        for sz in sz_price_ranges:
            if not any(self.ranges_overlap(sz, dz) for dz in dz_price_ranges):
                sz_filtered.append(sz)
        
        return dz_filtered, sz_filtered #, cmp_price, cmp_time_stamp

    def get_qualified_exe_zones_info(self, exe_frame):
        dz_price_ranges = []
        sz_price_ranges = []
        # exe_frame = self.time_list[time_index]
        csv_file_path = f"{self.country_dir}/processed_data_files/{self.stock_tick}_{exe_frame}.csv"
        # with ProcessPoolExecutor(max_workers=4) as executor:
        exe_dz_cal = DemandZoneCalculator(csv_file_path, self.stock_tick, self.last_d_time, True)
        exe_sz_cal = SupplyZoneCalculator(csv_file_path, self.stock_tick, self.last_d_time, True)
        zone_analyser = ZoneAnalyzer(exe_dz_cal, exe_sz_cal)
        # trend = zone_analyser.calculate_overall_trend()
        res_t = True #self.get_stock_trend()
        # print("Qualified Zone Stock trend.............", res_t)
        if res_t:
            alt_qual = zone_analyser.get_qualified_alterated_zones(True)
            qualified_dz_list = sorted(alt_qual['Buy'], key=lambda z: z[0]["time"], reverse=True)
            qualified_sz_list = sorted(alt_qual['Sell'], key=lambda z: z[0]["time"], reverse=True)
            for qual_dz in qualified_dz_list:
                dz_price_ranges.append((qual_dz[0]['price'], qual_dz[1]['price']))
            for qual_sz in qualified_sz_list:
                sz_price_ranges.append((qual_sz[0]['price'], qual_sz[1]['price']))
        else:
            alt_qual = zone_analyser.get_qualified_alterated_zones(False)
            # print(alt_qual)
            qualified_dz_list = sorted(alt_qual['Buy'], key=lambda z: z[0]["time"], reverse=True)
            qualified_sz_list = sorted(alt_qual['Sell'], key=lambda z: z[0]["time"], reverse=True)
            for qual_dz in qualified_dz_list:
                dz_price_ranges.append((qual_dz[0]['price'], qual_dz[1]['price']))
            for qual_sz in qualified_sz_list:
                sz_price_ranges.append((qual_sz[0]['price'], qual_sz[1]['price']))
        return dz_price_ranges, sz_price_ranges, qualified_sz_list

    def get_execute_df(self):
        exe_tf = self.time_list[-1]
        exe_file_path = f"{self.country_dir}/processed_data_files/{self.stock_tick}_{exe_tf}.csv"
        df = pd.read_csv(exe_file_path)
        df['timestamp'] = pd.to_datetime(df['timestamp'], dayfirst=True)
        df = df[df.timestamp <= self.last_d_time]
        return df

    def get_analyse_df(self):
        exe_tf = self.time_list[1]
        exe_file_path = f"{self.country_dir}/processed_data_files/{self.stock_tick}_{exe_tf}.csv"
        df = pd.read_csv(exe_file_path)
        df['timestamp'] = pd.to_datetime(df['timestamp'], dayfirst=True)
        df = df[df.timestamp <= self.last_d_time]
        return df
    
    def get_all_reasons(self):
        return self.st_reason.all()

    def extract_zone_floor(self, z):
        """Return a single float floor price for a sell zone, or None."""
        floors = []
        stack = [z]
        while stack:
            x = stack.pop()
            # number
            if isinstance(x, (int, float)):
                floors.append(float(x))
                continue
            # dict
            if isinstance(x, dict):
                # direct keys
                for k in ("price", "low", "min", "l"):
                    if k in x and x[k] is not None:
                        try:
                            floors.append(float(x[k]))
                        except Exception:
                            pass
                # range keys
                if "from" in x and "to" in x and x["from"] is not None and x["to"] is not None:
                    try:
                        floors.append(float(min(x["from"], x["to"])))
                    except Exception:
                        pass
                continue
            # list/tuple -> flatten
            if isinstance(x, (list, tuple)):
                stack.extend(x)
                continue
            # unknown type -> ignore
        return min(floors) if floors else None

    def pick_target(self, zones, entry, risk, min_rr, max_rr):
        """Pick best target from zones within RR band; closest to min_rr wins."""
        if not zones:
            return None
        candidates = []
        for z in zones:
            p = self.extract_zone_floor(z)
            if p is None or p <= entry:
                continue
            rr = (p - entry) / risk
            if rr < min_rr or rr > max_rr:
                continue
            candidates.append((rr, p))
        if not candidates:
            return None
        # sort by rr ascending (closest above min_rr), then price
        candidates.sort(key=lambda t: (t[0], t[1]))
        return float(candidates[0][1])

    def predict_trend(self, df: pd.DataFrame) -> str:
        """
        Predicts trend (Uptrend, Downtrend, Sideways) based on EMA 20 and last 7 days' closing prices.
        
        Parameters:
            df (pd.DataFrame): Must contain at least 20 rows and a 'Close' column.
        
        Returns:
            str: 'Uptrend', 'Downtrend', or 'Sideways'
        """
        if 'close' not in df.columns:
            return "DataFrame must contain a 'close' column."
        
        if len(df) < 20:
            return "Insufficient data. Need at least 20 rows for EMA calculation."

        # Calculate EMA 20
        df['EMA_20'] = df['close'].ewm(span=20, adjust=False).mean()

        # Select the last 7 rows
        last_7 = df.iloc[-7:]

        # Extract closing prices and EMA values
        closes = last_7['close'].values
        emas = last_7['EMA_20'].values

        # Count how many days close was above or below EMA
        above_ema = np.sum(closes > emas)
        below_ema = np.sum(closes < emas)

        # Slope of closing prices over last 7 days
        slope = np.polyfit(range(7), closes, 1)[0]

        # Determine trend
        if above_ema >= 5 and slope > 0:
            self.st_reason.set("trend", "Uptrend")
            return "Uptrend"
        elif below_ema >= 5 and slope < 0:
            self.st_reason.set("trend", "Downtrend")
            return "Downtrend"
        else:
            self.st_reason.set("trend", "Sideways")
            return "Sideways"

    def get_cmp_price_tstamp(self, file_name, last_d_time):
        df = pd.read_csv(file_name)
        df['timestamp'] = pd.to_datetime(df['timestamp'], dayfirst=True)
        df = df[df.timestamp <= last_d_time]
        cmp_ex = df.iloc[-1]['close']
        self.cmp_price = cmp_ex
        cmp_t_stamp = int(df.iloc[-1]['timestamp'].timestamp())
        return cmp_ex, cmp_t_stamp

    def get_mtf_zones(self):
        eva_dz, eva_sz = self.get_ea_zones_info(0, False)
        ana_dz, ana_sz = self.get_ea_zones_info(1, False)
        normal_dz, normal_sz = self.get_ea_zones_info(-1, True)
        exe_dz, exe_sz, e_exe_sz = self.get_qualified_exe_zones_info(self.time_list[-1])
        exe_tf = self.time_list[-1]
        exe_file_path = f"{self.country_dir}/processed_data_files/{self.stock_tick}_{exe_tf}.csv"
        self.cmp_price, self.cmp_ts = self.get_cmp_price_tstamp(exe_file_path, self.last_d_time)
        filtered_exe_dz = self.filter_execute_zones_within(exe_dz, ana_dz + eva_dz)
        filtered_exe_sz = self.filter_execute_zones_within(exe_sz, ana_sz + eva_sz)
        return {
            'evaluate': {'dz': eva_dz, 'sz': eva_sz},
            'analyze': {'dz': ana_dz, 'sz': ana_sz},
            'execute': {
                'dz': exe_dz,
                'sz': exe_sz,
                'filtered_dz': filtered_exe_dz,
                'filtered_sz': filtered_exe_sz,
                'qualified_raw': e_exe_sz,
                'normal_dz': normal_dz,
                'normal_sz': normal_sz
            }
        }
    
    def percentage_proximity_to_range(self, overlap_range, cmp):
        """
        Calculate the percentage distance of a cmp to an overlap range.
        """
        start, end = overlap_range
        if cmp < start:
            # Calculate the percentage distance when cmp is below the range
            return ((start - cmp) / cmp) * 100
        elif cmp > end:
            # Calculate the percentage distance when cmp is above the range
            return ((cmp - end) / cmp) * 100
        else:
            # Price is within the range, so proximity is 0%
            return 0
        
    # def calculate_buy_target_point(self, exe_sz, e_exe_sz, ana_sz, eva_sz, entry, stop):
    #     # print(entry)
    #     target = None
    #     if len(exe_sz) > 0:
    #         exe_sz = sorted(exe_sz, reverse=False)
    #         # ex_sz = exe_sz[0]
    #         target = min(exe_sz[0])
    #         # target = min(ex_sz[0]['price'], ex_sz[1]['price'])
    #     elif len(ana_sz) > 0 and target is None:
    #         if min(ana_sz[0]) > entry: target = min(ana_sz[0]) 
    #     elif len(eva_sz) > 0 and target is None:
    #         if min(eva_sz[0]) > entry: target = min(eva_sz[0])
    #     if target is None:
    #         target = entry + ((entry - stop)*2)
    #     return target
    def calculate_buy_target_point(self, exe_sz, e_exe_sz, ana_sz, eva_sz, entry, stop):
        min_rr = 2.1
        max_rr = 5
        try:
            entry = float(entry)
            stop = float(stop)
        except Exception:
            return entry  # safe fallback

        risk = entry - stop
        if risk <= 0:
            # invalid for a buy setup; return entry to avoid explosions
            return entry    

        exe_all = []
        if exe_sz:   exe_all.extend(exe_sz)
        if e_exe_sz: exe_all.extend(e_exe_sz)

        htf_all = []
        if ana_sz:   htf_all.extend(ana_sz)
        if eva_sz:   htf_all.extend(eva_sz)
        tgt = self.pick_target(exe_all, entry, risk, min_rr, max_rr)
        if tgt is not None:
            return tgt
        
        tgt = self.pick_target(htf_all, entry, risk, min_rr, max_rr)
        if tgt is not None:
            return tgt
        
        return float(entry + min_rr * risk)
        


    def calculate_sell_target_point(self, exe_dz, e_exe_sz, ana_dz, eva_dz, entry, stop):
        target = None
        possible_sell_targets = []
        if len(exe_dz) > 0:
            exe_dz = sorted(exe_dz, reverse=True)
            ex_dz = exe_dz[0]
            target = max(ex_dz)
            possible_sell_targets.append(target)
            # print('target exe_dz sell', exe_dz)
        elif len(ana_dz) > 0:
            ana_dz = sorted(ana_dz, reverse=True)
            if max(ana_dz[0]) < entry:
                target = max(ana_dz[0])
                possible_sell_targets.append(target)
                # print('target ana_dz sell', target)
        elif len(eva_dz) > 0:
            eva_dz = sorted(eva_dz, reverse=True)
            if max(eva_dz[0]) < entry:
                target = max(eva_dz[0])
                possible_sell_targets.append(target)
                # print('target eva_dz sell', target)
        if possible_sell_targets:
            target = max(possible_sell_targets)
        else:
            target = entry - ((stop - entry) * 1.6)
        
        return target
    
    def filter_execute_zones_within(self, exe_zones, higher_tf_zones, threshold_pct=0):
        """Returns only those execute zones that are fully within any higher timeframe zone"""
        filtered = []
        for exe_start, exe_end in exe_zones:
            for ranges in higher_tf_zones:
                higher_end = max(ranges)
                higher_start = min(ranges)
                # range_size = higher_end - higher_start
                # buffer = (threshold_pct / 100) * range_size
                adjusted_start = higher_start #- buffer
                adjusted_end = higher_end #+ buffer

                if adjusted_start <= exe_start and exe_end <= adjusted_end:
                    filtered.append((exe_start, exe_end))
                    break
        return filtered

    def try_entry_from_zones(self, exe_dz, exe_sz, is_DZ):
        # print("..................................", is_DZ)
        setup_type = None
        conse_dz = exe_dz
        conse_sz = exe_sz
        found_conse, entry, stop = self.SH.get_consecutive_zones(conse_dz, conse_sz, self.cmp_price, is_DZ)
        print("conse_dz", found_conse)
        if found_conse:
            setup_type = "Consecutive"
            self.st_reason.set("zone_type", "Consecutive") 
            return entry, stop, setup_type
        found_overlap, entry, stop = self.SH.get_overlapping_zones(exe_dz, exe_sz, is_DZ)
        print("found_overlap", found_overlap)
        if found_overlap:
            setup_type = "Overlapping"
            self.st_reason.set("zone_type", "Overlapping") 
            return entry, stop, setup_type
        found_ema, entry, stop = self.SH.calculate_ema_zone(exe_dz, exe_sz, is_DZ)
        print("found_ema", found_ema)
        if found_ema:
            setup_type = "EMAZONE"
            self.st_reason.set("zone_type", "Execute EMA Zone")
            return entry, stop, setup_type
        if is_DZ:
            found_final, entry, stop = self.SH.get_overlapped_buy_decition(self.cmp_price, self.dz_distance_list, self.dz_ana_distance_percent, self.dz_eva_distance_percent, self.overlap_dz_ana, self.overlap_dz_eva)
        else:
            found_final, entry, stop = self.SH.get_overlapped_supply_decision(self.cmp_price, self.sz_distance_list, self.sz_ana_distance_percent, self.sz_eva_distance_percent, self.overlap_sz_ana, self.overlap_sz_eva)
        print("found_final", found_final)
        if found_final:
            setup_type = "Final"
            self.st_reason.set("zone_type", "Final from higher tf")
            return entry, stop, setup_type
        self.st_reason.set("zone_type", "Zone in Zone Standalone Execute")
        setup_type = "Standalone"
        if is_DZ:
            return max(exe_dz[0]), min(exe_dz[0]), setup_type if exe_dz else (None, None, setup_type)
        else:
            return min(exe_sz[0]), max(exe_sz[0]), setup_type if exe_sz else (None, None, setup_type)

    def calculate(self):
        mtf_zones = self.get_mtf_zones()
        cmp = self.cmp_price
        out_data = {
            'STOCK_NAME': self.stock_tick,
            'TIME_FR': self.time_frame,
            'PRICE_CMP': cmp
        }

        # Determine trade direction
        exe_dz = mtf_zones['execute']['dz']
        exe_sz = mtf_zones['execute']['sz']
        # print(exe_dz, "exe_dz")
        filtered_exe_dz = mtf_zones['execute']['filtered_dz']
        filtered_exe_sz = mtf_zones['execute']['filtered_sz']
        ana_dz = mtf_zones['analyze']['dz']
        ana_sz = mtf_zones['analyze']['sz']
        eva_dz = mtf_zones['evaluate']['dz']
        eva_sz = mtf_zones['evaluate']['sz']
        # e_exe_sz = mtf_zones['execute']['qualified_raw']
        # normal_dz = mtf_zones['execute']['normal_dz']
        # normal_sz = mtf_zones['execute']['normal_sz']

        self.overlap_dz_eva = sorted(self.find_overlaps_between_zones(eva_dz, exe_dz), reverse=True)
        self.overlap_dz_ana = sorted(self.find_overlaps_between_zones(ana_dz, exe_dz), reverse=True)
        self.overlap_sz_eva = sorted(self.find_overlaps_between_zones(eva_sz, exe_sz))
        self.overlap_sz_ana = sorted(self.find_overlaps_between_zones(ana_sz, exe_sz))

        self.dz_ana_distance_percent = self.percentage_proximity_to_range(self.overlap_dz_ana[0], cmp) if len(self.overlap_dz_ana) > 0 else None
        self.dz_eva_distance_percent = self.percentage_proximity_to_range(self.overlap_dz_eva[0], cmp) if len(self.overlap_dz_eva) > 0 else None
        self.sz_ana_distance_percent = self.percentage_proximity_to_range(self.overlap_sz_ana[0], cmp) if len(self.overlap_sz_ana) > 0 else None
        self.sz_eva_distance_percent = self.percentage_proximity_to_range(self.overlap_sz_eva[0], cmp) if len(self.overlap_sz_eva) > 0 else None

        self.dz_distance_list = [self.dz_eva_distance_percent, self.dz_ana_distance_percent]
        self.sz_distance_list = [self.sz_eva_distance_percent, self.sz_ana_distance_percent]

        trade_opt = []
        diff = None
        # print(exe_dz, exe_sz, 'calculate ................ccccccccccccccccccccccccccccccccc')
        # print(ana_sz, eva_sz, 'ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ')
        if filtered_exe_dz and filtered_exe_sz:
            sell_high = max(filtered_exe_sz[0])
            d_low = min(filtered_exe_dz[0])
            trade_opt, diff = self.ut.check_and_return_price_pos(sell_high, d_low, cmp)
        elif filtered_exe_dz:
            # d_low = min(filtered_exe_dz[0])
            # d_high_result = next((x for x in [ana_sz, eva_sz] if x), None)
            # if d_high_result is not None:
            #     act_d_high = max(min(d_high_result, key=lambda x: min(x)))
            #     # print(act_d_high, 'act_d_high')
            #     trade_opt, diff = self.ut.check_and_return_price_pos(act_d_high, d_low, cmp)
            # else:
            trade_opt.append('BUY')
            
        elif filtered_exe_sz:
            # sell_high = max(filtered_exe_sz[0])
            # d_low_result = next((x for x in [ana_dz, eva_dz] if x), None)
            # if d_low_result is not None:
            #     act_d_low = min(max(d_low_result, key=lambda x: max(x)))
            #     trade_opt, diff = self.ut.check_and_return_price_pos(sell_high, act_d_low, cmp)
            # else:
            trade_opt.append('SELL')

        
        print(trade_opt, diff, "##############")
        trend = self.predict_trend(self.get_analyse_df())
        
        # if trend == 'Uptrend':
        # with ProcessPoolExecutor(max_workers=4) as executor:
        if 'BUY' in trade_opt:
            buy_setup = self.calculate_buy_setup(mtf_zones, diff)
            if buy_setup and trend != 'Downtrend':
                out_data.update(buy_setup)

        if 'SELL' in trade_opt:
            sell_setup = self.calculate_sell_setup(mtf_zones, diff)
            if sell_setup and trend != 'Uptrend':
                out_data.update(sell_setup)

        # print("OUT DATA............................")
        # print(out_data)
        return out_data # if ('BUY' in out_data or 'SELL' in out_data) else None

    def calculate_buy_setup(self, mtf, price_pos):
        setup = {}
        eva_price_pos = None
        # print('Buy setup calculation.........................................', self.last_d_time)
        exe_dz = mtf['execute']['dz']
        exe_sz = mtf['execute']['sz']
        filtered_exe_dz = mtf['execute']['filtered_dz']
        filtered_exe_sz = mtf['execute']['filtered_sz']
        ana_dz = mtf['analyze']['dz']
        ana_sz = mtf['analyze']['sz']
        eva_dz = mtf['evaluate']['dz']
        eva_sz = mtf['evaluate']['sz']
        e_exe_sz = mtf['execute']['qualified_raw']
        normal_dz = mtf['execute']['normal_dz']
        normal_sz = mtf['execute']['normal_sz']

        if eva_dz and eva_sz:
            _, eva_price_pos = self.ut.check_and_return_price_pos(max(eva_sz[0]), min(eva_dz[0]), self.cmp_price)
        elif eva_dz:
            _, eva_price_pos = self.ut.check_and_return_price_pos(self.cmp_price + 1, min(eva_dz[0]), self.cmp_price)
        elif eva_sz:
            _, eva_price_pos = self.ut.check_and_return_price_pos(max(eva_sz[0]), self.cmp_price - 1, self.cmp_price)
        
        if eva_price_pos is not None and price_pos is not None:
            if eva_price_pos >= 66.6 and price_pos <= 33.3:
                # print(f"Evaluate at {eva_price_pos}% and execute at {price_pos}%")
                setup['reason'] = f"Evaluate at {round(eva_price_pos, 2)}% and execute at {round(price_pos, 2)}%"
                return setup

        if filtered_exe_dz and not filtered_exe_sz and not ana_sz and not eva_sz:
            entry, stop, setup_type = self.try_entry_from_zones(filtered_exe_dz, filtered_exe_sz, True)
            setup['BUY'], setup['BUY_RRR'] = self.ut.create_2_no_sell_zone_buy_alert(entry, stop, setup_type)
            setup['BUY_TIMESTAMPS'] = {
                "entry_price_timestamp": self.cmp_ts,
                "target_price_timestamp": self.cmp_ts,
                "extend_timestamp": self.cmp_ts + self.add_timestamp()
            }

        elif filtered_exe_dz and (filtered_exe_sz or ana_sz or eva_sz):
            entry, stop, setup_type = self.try_entry_from_zones(filtered_exe_dz, exe_sz, True)
            target = self.calculate_buy_target_point(normal_sz, e_exe_sz, ana_sz, eva_sz, entry, stop)
            print('target..................................actual', target)
            setup['BUY'], setup['BUY_RRR'] = self.ut.create_buy_alert(stop, entry, target, setup_type)
            setup['BUY_TIMESTAMPS'] = {
                "entry_price_timestamp": self.cmp_ts,
                "target_price_timestamp": self.cmp_ts,
                "extend_timestamp": self.cmp_ts + self.add_timestamp()
            }
        return setup


        

    def calculate_sell_setup(self, mtf, price_pos):
        setup = {}
        eva_price_pos = None
        # print('Sell setup calculation............................................')
        exe_dz = mtf['execute']['dz']
        exe_sz = mtf['execute']['sz']
        filtered_exe_dz = mtf['execute']['filtered_dz']
        filtered_exe_sz = mtf['execute']['filtered_sz']
        ana_dz = mtf['analyze']['dz']
        ana_sz = mtf['analyze']['sz']
        eva_dz = mtf['evaluate']['dz']
        eva_sz = mtf['evaluate']['sz']
        e_exe_sz = mtf['execute']['qualified_raw']
        # print(exe_dz, "............................................")
        if eva_dz and eva_sz:
            _, eva_price_pos = self.ut.check_and_return_price_pos(max(eva_sz[0]), min(eva_dz[0]), self.cmp_price)
        elif eva_dz:
            _, eva_price_pos = self.ut.check_and_return_price_pos(self.cmp_price + 1, min(eva_dz[0]), self.cmp_price)
        elif eva_sz:
            _, eva_price_pos = self.ut.check_and_return_price_pos(max(eva_sz[0]), self.cmp_price - 1, self.cmp_price)
        if eva_price_pos is not None and price_pos is not None:
            if eva_price_pos <= 33.3 and price_pos >= 66.6:
                setup['reason'] = f"Evaluate at {round(eva_price_pos, 2)}% and execute at {round(price_pos, 2)}%"
                return setup
        
        if filtered_exe_sz and not exe_dz and not ana_dz and not eva_dz:
            print("sell setup type 1 without buy zone")
            entry, stop, setup_type = self.try_entry_from_zones(exe_dz, filtered_exe_sz, False)
            setup['SELL'], setup['SELL_RRR'] = self.ut.create_2_no_buy_zone_sell_alert(entry, stop)
            setup['SELL_TIMESTAMPS'] = {
                "entry_price_timestamp": self.cmp_ts,
                "target_price_timestamp": self.cmp_ts,
                "extend_timestamp": self.cmp_ts + self.add_timestamp()
            }
            
        elif filtered_exe_sz and (filtered_exe_dz or ana_dz or eva_dz):
            print("sell setup type 2 with buy zone")
            entry, stop, setup_type = self.try_entry_from_zones(exe_dz, filtered_exe_sz, False)
            target = self.calculate_sell_target_point(exe_dz, e_exe_sz, ana_dz, eva_dz, entry, stop)
            setup['SELL'], setup['SELL_RRR'] = self.ut.create_sell_alert(stop, entry, target)
            setup['SELL_TIMESTAMPS'] = {
                "entry_price_timestamp": self.cmp_ts,
                "target_price_timestamp": self.cmp_ts,
                "extend_timestamp": self.cmp_ts + self.add_timestamp()
            }
        return setup

        # Mirror the buy logic but using supply zones for entry and demand zones for target
        # All helper methods like overlaps, EMA, ATR, consecutive_zones must work in reverse
        # Return something like: {'SELL': {...}, 'SELL_RRR': x, 'SELL_TIMESTAMPS': {...}}
        

    # Add your helper methods here: overlap checks, EMA zone validation, consecutive zones logic, etc.
    # These should work for both BUY and SELL sides based on a direction flag

    # Example signature:
    # def get_overlapping_zones(self, zones, side='BUY'):
    # def calculate_ema_zone(self, zones, side='BUY'):
    # def get_consecutive_zones(self, zones, side='BUY'):
    # def calculate_target_zone(self, entry, mtf, side='BUY'):
    # def create_alert(self, entry, stop, target, side='BUY'):
    # etc.

    # This helps make BUY and SELL logic symmetrical and clean

# Note: Fill in `calculate_buy_setup` and `calculate_sell_setup` by adapting your original logic
# from the `calculate()` method. Use inversion for SELL (e.g., supply entry, demand target)
# Let me know if you'd like me to fill those two methods too.

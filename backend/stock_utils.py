
import pandas as pd
import os
import numpy as np
from shared.config.settings import stock_logic_config

class utility:
    def __init__(self, time_frame) -> None:
        self.time_frame = time_frame

    def calculate_risk_to_reward(self, entry_price : float, stop_loss : float, target_price : float):
        risk = abs(entry_price - stop_loss)
        reward = abs(target_price - entry_price)
        if risk > 0 and reward > 0:
            risk_to_reward_ratio = reward / risk
            return round(risk_to_reward_ratio, 2)
        else:
            return 0

    def is_in_range(self, n, start, end):
        return start <= n <= end
    
    def calculate_entry_threshold(self, entry_line):
        if 0 <= entry_line <= 200:
            adj_entry = entry_line + (0.008*entry_line)
        elif 201 <= entry_line <= 700:
            adj_entry = entry_line + (0.005*entry_line)
        elif 701 <= entry_line <= 3000:
            adj_entry = entry_line + (0.003*entry_line)
        else:
            adj_entry = entry_line + (0.0005*entry_line)
        return adj_entry
    
    def calculate_entry_threshold_sell(self, entry_line):
        if 0 <= entry_line <= 200:
            adj_entry = entry_line - (0.005*entry_line)
        elif 201 <= entry_line <= 700:
            adj_entry = entry_line - (0.003*entry_line)
        elif 701 <= entry_line <= 3000:
            adj_entry = entry_line - (0.002*entry_line)
        else:
            adj_entry = entry_line - (0.0005*entry_line)
        return adj_entry

    
    def calculate_stoploss_threshold_sell(self, stop_line, stop_dff):
        ex_diff = 0.005 #abs(3 - stop_dff)
        if 0 <= stop_line <= 200:
            adj_stop = stop_line + ((ex_diff+0.008)*stop_line)
        elif 201 <= stop_line <= 700:
            adj_stop = stop_line + ((ex_diff+0.005)*stop_line)
        elif 701 <= stop_line <= 3000:
            adj_stop = stop_line + ((ex_diff+0.003)*stop_line)
        else:
            adj_stop = stop_line + ((ex_diff+0.0005)*stop_line)
        return adj_stop
    
    def calculate_stoploss_threshold(self, stop_line, stop_dff):
        ex_diff = 0.01 if self.time_frame == 1 else 0.005 #abs(3 - stop_dff)
        if 0 <= stop_line <= 200:
            adj_stop = stop_line - ((ex_diff+0.008)*stop_line)
        elif 201 <= stop_line <= 700:
            adj_stop = stop_line - ((ex_diff+0.005)*stop_line)
        elif 701 <= stop_line <= 3000:
            adj_stop = stop_line - ((ex_diff+0.003)*stop_line)
        else:
            adj_stop = stop_line - ((ex_diff+0.0005)*stop_line)
        return adj_stop
        

    
    def calculate_all_time_high_previous_high(self, country_directory, tick, time_frame, last_d_time):
        out_res = {}
        time_list = getattr(stock_logic_config, f'TIME_FRAMES_{time_frame}')
        for frames in time_list:
            file_path = os.path.join(country_directory, "processed_data_files", f'{tick}_{frames}.csv')
            df = pd.read_csv(file_path)
            df['timestamp'] = pd.to_datetime(df['timestamp'], dayfirst = True)
            df = df[df.timestamp <= last_d_time]
            df['timestamp'] = df['timestamp'].astype(np.int64) // 10**9
            all_time_high = df['high'].max()
            all_time_high_timestamp = df.loc[df['high'].idxmax(), 'timestamp']
            previous_high = df['high'].iloc[-2]
            # previous_high_timestamp = df.loc[df['high'].iloc[-2], 'timestamp']
            previous_high_timestamp = df['timestamp'].iloc[-2]
            bind_data = {}
            bind_data['all_time_high'] = {
                'price' : all_time_high,
                'time' : int(all_time_high_timestamp)
            }
            bind_data['previous_high'] = {
                'price' : previous_high,
                'time' : int(previous_high_timestamp)
            }
            out_res[frames] = bind_data
        return out_res

    def percent_and_subtract(self, price, percent, e_type):
        percent_of_price = price * (percent/100)
        if e_type: 
            sub_price = price - percent_of_price
            return sub_price
        else:
            add_price = price + percent_of_price
            return add_price
    
    def calculate_target_buy_price(self, p_line_low, p_line_high):
        ranger = abs(p_line_high - p_line_low)/100
        res = p_line_low + (90*ranger)
        return res

    def calculate_target_sell_price(self, p_line_low, p_line_high):
        ranger = abs(p_line_high - p_line_low)/100
        res = p_line_high - (90*ranger)
        return res

    def check_nearest_zone(self, cur_price, sell_low, d_high, sell_high, d_low):
        ranger_per = abs(sell_high - d_low)/100
        diff = abs(cur_price - d_low)/ranger_per
        if diff >= 33.3 and diff <= 66.6:
            return ['BUY', 'SELL'], diff
        elif diff <= 33.3:
            return ['BUY'], diff
        elif diff >= 66.6:
            return ['SELL'], diff
        # else:
        #     nr = min([sell_low, d_high], key=lambda x: abs(x - cur_price))
        #     if nr == sell_low:
        #         return ['SELL'], diff
        #     elif nr == d_high:
        #         return ['BUY'], diff
        
    def create_buy_alert(self, d_z_l, d_z_h, s_z_h, setup_type):
        stop_diff = (abs(d_z_h - d_z_l) / d_z_h) * 100
        adj_entry = self.calculate_entry_threshold(d_z_h)
        adj_stop = self.calculate_stoploss_threshold(d_z_l, stop_diff)
        #################
        # min_stop = adj_entry - (0.03 * adj_entry)
        # if adj_stop > min_stop:
        #     adj_stop = min_stop  # enforce minimum 3% stop loss gap
        ##########################
        dd = {
            "entry_price" : adj_entry, # {d_z_l}-
            "stop_loss" : adj_stop, #self.percent_and_subtract(d_z_h, 2, True),
            "target_price" : self.calculate_target_buy_price(d_z_l, s_z_h)
        }
        if setup_type == "Overlapping":
            dd = {
                "entry_price" : d_z_h, # {d_z_l}-
                "stop_loss" : adj_stop, #self.percent_and_subtract(d_z_h, 2, True),
                "target_price" : self.calculate_target_buy_price(d_z_l, s_z_h)
            }
            rr = self.calculate_risk_to_reward(d_z_h, adj_stop, dd['target_price'])
            return dd, rr
        rr = self.calculate_risk_to_reward(adj_entry, adj_stop, dd['target_price'])
        return dd, rr

    def create_sell_alert(self, s_z_h, s_z_l, d_z_l, setup_type):
        stop_diff = (abs(s_z_h - s_z_l) / d_z_l) * 100
        adj_entry = self.calculate_entry_threshold_sell(s_z_l)
        adj_stop = self.calculate_stoploss_threshold_sell(s_z_h, stop_diff)
        ss = {
            "entry_price" : adj_entry, # {d_z_l}- # s_z_h
            "stop_loss" : adj_stop, # self.percent_and_subtract(s_z_h, 2, False),
            "target_price" : self.calculate_target_sell_price(d_z_l, s_z_h)
        }
        if setup_type == "Overlapping":
            ss = {
                "entry_price" : s_z_l, # {d_z_l}- # s_z_h
                "stop_loss" : adj_stop, # self.percent_and_subtract(s_z_h, 2, False),
                "target_price" : self.calculate_target_sell_price(d_z_l, s_z_h)
            }
            rr = self.calculate_risk_to_reward(s_z_l, adj_stop, ss['target_price'])
            return ss, rr
        rr = self.calculate_risk_to_reward(ss['entry_price'], ss['stop_loss'], ss['target_price'])
        return ss, rr
    
    def create_no_sell_buy_alert(self, d_z_h):
        dzd = {
            "entry_price" : d_z_h, # {d_z_l}-
            "stop_loss" : self.percent_and_subtract(d_z_h, 5, True),
            "target_price" : self.percent_and_subtract(d_z_h, 10, False)
        }
        return dzd
    
    def create_2_no_sell_zone_buy_alert(self, entry, stop, setup_type):
        stop_diff =  (abs(entry - stop) / entry)*100
        adj_entry = self.calculate_entry_threshold(entry)
        adj_stop = self.calculate_stoploss_threshold(stop, stop_diff)
        risk = abs(adj_entry - adj_stop)
        # print(entry, "5656565656565655656565656565656565656")
        ###########################
        # min_stop = adj_entry - (0.035 * adj_entry)
        # if adj_stop > min_stop:
        #     adj_stop = min_stop  # enforce minimum 3% stop loss gap
        #######################
        target_price = adj_entry + (2.1 * risk)
        dzd = {
            "entry_price" : adj_entry, # {d_z_l}-
            "stop_loss" : adj_stop,
            "target_price" : target_price
        }
        if setup_type == "Overlapping":
            risk = abs(entry - adj_stop)
            target_price = entry + (2.1 * risk)
            dzd = {
                "entry_price" : entry, # {d_z_l}-
                "stop_loss" : adj_stop,
                "target_price" : target_price
            }
            rr = self.calculate_risk_to_reward(entry, adj_stop, dzd['target_price'])
            return dzd, rr
        rr = self.calculate_risk_to_reward(adj_entry, adj_stop, dzd['target_price'])
        return dzd, rr
    
    def create_2_no_buy_zone_sell_alert(self, entry, stop, setup_type):
        stop_diff =  (abs(entry - stop) / entry)*100
        adj_entry = self.calculate_entry_threshold_sell(entry)
        adj_stop = self.calculate_stoploss_threshold_sell(stop, stop_diff)
        risk = abs(adj_entry - adj_stop)
        target_price = entry + (2.1 * risk) if entry > stop else entry - (1.6 * risk)
        dzd = {
            "entry_price" : adj_entry, # {d_z_l}-
            "stop_loss" : adj_stop,
            "target_price" : target_price
        }
        if setup_type == "Overlapping":
            dzd = {
                "entry_price" : entry, # {d_z_l}-
                "stop_loss" : adj_stop,
                "target_price" : target_price
            }
            rr = self.calculate_risk_to_reward(entry, adj_stop, dzd['target_price'])
            return dzd, rr
        rr = self.calculate_risk_to_reward(adj_entry, adj_stop, dzd['target_price'])
        return dzd, rr
    
    def check_and_return_price_pos(self, sell_high, d_low, cur_price):
        ranger_per = abs(sell_high - d_low)/100
        diff = abs(cur_price - d_low)/ranger_per
        print(diff, "********************")
        if diff >= 33.3 and diff <= 66.6:
            return ['BUY', 'SELL'], diff
        elif diff <= 33.3:
            return ['BUY'], diff
        elif diff >= 66.6:
            return ['SELL'], diff
        return [], diff
        # return ['BUY', 'SELL'], diff

    def calculate_zone_percentage(self, price_range, cmp):
        lower_limit, upper_limit = price_range
        range_value = abs(upper_limit - lower_limit)
        percentage_of_zone = (range_value / cmp) * 100
        return percentage_of_zone
    
    def calculate_percentage_distance(self, cmp, target):
        percentage_distance = (abs(target - cmp) / cmp) * 100
        return percentage_distance
    
    def calculate_and_return_stoploss(self, entry, is_buy):
        stoploss = self.percent_and_subtract(entry, 3, is_buy)
        return stoploss
    
    def calculate_atr(self, data, entry, period=14):
        # Calculate True Range (TR)
        data['high_low'] = data['high'] - data['low']
        data['high_close'] = abs(data['high'] - data['close'].shift(1))
        data['low_close'] = abs(data['low'] - data['close'].shift(1))

        data['tr'] = data[['high_low', 'high_close', 'low_close']].max(axis=1)
        # Calculate the ATR
        atr = data['tr'].rolling(window=period).mean()
        atr = atr.tail(period).mean()
        return entry - atr
        # return entry - sum_avg .iloc[-1]

    def calculate_atr_sell(self, data, entry, period=14):
        # Calculate True Range (TR)
        data['high_low'] = data['high'] - data['low']
        data['high_close'] = abs(data['high'] - data['close'].shift(1))
        data['low_close'] = abs(data['low'] - data['close'].shift(1))

        data['tr'] = data[['high_low', 'high_close', 'low_close']].max(axis=1)
        # Calculate the ATR
        atr = data['tr'].rolling(window=period).mean()
        atr = atr.tail(period).mean()
        return entry + atr
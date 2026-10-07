import numpy as np
import pandas as pd
from datetime import datetime #timedelta, timezone
import logging

logger = logging.getLogger()

# class Calculate_Base_Candles:
#     def __init__(self, csv_path, tick, last_d_time) -> None:
#         self.csv_path = csv_path
#         self.tick = tick
#         self.last_d_time = last_d_time
#         self.valid_dz_indx = []
#         self.valid_sz_indx = []
        
#     def time_to_local(self, original_time):
#         d = datetime.utcfromtimestamp(original_time)
#         return datetime(d.year, d.month, d.day, d.hour, d.minute, d.second, d.microsecond).timestamp()


#     def calculate_base_candles(self, df: pd.DataFrame) -> pd.DataFrame:
#         out = df.copy()
#         body = (out["open"] - out["close"]).abs()
#         range_ = (out["high"] - out["low"]).abs()
#         mask = body < 0.5 * range_
#         out["is_basing"] = mask.astype(np.int8)
#         return out
    
#     # def calculate_base_candles(self, df: pd.DataFrame) -> pd.DataFrame:
#     #     required = {"open", "close", "high", "low"}
#     #     missing = required - set(df.columns)
#     #     if missing:
#     #         raise KeyError(f"Missing required columns: {sorted(missing)}")
#     #     threshold_pct=0.1
#     #     out = df.copy()
#     #     # --- your original basing / leg-out logic ---
#     #     # ------------------------------------------------------------
#     #     # 1) ORIGINAL basing / leg-out (unmodified baseline flags)
#     #     # ------------------------------------------------------------
#     #     body   = (out["open"] - out["close"]).abs()
#     #     range_ = (out["high"] - out["low"]).abs()
 
#     #     out['is_basing'] = body < 0.5 * range_

#     #     out['gap_type'] = None
#     #     out['gap_size'] = 0.0
#     #     gap_ups = []
#     #     gap_downs = []

#     #     for i in range(1, len(out)):
#     #         prev = out.iloc[i - 1]
#     #         curr = out.iloc[i]
#     #         prev_high = prev['high']
#     #         prev_low = prev['low']
#     #         curr_high = curr['high']
#     #         curr_low = curr['low']
#     #         curr_close = curr['close']
#     #         gap_threshold = (threshold_pct / 100) * curr_close
            
#     #         if curr_low > prev_high:  # Gap Up
#     #             gap = curr_low - prev_high
#     #             if gap >= gap_threshold:
#     #                 out.at[i, 'gap_type'] = 'Gap Up'
#     #                 out.at[i, 'gap_size'] = round(gap, 2)
#     #                 gap_ups.append([
#     #                     {
#     #                         "time": int(prev['unix_timestamp']),
#     #                         "price": prev_high
#     #                     },
#     #                     {
#     #                         "time": int(curr['unix_timestamp']),
#     #                         "price": curr_low
#     #                     }
#     #                 ])
            
#     #         elif curr_high < prev_low:  # Gap Down
#     #             gap = prev_low - curr_high
#     #             if gap >= gap_threshold:
#     #                 out.at[i, 'gap_type'] = 'Gap Down'
#     #                 out.at[i, 'gap_size'] = round(gap, 2)
#     #                 gap_downs.append([
#     #                     {
#     #                         "time": int(prev['unix_timestamp']),
#     #                         "price": prev_low
#     #                     },
#     #                     {
#     #                         "time": int(curr['unix_timestamp']),
#     #                         "price": curr_high
#     #                     }
#     #                 ])


#     #     for i in range(1, len(out) - 1):
#     #         if out.iloc[i]['gap_type'] is not None:
#     #             next_is_non_base = not out.iloc[i + 1]['is_basing']
#     #             out.at[i, 'is_basing'] = next_is_non_base


#     #     return out



#     def calculate_zones(self):
#         out_res = []
#         df = pd.read_csv(self.csv_path)
#         if 'timestamp' in df.columns:
#             t_key = 'timestamp'
#         else:
#             t_key = 'tradeDate'
#         df[t_key] = pd.to_datetime(df[t_key], dayfirst = True)
#         df = df[df[t_key] <= self.last_d_time]
#         df['timestamp'] = (df[t_key].astype(np.int64) // 10**9).astype(int)
#         df['unix_timestamp'] = (df['timestamp'].astype(np.int64) // 10**9).astype(int)


#         df = self.calculate_base_candles(df)
#         for i in range(len(df) - 1):
#             row_data = df.iloc[i]
#             if row_data.get("is_basing") == 1 and i >= 1:
#                 point = int(row_data.get("timestamp"))
#                 out_res.append(point)
#         return out_res

class Calculate_Base_Candles:

    def __init__(self, csv_path, tick, last_d_time) -> None:
        self.csv_path = csv_path
        self.tick = tick
        self.last_d_time = last_d_time

        self.valid_dz_indx = []
        self.valid_sz_indx = []


    def time_to_local(self, original_time):
        """
        IMPORTANT:
        Lightweight Charts expects Unix timestamps in seconds.

        Do not convert Unix timestamp -> datetime -> local timestamp again,
        because that can shift the actual candle time depending on the
        server timezone.

        Keep the timestamp unchanged.
        """
        return int(original_time)


    def calculate_base_candles(self, df: pd.DataFrame) -> pd.DataFrame:

        out = df.copy()

        body = (out["open"] - out["close"]).abs()
        range_ = (out["high"] - out["low"]).abs()

        # Avoid problems with zero-range candles
        mask = (range_ > 0) & (body < 0.5 * range_)

        out["is_basing"] = mask.astype(np.int8)

        return out


    def calculate_zones(self):

        out_res = []

        # ---------------------------------------------------------
        # 1. Read CSV
        # ---------------------------------------------------------
        df = pd.read_csv(self.csv_path)

        if df.empty:
            return out_res


        # ---------------------------------------------------------
        # 2. Identify datetime column
        # ---------------------------------------------------------
        if "timestamp" in df.columns:
            t_key = "timestamp"

        elif "tradeDate" in df.columns:
            t_key = "tradeDate"

        else:
            raise ValueError(
                "CSV must contain either 'timestamp' or 'tradeDate'"
            )


        # ---------------------------------------------------------
        # 3. Convert datetime safely
        # ---------------------------------------------------------
        df[t_key] = pd.to_datetime(
            df[t_key],
            dayfirst=True,
            errors="coerce"
        )

        # Remove invalid dates
        df = df.dropna(subset=[t_key])


        # ---------------------------------------------------------
        # 4. Filter data using last_d_time
        # ---------------------------------------------------------
        last_d_time = pd.to_datetime(
            self.last_d_time,
            dayfirst=True,
            errors="coerce"
        )

        if pd.isna(last_d_time):
            raise ValueError(
                f"Invalid last_d_time: {self.last_d_time}"
            )

        df = df[df[t_key] <= last_d_time]


        if df.empty:
            return out_res


        # ---------------------------------------------------------
        # 5. SORT DATA
        #
        # Lightweight Charts requires:
        #
        # old timestamp
        #      ↓
        # new timestamp
        #
        # ---------------------------------------------------------
        df = df.sort_values(
            by=t_key,
            ascending=True
        ).reset_index(drop=True)


        # ---------------------------------------------------------
        # 6. Create Unix timestamp
        #
        # Pandas datetime internally stores nanoseconds.
        #
        # Convert:
        #
        # nanoseconds
        #     ↓ / 10**9
        # seconds
        #
        # ---------------------------------------------------------
        df["timestamp"] = (
            df[t_key].astype("int64") // 10**9
        ).astype(np.int64)


        # ---------------------------------------------------------
        # IMPORTANT FIX
        #
        # OLD CODE:
        #
        # df['unix_timestamp'] =
        #     df['timestamp'] // 10**9
        #
        # WRONG because timestamp is ALREADY seconds.
        #
        # ---------------------------------------------------------
        df["unix_timestamp"] = df["timestamp"]


        # ---------------------------------------------------------
        # 7. Remove duplicate timestamps
        #
        # Lightweight Charts should not receive:
        #
        # 1726100000
        # 1726100060
        # 1726100060   <-- duplicate
        # 1726100120
        #
        # ---------------------------------------------------------
        df = df.drop_duplicates(
            subset=["timestamp"],
            keep="last"
        )


        # ---------------------------------------------------------
        # 8. Sort AGAIN after duplicate removal
        # ---------------------------------------------------------
        df = df.sort_values(
            by="timestamp",
            ascending=True
        ).reset_index(drop=True)


        # ---------------------------------------------------------
        # 9. Calculate base candles
        # ---------------------------------------------------------
        df = self.calculate_base_candles(df)


        # ---------------------------------------------------------
        # 10. Collect base candle timestamps
        #
        # Keeping your original behaviour:
        # skip first candle and final candle.
        # ---------------------------------------------------------
        for i in range(1, len(df) - 1):

            row_data = df.iloc[i]

            if row_data["is_basing"] == 1:

                point = int(
                    row_data["timestamp"]
                )

                out_res.append(point)


        # ---------------------------------------------------------
        # 11. Final safety check
        #
        # sorted()       -> ascending
        # set()          -> remove duplicates
        #
        # ---------------------------------------------------------
        out_res = sorted(set(out_res))

        return out_res




class Calculate_BAD_ZONES:
    def __init__(self, csv_path, last_d_time) -> None:
        self.csv_path = csv_path
        self.last_d_time = last_d_time

    def find_increasing_indices(self, lst):
        increasing_indices = []
        single_values = []
        for i in range(len(lst) - 1):
            if lst[i+1] - lst[i] == 1:
                if not increasing_indices or (increasing_indices and increasing_indices[-1][-1] != i):
                    increasing_indices.append([i, i+1])
                else:
                    increasing_indices[-1][-1] = i+1
            elif i > 0 and lst[i-1] + 1 != lst[i] and lst[i] + 1 != lst[i+1]:
                single_values.append(i)
        if lst[-1] != lst[-2] + 1:
            single_values.append(len(lst) - 1)
        return increasing_indices, single_values

    def get_bad_zones_data(self):
        out_data = {}
        b_z = []
        group_index_list = []
        single_index_list = []
        df = pd.read_csv(self.csv_path)
        col = 'tradeDate' if 'tradeDate' in df.columns else 'timestamp'
        df[col] = pd.to_datetime(df[col], dayfirst = True)
        df = df[df[col] <= self.last_d_time]
        df[col] = (df[col].astype(np.int64) // 10**9).astype(int)
        for j in range(len(df)):
            bad_row_data = df.iloc[j]
            if str(bad_row_data.get("ideal_zone")).__contains__('BADZONE'):
                b_z.append(j)
        if len(b_z) >= 3:
            con_z, sin_z = self.find_increasing_indices(b_z)
            # print(con_z, sin_z)
            for li in con_z:
                low_li = []
                high_li = []
                # print(len(df) ,b_z[li[1]] + 1)
                prev_t = df.iloc[b_z[li[0]] - 1].get(col)
                if len(df) == (b_z[li[1]] + 1):
                    next_t = df.iloc[b_z[li[1]]].get(col)
                else:
                    next_t = df.iloc[b_z[li[1]] + 1].get(col)
                for k in range(li[0], li[1]+1):
                    low_li.append(abs(df.iloc[b_z[k]].get('low')))
                    high_li.append(abs(df.iloc[b_z[k]].get('high')))
                y1 = max(high_li)
                y2 = min(low_li)
                point1 = {"time": int(prev_t), "price": float(y2)}
                point2 = {"time": int(next_t), "price": float(y1)}
                group_index_list.append([point1,point2])
            for si in sin_z:
                s_row_data = df.iloc[b_z[si]]
                s_low_dat = s_row_data.get("low")
                s_high_dat = s_row_data.get("high")
                # s_exp = s_row_data.get("timestamp")
                p1_time = df.iloc[b_z[si]-1][col]
                p2_time = df.iloc[b_z[si]+1][col]
                point_1 = {"time": int(p1_time), "price": float(s_low_dat)}
                point_2 = {"time": int(p2_time), "price": float(s_high_dat)}
                group_index_list.append([point_1, point_2])
        # out_data['multiple_groups'] = group_index_list
        # out_data['single_group'] = single_index_list
        return group_index_list
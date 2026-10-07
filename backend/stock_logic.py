import logging
import pandas as pd
import os
import numpy as np
from datetime import datetime
from dateutil import parser
# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
logger.setLevel(logging.NOTSET)
# logger.setLevel(logging.CRITICAL)

# pd.options.mode.copy_on_write = True

# Find basing candles
def calculate_base_candles(dataframe):
    try:
        dataframe1 = dataframe
        rows, cols = dataframe1.shape
        count = 0
        for row in range(rows):
            val1 = abs(dataframe1.loc[row, 'open'] - dataframe1.loc[row, 'close'])
            val2 = 0.5 * dataframe1.loc[row, 'wick']
            if val1 < val2:
                dataframe1.loc[row, 'is_basing'] = 1
                count += 1
            elif abs(dataframe1.loc[row, 'high'] - dataframe1.loc[row, 'low']) <= 1:
                dataframe1.loc[row, 'is_basing'] = 1
                count += 1
            else:
                dataframe1.loc[row, 'is_basing'] = 0
        # print(f"\n{count} rows updated with is_basing values as True")
        return dataframe1
    except Exception as e:
        # Raise the exception.
        #raise e
        logger.exception(f'EX1{e}')
        return dataframe
    
def calculate_bullish_candles(dataframe):
    try:
        dataframe1 = dataframe
        rows, cols = dataframe1.shape
        count = 0
        for row in range(rows):
            open = float(dataframe1.loc[row, 'open'])
            close = float(dataframe1.loc[row, 'close'])
            if close > open:
                dataframe1.loc[row, 'is_bullish'] = 1
                count += 1
            
            else:
                dataframe1.loc[row, 'is_bullish'] = 0
        # print(f"\n{count} rows updated with is_bullish values as True")
        return dataframe1

    except Exception as e:
        # Raise the exception.
        #raise e
        logger.exception(f'EX1{e}')
        return dataframe


def calculate_wick_values(dataframe):
    """
    Calculates wick values for all records in the stock_item table and updates the wick field accordingly.

    :param db: Pandas DataFrame.
    :return: Pandas DataFrame
    """
    try:
        dataframe1 = dataframe
        dataframe1["wick"] = abs(dataframe1["high"] - dataframe1["low"])
        # print(f"\nWick values have been updated for {dataframe1.shape[0]} rows.")
        return dataframe1
    except Exception as e:
        # Raise the exception.
        #raise e
        logger.exception(f'EX2{e}')
        return dataframe


# If more than 4 consecutive basing fields are found in the stock_item table then mark them as BADZONES to exclude them from the calculation
def mark_bad_zone_records(dataframe):
    try:
        num_bad_zone_records = 0
        more_than_4_consecutive_basing_count = 0

        consecutive_basing_count = 0
        start_index = 0
        dataframe1 = dataframe
        rows, cols = dataframe1.shape

        for i in range(rows):
            if dataframe1.loc[i,'is_basing'] == 1 or bool(dataframe1.loc[i,'is_basing']):
                if consecutive_basing_count == 0:
                    start_index = i
                consecutive_basing_count += 1
            else:
                if consecutive_basing_count > 4:
                    for j in range(start_index, i):
                        dataframe1.loc[j, 'ideal_zone'] = "BADZONE"
                        dataframe1.loc[j, 'zone_or_not'] = None
                        dataframe1.loc[j, 'zone2'] = None
                        num_bad_zone_records += 1
                    more_than_4_consecutive_basing_count += 1
                consecutive_basing_count = 0
            if i == (len(dataframe1) - 1) and consecutive_basing_count > 4:
                for j in range(start_index, i):
                    dataframe1.loc[j, 'ideal_zone'] = "BADZONE"
                    dataframe1.loc[j, 'zone_or_not'] = None
                    dataframe1.loc[j, 'zone2'] = None
                    num_bad_zone_records += 1
                more_than_4_consecutive_basing_count += 1
                consecutive_basing_count = 0


        logger.info(f"Found more than 3 sets {more_than_4_consecutive_basing_count} of consecutive basing records")
        logger.info(f"Updated {num_bad_zone_records} records with BADZONE.")
        return dataframe1
    except Exception as e:
        # Raise the exception.
        #raise e
        logger.exception(f'EX3{e}')
        return dataframe


def calculate_zone_or_not(dataframe):
    num_single_zone_records = 0
    num_double_zone_records = 0
    num_badzone2_records = 0
    num_badzone3_records = 0

    records = dataframe.to_dict('index')
    consecutive_records = dict()
    
    logger.info(f"Total number of records: {len(records)}")

    i = 0
    while i < len(records):
        current = {i: records[i]}

        current_key = list(current.keys())[0]
        if current[current_key]['ideal_zone'] == 'BADZONE':
            logger.info(f"Skipping record {i} as it is a BADZONE record")
            i += 1
            continue

        # Discard records that are not basing records
        if current[current_key]['is_basing'] != 1:
            logger.info(f"Skipping record {i} as it is not a basing record")
            i += 1
            continue

        consecutive_records[i] = current[current_key]
        max_wick = current[current_key]['wick']
        
        # Check for consecutive basing records
        j = i + 1
        while j < len(records) and records[j]['is_basing']:
            consecutive_records[j] = records[j]
            max_wick = max(max_wick, records[j]['wick'])
            j += 1       
            
        next_record = records[j] if j < len(records) else None
        next_to_next = records[j + 1] if (j + 1) < len(records) else None
        

        # [T...]FT case
        if next_record and not next_record["is_basing"] and (next_to_next and next_to_next["is_basing"]):
            
            if len(consecutive_records) == 4: # [TTTT]FT pattern  for BADZONE2                 
                logger.info(f"Identified TTTFT pattern starting at {list(current.keys())[0]}")
                logger.info(f"In this TTTTFT zone Consecutive basing records count should be 4: {len(consecutive_records) == 4}")
                for index in consecutive_records:
                        records[index]["ideal_zone"] = "BADZONE2"
                num_badzone2_records += 1
                logger.info(f"Updated {len(consecutive_records) + 1} records to BADZONE2: TTTTFT pattern")                
                
            elif len(consecutive_records) > 1: # [T..]FT pattern: TTFT or TTTFT
                logger.info(f"Identified [T..]FT pattern starting at {list(current.keys())[0]}")
                logger.info(f"In this [T..]FT zone Consecutive basing records count is: {len(consecutive_records)}")
                
                if next_record["wick"] >= 2.5 * max_wick:
                    for index in consecutive_records:
                        records[index]["ideal_zone"] = "ZONE2"
                    
                    num_double_zone_records += 1
                    logger.info(f"Updated {len(consecutive_records) + 1} records to ZONE2: [T..]FT pattern")

                else:
                    for index in consecutive_records:
                        records[index]["ideal_zone"] = "ZONE1"
                    
                    num_single_zone_records += 1
                    logger.info(f"Updated {len(consecutive_records) + 1} records to ZONE1: [T..]FT pattern")
             
            # Handling the exception case of TFT pattern: Only TFT and not [T..]FT       
            else: # TFT Exception pattern
                logger.info(f"Identified TFT pattern starting at {list(current.keys())[0]}")
                logger.info(f"In this TFT zone Consecutive basing records count should be 1: {len(consecutive_records)==1}")
                
                if next_record["wick"] >= 3.5 * max_wick or next_record["wick"] < 2.5 * max_wick:
                    for index in consecutive_records:
                        records[index]['ideal_zone'] = "BADZONE3"
                    
                    num_badzone3_records += 1
                    logger.info(f"Updated {len(consecutive_records) + 1} records to BADZONE3: special TFT case of [T..]FT pattern")
                    
                elif next_record["wick"] >= 2.5 * max_wick:
                    for index in consecutive_records:
                        records[index]["ideal_zone"] = "ZONE1"
                    
                    num_single_zone_records += 1
                    logger.info(f"Updated {len(consecutive_records) + 1} records to ZONE1: special TFT case of [T..]FT pattern")                    
                
            # Shuold it be within the previous loop?
            if (j + 1) < len(records):
                i = j + 1
            else:
                break

            logger.info(f"After [T..]FT Zone i is  {i} and TRUE record is {records[i]} ")

        # [T..]FF case
        elif next_record and not next_record["is_basing"]:
            next_to_next = records[j + 1] if j + 1 < len(records) else None

            if next_to_next and not next_to_next["is_basing"]:                
                
                if len(consecutive_records) == 4: # [TTTT]FF pattern                
                    logger.info(f"Identified TTTTFT pattern starting at {list(current.keys())[0]}")
                    logger.info(f"In this TTTTFT zone Consecutive basing records count should be 4: {len(consecutive_records) == 4}")
                    if next_record["wick"] >= 2.5 * max_wick or next_to_next["wick"] >= 2.5 * max_wick:
                        for index in consecutive_records:
                            records[index]['ideal_zone'] = "ZONE1"
                        
                        num_single_zone_records += 1
                        logger.info(f"Updated {len(consecutive_records) + 1} records to ZONE1")
                    
                elif len(consecutive_records) >= 1: # [T..]FF pattern
                    logger.info(f"Identified [T..]FF pattern starting at {list(current.keys())[0]}")
                    logger.info(f"In this [T..]FF zone Consecutive basing records count is: {len(consecutive_records)}")
                    
                    if next_record['wick'] >= 2.5 * max_wick or next_to_next['wick'] >= 2.5 * max_wick:
                        for index in consecutive_records:
                            records[index]['ideal_zone'] = "ZONE2"
                        
                        num_double_zone_records += 1
                        logger.info(f"Updated {len(consecutive_records) + 1} records to ZONE2")
                    else:
                        for index in consecutive_records:
                            records[index]['ideal_zone'] = "ZONE1"
                        
                        num_single_zone_records += 1
                        logger.info(f"Updated {len(consecutive_records) + 1} records to ZONE1")

                if (j + 2) < len(records):
                    i = j + 2
                else:
                    break

                logger.info(f"After TFF Zone i is  {i} and TRUE record is {records[i]}")
            else:
                print("stuck_here")
                i += 1
                break
        else:
            i += 1

    try:
        temp_record = []
        for key in records:
            temp_record.append(records[key])
            dataframe1 = pd.DataFrame(temp_record)
        logger.info("Zone calculation completed.")
        return dataframe1
    except Exception as e:
        logger.exception(f'EX4{e}')
        return dataframe
    #return num_single_zone_records, num_double_zone_records, num_badzone2_records, num_badzone3_records


def update_additional_zone_type(dataframe):
    num_additional_zone_records = 0
    dataframe1 = dataframe
    rows, cols = dataframe1.shape
    try:
        #dataframe1['is_basing'] = dataframe1['is_basing'].replace([1, True])
        dataframe1 = dataframe1.replace({'is_basing': 1.0}, "TRUE")
        dataframe1 = dataframe1.replace({'is_basing': 0.0}, "FALSE")
        #print(dataframe1)
        # Check for pattern in records
        for i in range(rows - 4):  # Stop 4 before the end to avoid out of index error
            if dataframe1.loc[i, 'is_basing'] == "TRUE" and \
               dataframe1.loc[i+1, 'is_basing'] == "FALSE" and \
               dataframe1.loc[i+2, 'is_basing'] == "TRUE" and \
               dataframe1.loc[i+3, 'is_basing'] == "TRUE" and \
               dataframe1.loc[i+4, 'is_basing'] == "FALSE":

                # Update the additional_zone_type field for matching records
                for j in range(i, i + 5):
                    dataframe1.loc[j, 'additional_zone_type'] = "ZONE1"
                    num_additional_zone_records += 1

        logger.info(f"Updated {num_additional_zone_records} records with additional_zone_type = 'ZONE1'")

        return dataframe1

    except Exception as e:
        logger.error(f"EX5 An error occurred: {e}")
        return dataframe
    #return num_additional_zone_records


def is_close_greater_than_open(record):
    """Calculate if the 'close' field of a record is greater than or less than the 'open' field.

    Args:
        record (Dictionary): The record to check.

    Returns:
        Union[bool, str]: True if 'close' is greater than 'open', False if less, 'Same' if they are equal.
    """
    if record["close"] > record["open"]:
        return True
    elif record["close"] < record["open"]:
        return False
    else:
        return "Same"
    
def identify_leg_out_candles(data_frame):
    df1 = data_frame
    df1["is_leg_out"] = False
    df1.loc[df1['is_basing'] == False, "is_leg_out"] = True
    # for i in range(len(df1) - 2):
    #     if df1.loc[i, 'is_basing'] == True and df1.loc[i+1, 'is_basing'] == False:
    #         print("Setting leg out val")
    #         df1.loc[i+1, "is_leg_out"] = True
    #     if df1.loc[i, 'is_basing'] == True and df1.loc[i+1, 'is_basing'] == False and df1.loc[i+2, 'is_basing'] == False:
    #         df1.loc[i+1, "is_leg_out"] = True
    #         df1.loc[i+2, "is_leg_out"] = True
    return df1

def identify_leg_in_candles(data_frame):
    df1 = data_frame
    for i in range(len(df1) - 1):
        if df1.loc[i, 'is_basing'] == True and df1.loc[i+1, 'is_basing'] == False:
            # print("Setting leg out val")
            df1.loc[i+1, "is_leg_out"] = True
    return df1


def update_buy_sell_zone_type_Prioritize_larger_patterns_over_smaller_ones(dataframe):
    """Update the buy_sell_zone_type field of the stock item records in the database prioritizing larger patterns.

    Args:
        dataframe (Pandas)

    Returns:
        Dict[str, int]: A dictionary of the number of updated records for each type.
    """
    dataframe1 = dataframe
    rows, cols = dataframe1.shape
    patterns = ["FTTTTFFF", "FTTTFFF", "FTTFFF", "FTFFF", "FTTTF", "FTTF", "FTFF", "FTTF", "FTF"]
    #stock_items: List[StockItem] = db.query(StockItem).order_by(StockItem.id).all()
    update_counts = {"RBR": 0, "DBD": 0, "RBD": 0, "DBR": 0}

    try:
        i = 0
        while i < rows:
            pattern_found = False
            for pattern in patterns:
                pattern_length = len(pattern)
                if i + pattern_length > rows:
                    continue

                # is_basing_pattern = "".join(["T" if stock_item.is_basing else "F" for stock_item in stock_items[i:i+pattern_length]])
                
                # is_basing_pattern = ""
                # for j in range(i, i+pattern_length):
                #     if dataframe1.loc[j, 'is_basing'] == "TRUE":
                #         is_basing_pattern += "T"
                #     else:
                #         is_basing_pattern += "F"
                is_basing_pattern = "".join(["T" if dataframe1.loc[j, 'is_basing'] == "TRUE" else "F" for j in range(i, i+pattern_length)])            

                # print(f"is_basing_pattern at index {i}: {is_basing_pattern}")

                if is_basing_pattern == pattern:
                    # print(f"Pattern match found at index {i}: {pattern}")
                    pattern_found = True

                    first_F_record = dataframe1.loc[i]
                    first_F_record = first_F_record.to_dict()
                    last_F_record = dataframe1.loc[i+pattern_length-1]
                    last_F_record = last_F_record.to_dict()

                    first_result = is_close_greater_than_open(first_F_record)
                    last_result = is_close_greater_than_open(last_F_record)

                    # print(f"is_close_greater_than_open for first_F_record at index {i}: {first_result}")
                    # print(f"is_close_greater_than_open for last_F_record at index {i+pattern_length-1}: {last_result}")

                    if first_result and last_result:
                        buy_sell_zone_type = "RBR" # RBR
                    elif not first_result and last_result:
                        buy_sell_zone_type = "DBR" # DBR
                    elif first_result and not last_result:
                        buy_sell_zone_type = "RBD" # RBD
                    else:
                        buy_sell_zone_type = "DBD" # DBD

                    # print(f"buy_sell_zone_type is set to {buy_sell_zone_type}")

                    for j in range(i, i + pattern_length - 1):
                        try:
                            if pd.isnull(dataframe1.loc[j, 'buy_sell_zone_type']) or len(dataframe1.loc[j, 'buy_sell_zone_type']) == 0:
                                dataframe1.loc[j, 'buy_sell_zone_type'] = buy_sell_zone_type
                                # print(f"Updated buy_sell_zone_type for stock_item at index {j}: {dataframe1.loc[j, 'buy_sell_zone_type']}")
                                update_counts[buy_sell_zone_type] += 1
                        except:
                            dataframe1.loc[j, 'buy_sell_zone_type'] = buy_sell_zone_type
                            # print(f"Updated buy_sell_zone_type for stock_item at index {j}: {dataframe1.loc[j, 'buy_sell_zone_type']}")
                            update_counts[buy_sell_zone_type] += 1
                        #dataframe1.loc[j, 'buy_sell_zone_type'] = buy_sell_zone_type
                        #print(f"Updated buy_sell_zone_type for stock_item at index {j}: {dataframe1.loc[j, 'buy_sell_zone_type']}")
                        #update_counts[buy_sell_zone_type] += 1

                    i = i + pattern_length - 2
                    break

            if not pattern_found:
                    i += 1
        # print("update_counts : ", update_counts)
        return dataframe1
    except Exception as e:
        print(f"EX6 Exception occurred: {e}")
        return dataframe
    #return update_counts  


# update_buy_sell_zone_type function so that it can handle  overlapping patterns in such a way  
# so that if a row has already been updated, we choose not to update it again, preserving the first pattern it matched
def update_buy_sell_zone_type_Prioritize_smaller_patterns_over_larger_ones(dataframe):
    dataframe1 = dataframe
    rows, cols = dataframe1.shape
    patterns = ["FTF", "FTTF", "FTTFF", "FTTTF", "FTFF", "FTTTTF", "FTTFFF", "FTFFF", "FTTTFFF", "FTTTTFFF"]
    update_counts = {"RBR": 0, "DBD": 0, "RBD": 0, "DBR": 0}

    try:
        i = 0
        while i < rows:
            for pattern in patterns:
                pattern_length = len(pattern)

                if i + pattern_length > rows:
                    continue

                try:
                    #is_basing_pattern = "".join(["T" if stock_item.is_basing else "F" for stock_item in stock_items[i:i+pattern_length]])
                    is_basing_pattern = "".join(["T" if dataframe1.loc[j, 'is_basing'] == "TRUE" else "F" for j in range(i, i+pattern_length)])            

                except AttributeError as e:
                    print(f"Exception occurred when forming basing pattern: {e}")
                    #return update_counts
                    return dataframe

                # print(f"is_basing_pattern at index {i}: {is_basing_pattern}")

                if is_basing_pattern == pattern:
                    # print(f"Pattern match found at index {i}: {pattern}")

                    first_F_record = dataframe1.loc[i]
                    first_F_record = first_F_record.to_dict()
                    last_F_record = dataframe1.loc[i+pattern_length-1]
                    last_F_record = last_F_record.to_dict()

                    try:
                        first_result = is_close_greater_than_open(first_F_record)
                        last_result = is_close_greater_than_open(last_F_record)
                    except AttributeError as e:
                        print(f"Exception occurred when calculating close/open result: {e}")
                        #return update_counts
                        return dataframe

                    # print(f"is_close_greater_than_open for first_F_record at index {i}: {first_result}")
                    # print(f"is_close_greater_than_open for last_F_record at index {i+pattern_length-1}: {last_result}")

                    if first_result and last_result:
                        buy_sell_zone_type = "RBR" # RBR
                    elif not first_result and last_result:
                        buy_sell_zone_type = "DBR" # DBR
                    elif first_result and not last_result:
                        buy_sell_zone_type = "RBD" # RBD
                    else:
                        buy_sell_zone_type = "DBD" # DBD
    
                    # print(f"buy_sell_zone_type is set to {buy_sell_zone_type}")

                    for j in range(i, i + pattern_length - 1):
                        try:
                            try:
                                if pd.isnull(dataframe1.loc[j, 'buy_sell_zone_type']) or len(dataframe1.loc[j, 'buy_sell_zone_type']) == 0:
                                    dataframe1.loc[j, 'buy_sell_zone_type'] = buy_sell_zone_type
                                    # print(f"Updated buy_sell_zone_type for stock_item at index {j}: {dataframe1.loc[j, 'buy_sell_zone_type']}")
                                    update_counts[buy_sell_zone_type] += 1
                            except:
                                dataframe1.loc[j, 'buy_sell_zone_type'] = buy_sell_zone_type
                                # print(f"Updated buy_sell_zone_type for stock_item at index {j}: {dataframe1.loc[j, 'buy_sell_zone_type']}")
                                update_counts[buy_sell_zone_type] += 1
                            
                        except Exception as e:
                            print(f"Exception occurred during update at index {j}: {str(e)}")
                    
                    i = i + pattern_length - 2                    
                    break
            else:
                i += 1
                # print(dataframe)
        return dataframe1
    
    except Exception as e:
        print(f"KAKAKA : {e}")
        return dataframe
    #return update_counts

def ranges_intersect(range1, high_or_low, isDemand):
    start1, end1 = range1
    total_range = abs(range1[0] - range1[1])
    violate_range = min(start1, end1) + (total_range/2)
    if isDemand:
        if high_or_low >= violate_range:
            return False
        else:
            return True
    else:
        if high_or_low >= violate_range:
            return True
        else:
            return False
    
def find_increasing_indices(lst):
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



def update_fz(dataframe):
    df1 = dataframe
    cmp = df1.iloc[len(df1) - 1]['close'] 
    for i in range(len(df1)-1):
        if i == len(df1) - 2:
            continue
        row_data = df1.iloc[i]
        if row_data.get("is_basing") == 'TRUE' and (row_data.get("high") < cmp) and row_data.get('ideal_zone') != 'BADZONE': # row_data.get("open")
            chk_int = False
            found_leg_out = False
            for k in range(i+1, len(df1)):
                if bool(df1.iloc[k]['is_leg_out']) == True and not(found_leg_out):
                    found_leg_out = True
                    continue
                per_intersect = ranges_intersect((df1.iloc[i].get("low"), df1.iloc[i].get("high")), df1.iloc[k].get('low'), True)
                if per_intersect:
                    chk_int = True
                    break
            if not chk_int:
                df1.loc[i, 'final_fz'] = 'VZ'
        elif row_data.get("is_basing") == 'TRUE' and (row_data.get("high") > cmp) and row_data.get('ideal_zone') != 'BADZONE':
            chk_int = False
            found_leg_out = False
            for k in range(i+1, len(df1)):
                if bool(df1.iloc[k]['is_leg_out']) == True and not(found_leg_out):
                    found_leg_out = True
                    continue
                per_intersect = ranges_intersect((df1.iloc[i].get("low"), df1.iloc[i].get("high")), df1.iloc[k].get('high'), False) 
                if per_intersect:
                    chk_int = True
                    break
            if not chk_int:
                df1.loc[i, 'final_fz'] = 'VZ'
                # point1 = {"time": int(p1_time), "price": row_data.get("low"), "act": int(df.iloc[i]['timestamp'])} # strftime("%Y-%m-%d") int(prev_day.timestamp())
                # point2 = {"time": int(p2_time), "price": row_data.get("high"), "act": int(df.iloc[i]['timestamp'])}
                # dz_list.append([point1, point2])
        
    return df1

def update_bz_sz(dataframe):
    dataframe1 = dataframe
    update_counts = {"DZ": 0, "SZ": 0}
    is_bszone_updated = False
    rows, cols = dataframe1.shape
    try:
        for i in range(rows):
            if dataframe1.loc[i, 'is_basing'] == "TRUE":
                if not is_bszone_updated:
                    buy_sell_zone_type = dataframe1.loc[i, 'buy_sell_zone_type']
                    logger.info(f"Processing stock item {i} - buy_sell_zone_type: {buy_sell_zone_type}")

                    if buy_sell_zone_type in ["RBR", "DBR"]:
                        logger.info(f"Updating buy_sell_zone for stock item {i} to DZ")
                        update_counts["DZ"] += 1
                        dataframe1.loc[i, 'buy_sell_zone'] = "DZ"
                        is_bszone_updated = True

                    elif buy_sell_zone_type in ["RBD", "DBD"]:
                        logger.info(f"Updating buy_sell_zone for stock item {i} to SZ")
                        update_counts["SZ"] += 1
                        dataframe1.loc[i, 'buy_sell_zone'] = "SZ"
                        is_bszone_updated = True

                    else:
                        logger.info(f"Invalid buy_sell_zone_type for stock item {i}: {buy_sell_zone_type}")
                else:
                    logger.info(f"Skipping stock item {i} - is_bszone_updated is already True")
            else:
                is_bszone_updated = False
        logger.info("Buy/Sell zone update successful")
        logger.info(f"Update counts: {update_counts}")
        return dataframe1
    except Exception as e:
        logger.error(f"Exception occurred when updating buy/sell zone: {e}")
        return dataframe
    #return update_counts
############################################

def read_csv_data(filepath):
    df = pd.read_csv(filepath)
    return df

def write_csv_data(dataframe, filepath):
    if os.path.exists(filepath):
        os.remove(filepath)
    dataframe.to_csv(filepath, index = False)

################################################

def proc_all_stock_items(filename : str, in_dir : str, our_dir : str):
    logging.disable(logging.CRITICAL)
    try:
        filepath = os.path.join(in_dir, filename)
        dataframe = read_csv_data(filepath)
        columns_to_add = ['wick', 'is_basing', 'is_bullish', 'ideal_zone', 'zone_or_not', 'zone2', 'additional_zone_type', 'buy_sell_zone_type', 'buy_sell_zone', 'tick']
        for column in columns_to_add:
            dataframe.insert(loc = len(dataframe.columns), column = column, value = np.nan)
        dataframe = calculate_wick_values(dataframe)
        dataframe =  calculate_bullish_candles(dataframe)
        dataframe = calculate_base_candles(dataframe)
        dataframe = mark_bad_zone_records(dataframe)
        dataframe = identify_leg_out_candles(dataframe)
        # dataframe = calculate_zone_or_not(dataframe)
        dataframe = update_additional_zone_type(dataframe)
        dataframe = update_buy_sell_zone_type_Prioritize_smaller_patterns_over_larger_ones(dataframe)
        # dataframe = update_buy_sell_zone_type_Prioritize_larger_patterns_over_smaller_ones(dataframe)
        dataframe = update_bz_sz(dataframe)
        # dataframe = update_fz(dataframe)
        dataframe['tick'] = filename.replace(".csv", "").rsplit("_")[0]
        # dataframe['tradeDate'] = pd.to_datetime(dataframe['tradeDate'], dayfirst=True)
        dataframe.rename(columns={"tradeDate":"timestamp"}, inplace = True)
        # dataframe = 
        ids = dataframe.index.values
        dataframe.insert(loc = 0, column = 'id', value = ids)
        # print(dataframe)
        write_filepath = os.path.join(our_dir, filename)
        write_csv_data(dataframe, write_filepath)
        return {"message": "success"}
    except Exception as ex:
        logger.exception(ex, stack_info=True)
        raise StopAsyncIteration
    



def proc_delta_stock_items(filename: str, in_dir: str, out_dir: str):
    try:
        filepath = os.path.join(in_dir, filename)
        processed_file_path = os.path.join(out_dir, filename)

        # Load previously processed data if available
        if os.path.exists(processed_file_path):
            last_avl_timestamp_df = pd.read_csv(processed_file_path)
            last_avl_timestamp_df['timestamp'] = pd.to_datetime(last_avl_timestamp_df['timestamp'], dayfirst=True)
        else:
            last_avl_timestamp_df = pd.DataFrame()

        # Determine last available timestamp
        # last_avl_timestamp = None
        # if not last_avl_timestamp_df.empty:
        #     last_avl_timestamp_df = last_avl_timestamp_df.iloc[:-5]
        #     last_avl_timestamp = last_avl_timestamp_df.iloc[-1]['timestamp']
        #     last_date_obj = datetime.strptime(last_avl_timestamp, "%d/%m/%Y %H:%M:%S")

        #     if any(freq in filename for freq in ['daily', 'weekly', 'monthly', 'sixty', 'fifteen']):
        #         if last_date_obj.date() == datetime.now().date():
        #             if len(last_avl_timestamp_df) > 1:
        #                 last_avl_timestamp = last_avl_timestamp_df.iloc[-2]['timestamp']
        #                 last_avl_timestamp_df = last_avl_timestamp_df.iloc[:-1]

        # Read new stock data
        overlap_n = 5
        base_df = last_avl_timestamp_df
        overlap_start_ts = None
        if not last_avl_timestamp_df.empty:
            start_idx = max(0, len(last_avl_timestamp_df) - overlap_n)
            overlap_start_ts = last_avl_timestamp_df.iloc[start_idx]['timestamp']
            base_df = last_avl_timestamp_df.iloc[:start_idx]
            base_df['timestamp'] = base_df['timestamp'].dt.strftime('%d/%m/%Y %H:%M:%S')


        dataframe = read_csv_data(filepath)
        # print(f"Loaded data from {filepath}")

        dataframe['tradeDate'] = pd.to_datetime(dataframe['tradeDate'], dayfirst=True)
        dataframe = dataframe.sort_values(by="tradeDate", ascending=True)
        # dataframe['index'] = range(len(dataframe))
        # dataframe.set_index('index', inplace=True)

        # Filter new data entries
        # if last_avl_timestamp:
        #     last_date_obj = datetime.strptime(last_avl_timestamp, "%d/%m/%Y %H:%M:%S")
        #     dataframe = dataframe[dataframe['tradeDate'] > last_date_obj]
        #     dataframe = dataframe.reset_index(drop=True)
        logger.info(f"overlap_start_ts {overlap_start_ts}, {dataframe['tradeDate'].iloc[-1]}")
        if overlap_start_ts:
            logger.info("filtering999999999999999999999999999999999999999999999999999999999999999999999999999999999")
            dataframe = dataframe[dataframe['tradeDate'] >= overlap_start_ts].reset_index(drop=True)

        if dataframe.empty:
            # print(f"No new data found for {filename}.")
            return {"message": "No new data to process."}

        # Add new columns
        new_columns = [
            'wick', 'is_basing', 'is_bullish', 'ideal_zone', 'zone_or_not',
            'zone2', 'additional_zone_type', 'buy_sell_zone_type', 'buy_sell_zone', 'tick'
        ]
        for col in new_columns:
            dataframe[col] = np.nan
        logger.info(f"df length {len(dataframe)} {overlap_start_ts}")
        # Apply processing and transformations
        dataframe = calculate_wick_values(dataframe)
        dataframe = calculate_bullish_candles(dataframe)
        dataframe = calculate_base_candles(dataframe)
        dataframe = mark_bad_zone_records(dataframe)
        dataframe = identify_leg_out_candles(dataframe)
        dataframe = update_additional_zone_type(dataframe)
        dataframe = update_buy_sell_zone_type_Prioritize_larger_patterns_over_smaller_ones(dataframe)
        dataframe = update_bz_sz(dataframe)

        # Add tick and format timestamp
        dataframe['tick'] = filename.replace(".csv", "").rsplit("_")[0]
        dataframe.rename(columns={"tradeDate": "timestamp"}, inplace=True)
        dataframe['timestamp'] = dataframe['timestamp'].dt.strftime('%d/%m/%Y %H:%M:%S')

        # Combine with previously processed data
        combined_data = pd.concat([base_df, dataframe], ignore_index=True).drop_duplicates(subset=['timestamp'], keep='last')
        combined_data.reset_index(drop=True, inplace=True)
        # Update IDs and normalize values
        combined_data['id'] = range(len(combined_data))

        write_filepath = os.path.join(out_dir, filename)
        write_csv_data(combined_data, write_filepath)
        # print(f"Successfully updated {write_filepath} with {len(dataframe)} new rows.")

        return {"message": "success"}

    except Exception as ex:
        logger.exception(f"Error processing {filename}: {ex}", stack_info=True)
        raise RuntimeError(f"An error occurred while processing {filename}") from ex


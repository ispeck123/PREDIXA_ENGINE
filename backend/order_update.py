import os
import pandas as pd
from datetime import datetime
from shared.config.settings import stock_logic_config as slcfg
from dateutil import parser

# -------------------- Core Utilities --------------------

def is_in_range(value, lower_bound, upper_bound):
    """Check if a value lies within a given range."""
    return min(lower_bound, upper_bound) <= value <= max(lower_bound, upper_bound)

def calculate_profit_or_loss(current_value, entry_value, order_type):
    """Calculate absolute and percentage profit/loss."""
    if order_type.lower() == 'buy':
        difference = current_value - entry_value
    elif order_type.lower() == 'sell':
        difference = entry_value - current_value
    else:
        raise ValueError("Invalid order type")
    
    percentage_change = (difference / entry_value) * 100
    return round(difference, 2), round(percentage_change, 2)

def check_price_hit(price, row, order_type, is_target=True):
    """Check if stoploss or target is hit based on order type and candle data."""
    low = row.get('low')
    high = row.get('high')

    if is_in_range(price, low, high):
        return True

    # Additional condition in case price is outside strict high/low but logic still applies
    if order_type == 'Buy':
        return high >= price if is_target else low <= price
    elif order_type == 'Sell':
        return low <= price if is_target else high >= price
    return False

# -------------------- Entry Hit Check --------------------

def check_entry_hit(stock_name, entry_price, created_on, time_frame, data_dir):
    exe_frame = getattr(slcfg, f"TIME_FRAMES_{time_frame}")[-1]
    file_path = f"{data_dir}/processed_data_files/{stock_name}_{exe_frame}.csv"
    print(file_path)
    df = pd.read_csv(file_path)
    df['timestamp'] = pd.to_datetime(df['timestamp'], dayfirst=True)
    created_dt = parser.parse(created_on)
    # created_dt = datetime.strptime(created_on, "%Y-%m-%dT%H:%M")

    df = df[df['timestamp'] >= created_dt].reset_index(drop=True)
    for i in range(len(df)):
        row = df.iloc[i]
        if is_in_range(entry_price, row['low'], row['high']):
            return True, row['timestamp']
    return False, None

# -------------------- Order Status Evaluation --------------------

def evaluate_order_status(
    data_dir: str,
    stock_name: str,
    entry_price: float,
    created_on: str,
    stop_loss: float,
    target_price: float,
    quantity: float,
    order_type: str,
    time_frame: int,
    capture_forensics: bool = False
):
    exe_frame = getattr(slcfg, f"TIME_FRAMES_{time_frame}")[-1]
    file_path = f"{data_dir}/processed_data_files/{stock_name}_{exe_frame}.csv"
    df = pd.read_csv(file_path)
    df['timestamp'] = pd.to_datetime(df['timestamp'], dayfirst=True)
    created_dt = datetime.strptime(created_on, "%Y-%m-%dT%H:%M")

    df = df[df['timestamp'] >= created_dt].reset_index(drop=True)

    if capture_forensics:
        from scripts.evaluator_forensics import evaluate_with_capture
        return evaluate_with_capture(
            df, entry_price, stop_loss, target_price, quantity, order_type,
            check_price_hit, calculate_profit_or_loss,
        )

    result = {
        "status": "pending",
        "reason": "In progress",
        "entry_hit": False,
        "completed_on": None
    } # 

    for i in range(len(df)):
        row = df.iloc[i]

        if not result['entry_hit']:
            result['entry_hit'] = is_in_range(entry_price, row['low'], row['high'])
            if not result['entry_hit']:
                continue

        sl_hit = check_price_hit(stop_loss, row, order_type, is_target=False)
        tp_hit = check_price_hit(target_price, row, order_type, is_target=True)

        if sl_hit and not tp_hit:
            loss_amount, loss_pct = calculate_profit_or_loss(stop_loss * quantity, entry_price * quantity, order_type)
            result.update({
                "status": "failed",
                "reason": "Stoploss hit",
                "loss_amount": loss_amount,
                "loss_pct": loss_pct,
                "completed_on": row['timestamp']
            }) # 
            return result

        if tp_hit:
            profit_amount, profit_pct = calculate_profit_or_loss(target_price * quantity, entry_price * quantity, order_type)
            result.update({
                "status": "success",
                "reason": "Target hit",
                "profit_amount": profit_amount,
                "profit_pct": profit_pct,
                "completed_on": row['timestamp']
            }) # 
            return result

    # If trade still open
    latest_close = df.iloc[-1]['close']
    diff, pct = calculate_profit_or_loss(latest_close * quantity, entry_price * quantity, order_type)
    result.update({
        "status": "pending",
        "reason": "Still active",
        "current_difference": diff,
        "current_pct_change": pct
    })

    return result

"""Optional forensic capture for the existing order evaluator.

The evaluator supplies this module the same filtered execution-timeframe frame
it uses for stop/target decisions. Capture is opt-in and does not alter the
legacy result shape when disabled.
"""
from __future__ import annotations


def _bar(row):
    return {
        "timestamp": row["timestamp"].isoformat(sep=" ") if hasattr(row["timestamp"], "isoformat") else str(row["timestamp"]),
        "open": float(row["open"]),
        "high": float(row["high"]),
        "low": float(row["low"]),
        "close": float(row["close"]),
        **({"volume": float(row["volume"])} if "volume" in row.index else {}),
    }


def evaluate_with_capture(df, entry_price, stop_loss, target_price, quantity,
                          order_type, check_price_hit, calculate_profit_or_loss,
                          max_post_stop_bars=20):
    """Evaluate and emit the exact bar path used by the evaluator."""
    result = {
        "status": "pending", "reason": "In progress", "entry_hit": False,
        "completed_on": None, "forensic_capture_version": "evaluator-v1",
        "execution_timeframe_bar_path": [], "post_stop_20_bars": [],
        "fill_bar_index": None, "exit_bar_index": None,
    }
    entry_index = None
    for i in range(len(df)):
        row = df.iloc[i]
        if not result["entry_hit"]:
            result["entry_hit"] = min(row["low"], row["high"]) <= entry_price <= max(row["low"], row["high"])
            if not result["entry_hit"]:
                continue
            entry_index = i

        result["execution_timeframe_bar_path"].append(_bar(row))
        sl_hit = check_price_hit(stop_loss, row, order_type, is_target=False)
        tp_hit = check_price_hit(target_price, row, order_type, is_target=True)
        if sl_hit and not tp_hit:
            loss_amount, loss_pct = calculate_profit_or_loss(stop_loss * quantity, entry_price * quantity, order_type)
            result.update({"status": "failed", "reason": "Stoploss hit", "loss_amount": loss_amount,
                           "loss_pct": loss_pct, "completed_on": row["timestamp"],
                           "exit_bar_index": i - entry_index})
            result["stop_hit_bar_index"] = i - entry_index
            result["post_stop_20_bars"] = [_bar(df.iloc[j]) for j in range(i + 1, min(i + 1 + max_post_stop_bars, len(df)))]
            return result
        if tp_hit:
            profit_amount, profit_pct = calculate_profit_or_loss(target_price * quantity, entry_price * quantity, order_type)
            result.update({"status": "success", "reason": "Target hit", "profit_amount": profit_amount,
                           "profit_pct": profit_pct, "completed_on": row["timestamp"],
                           "exit_bar_index": i - entry_index})
            return result

    if len(df) and result["entry_hit"]:
        latest_close = df.iloc[-1]["close"]
        diff, pct = calculate_profit_or_loss(latest_close * quantity, entry_price * quantity, order_type)
        result.update({"reason": "Still active", "current_difference": diff, "current_pct_change": pct})
    else:
        result.update({"reason": "Still active", "entry_hit": False})
    return result

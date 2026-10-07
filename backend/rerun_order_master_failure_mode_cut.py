#!/usr/bin/env python3
"""Re-run completed order-master trades through OHLC evaluation with capture.

The scan is re-run at the order's setup timestamp for structural context; the
evaluator is then run over the current execution-timeframe OHLC source with
forensic capture enabled. Recorded order outcomes are retained for comparison.
"""
from __future__ import annotations

import csv
import json
import math
import zipfile
from datetime import datetime
from pathlib import Path
import sys

import pandas as pd

# When executed as a file, make the repository root available for the
# production modules' absolute `scripts.*` imports.
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from evaluator_forensics import evaluate_with_capture
from order_update import calculate_profit_or_loss, check_price_hit
from setup_engine import process_setup
from shared.config.settings import stock_logic_config as slcfg

MASTER = ROOT / "outputs/cash_order_master_engine_rerun_20260901_141530/all_orders_engine_enriched.csv"
DATA_DIR = ROOT / "data/indian_stock_data/latest_data_csv"
OUT = ROOT / "outputs/predixa_failure_mode_data_cut_evaluator_20260916"


def val(x):
    if x in (None, "", "nan", "NaN"):
        return None
    try:
        return float(x)
    except (TypeError, ValueError):
        return x


def bar(row):
    return {"timestamp": row["timestamp"].isoformat(sep=" "), "open": float(row["open"]), "high": float(row["high"]), "low": float(row["low"]), "close": float(row["close"]), "volume": float(row["volume"]) if "volume" in row.index else None}


def classify(result, entry, target, stop, direction):
    path = result.get("execution_timeframe_bar_path", [])
    favorable = [x["high"] if direction == "BUY" else x["low"] for x in path]
    if favorable:
        max_favorable = max(favorable) if direction == "BUY" else min(favorable)
        max_idx = favorable.index(max_favorable)
    else:
        max_favorable, max_idx = None, None
    stopped = result.get("status") == "failed" and "stop" in str(result.get("reason", "")).lower()
    stop_idx = result.get("stop_hit_bar_index") if stopped else None
    half = entry + (target - entry) * 0.5 if entry is not None and target is not None else None
    half_idx = next((i for i, x in enumerate(path) if (x["high"] >= half if direction == "BUY" else x["low"] <= half)), None) if half is not None else None
    post = result.get("post_stop_20_bars", [])
    post_target = stopped and any((x["high"] >= target if direction == "BUY" else x["low"] <= target) for x in post)
    reached = 1.0 if result.get("status") == "success" and "target" in str(result.get("reason", "")).lower() else ((max_favorable - entry) / (target - entry) if max_favorable is not None and target not in (None, entry) else None)
    if result.get("status") == "success" and "target" in str(result.get("reason", "")).lower():
        flag = "WIN"
    elif stopped and stop_idx is not None and max_idx is not None and max_idx < stop_idx and reached is not None and reached >= 0.5:
        flag = "PROBLEM_1_GIVEBACK"
    elif stopped and stop_idx is not None and (half_idx is None or stop_idx < half_idx) and post_target:
        flag = "PROBLEM_2_PREMATURE_STOP"
    elif stopped and stop_idx is not None:
        flag = "CLEAN_LOSS"
    else:
        flag = None
    return max_favorable, max_idx, stop_idx, reached, post_target, flag


def scan_context(row):
    try:
        tf = int(float(row["time_frame"]))
        frames = getattr(slcfg, f"TIME_FRAMES_{tf}")
        setup_time = pd.Timestamp(row["purchased_cmp_date"])
        setup = process_setup(row["symbol"], frames, setup_time)
        if not isinstance(setup, dict):
            return {}, ["SCAN_FAILED: " + str(setup)]
        payload = setup.get("best_setup_long" if str(row["order_type"]).upper() == "BUY" else "best_setup_short")
        if payload is None:
            return {}, ["SELECTED_SETUP_NOT_REEMITTED"]
        return {
            "zone_id": getattr(payload, "zone_id", None),
            "zone_type": getattr(payload, "zone_type", None),
            "zone_proximal": getattr(payload, "zone_proximal", None),
            "zone_distal": getattr(payload, "zone_distal", None),
            "entry_zone_width_pct": getattr(payload, "entry_zone_width_pct", None),
            "entry_position_in_zone": getattr(payload, "entry_tertile", None),
            "nearest_resistance_between_entry_and_target": getattr(payload, "nearest_resistance_between_entry_and_target", None),
            "scan_timestamp": str(setup_time),
        }, []
    except Exception as exc:
        return {}, [f"SCAN_FAILED: {type(exc).__name__}: {exc}"]


def one(row):
    direction = str(row["order_type"]).upper()
    entry, target, stop, qty = map(val, (row["entry_price"], row["target_price"], row["stoploss_price"], row["stock_quantity"]))
    oid = int(float(row["order_id"]))
    tf = int(float(row["time_frame"]))
    exe = getattr(slcfg, f"TIME_FRAMES_{tf}")[-1]
    source = DATA_DIR / f"{row['symbol']}_{exe}.csv"
    warnings = []
    context, scan_warnings = scan_context(row)
    warnings.extend(scan_warnings)
    if not source.exists():
        warnings.append("EXECUTION_OHLC_SOURCE_UNAVAILABLE")
        result = {"status": "unavailable", "reason": "OHLC source unavailable", "execution_timeframe_bar_path": [], "post_stop_20_bars": []}
    else:
        df = pd.read_csv(source)
        timestamp_column = "timestamp" if "timestamp" in df.columns else "tradeDate"
        df["timestamp"] = pd.to_datetime(df[timestamp_column], dayfirst=True)
        created = pd.Timestamp(row["entry_timestamp"])
        df = df[df["timestamp"] >= created].reset_index(drop=True)
        result = evaluate_with_capture(df, entry, stop, target, qty, direction.title(), check_price_hit, calculate_profit_or_loss)
        if len(result.get("post_stop_20_bars", [])) < 20 and result.get("status") == "failed":
            warnings.append("POST_STOP_WINDOW_INCOMPLETE")
    derived = classify(result, entry, target, stop, direction) if result.get("status") in {"success", "failed"} else (None, None, None, None, False, None)
    max_favorable, max_idx, stop_idx, reached, post_target, flag = derived
    recorded_status = row.get("status")
    recorded_reason = row.get("reason")
    if recorded_status != result.get("status") or (recorded_reason and recorded_reason != result.get("reason")):
        warnings.append("RECORDED_VS_FRESH_EVALUATION_DIFFERENCE")
    structural_defaults = {
        "zone_id": None, "zone_type": None, "zone_proximal": None,
        "zone_distal": None, "entry_zone_width_pct": None,
        "entry_position_in_zone": None,
        "nearest_resistance_between_entry_and_target": None,
        "scan_timestamp": None,
    }
    structural_defaults.update(context)
    return {
        "order_id": oid, "symbol": row["symbol"], "trade_direction": direction,
        "entry_price": entry, "target_price": target, "stoploss_price": stop,
        "entry_timestamp": row["entry_timestamp"], "recorded_exit_timestamp": row["completed_on"],
        "recorded_transaction_status": recorded_status, "recorded_outcome_reason": recorded_reason,
        "fresh_evaluator_status": result.get("status"), "fresh_evaluator_reason": result.get("reason"),
        "execution_timeframe": exe, "execution_ohlc_source": str(source.relative_to(ROOT)),
        "post_entry_bar_path": result.get("execution_timeframe_bar_path", []),
        "post_stop_20_bars": result.get("post_stop_20_bars", []),
        "max_favorable_price": max_favorable, "max_favorable_bar_index": max_idx,
        "stop_hit_bar_index": stop_idx, "reached_pct_of_target": reached,
        "post_stop_reached_target": post_target, "sequence_flag": flag,
        "classification_status": "CLASSIFIED" if flag else "UNCLASSIFIABLE_BAR_PATH_OR_EVALUATION",
        **structural_defaults,
        "data_quality_flags": sorted(set(warnings)),
    }


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    with open(MASTER, newline="", encoding="utf-8") as fh:
        rows = [r for r in csv.DictReader(fh) if r.get("status") in {"success", "failed"}]
    records = [one(row) for row in rows]
    records.sort(key=lambda x: x["order_id"])
    jsonl = OUT / "completed_trade_failure_mode_cut.jsonl"
    with open(jsonl, "w", encoding="utf-8") as fh:
        for r in records:
            fh.write(json.dumps(r, separators=(",", ":"), ensure_ascii=False) + "\n")
    summary = OUT / "completed_trade_failure_mode_summary.json"
    counts = {}
    for r in records:
        key = r["sequence_flag"] or "UNCLASSIFIABLE"
        counts[key] = counts.get(key, 0) + 1
    summary.write_text(json.dumps({"generated_on": datetime.now().isoformat(timespec="seconds"), "order_master_source": str(MASTER), "completed_trade_count": len(records), "sequence_counts": counts, "records": records}, indent=2, ensure_ascii=False), encoding="utf-8")
    csv_path = OUT / "completed_trade_failure_mode_summary.csv"
    fields = ["order_id", "symbol", "trade_direction", "entry_price", "target_price", "stoploss_price", "entry_timestamp", "recorded_exit_timestamp", "recorded_transaction_status", "fresh_evaluator_status", "fresh_evaluator_reason", "execution_timeframe", "max_favorable_price", "max_favorable_bar_index", "stop_hit_bar_index", "reached_pct_of_target", "post_stop_reached_target", "sequence_flag", "classification_status", "zone_id", "zone_type", "zone_proximal", "zone_distal", "entry_zone_width_pct", "entry_position_in_zone", "nearest_resistance_between_entry_and_target", "post_entry_bar_count", "post_stop_bar_count", "data_quality_flags"]
    with open(csv_path, "w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=fields); writer.writeheader()
        for r in records:
            row = {k: r.get(k) for k in fields}; row["post_entry_bar_count"] = len(r["post_entry_bar_path"]); row["post_stop_bar_count"] = len(r["post_stop_20_bars"]); row["data_quality_flags"] = ";".join(r["data_quality_flags"]); writer.writerow(row)
    readme = OUT / "README.md"
    readme.write_text("# PREDIXA evaluator-emitted failure-mode cut\n\nThis cut includes every completed order-master row. Each row was re-evaluated against the execution-timeframe OHLC using the same evaluator decision logic with opt-in capture of the fill-to-exit path and up to 20 post-stop bars. Setup context was re-emitted by rerunning the scan at the recorded setup timestamp.\n\n`recorded_*` fields are the order-master outcome; `fresh_evaluator_*` fields show the result of the re-run. Differences are flagged and require review because current OHLC may differ from the historical evaluation snapshot.\n", encoding="utf-8")
    zpath = OUT.with_suffix(".zip")
    with zipfile.ZipFile(zpath, "w", compression=zipfile.ZIP_DEFLATED) as z:
        for p in (jsonl, summary, csv_path, readme): z.write(p, p.name)
    print(f"Generated {len(records)} evaluator-emitted records at {OUT}")
    print(json.dumps(counts, sort_keys=True))


if __name__ == "__main__":
    main()

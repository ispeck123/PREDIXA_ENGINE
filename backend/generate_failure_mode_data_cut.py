#!/usr/bin/env python3
"""Generate the PREDIXA completed-trade failure-mode data cut.

This is a read-only transformation of the Phase 2 forensic JSON records.  It
does not alter the incident report or any source data.
"""
from __future__ import annotations

import glob
import json
import math
import os
import csv
import zipfile
from datetime import datetime
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "outputs" / "forensics_phase2"
OUT = ROOT / "outputs" / "predixa_failure_mode_data_cut_20260916"


FRAME_MINUTES = {
    "twenty_five": 25,
    "sixty": 60,
    "seventy_five": 75,
    "one_twenty_five": 125,
    "daily": 1440,
    "weekly": 10080,
    "monthly": 43200,
}


def num(value):
    return float(value) if value is not None else None


def iso_from_source(value):
    if not value:
        return None
    # Keep source timestamps, but normalize the bar date to ISO where possible.
    for fmt in ("%d/%m/%Y %H:%M:%S", "%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S"):
        try:
            return datetime.strptime(str(value), fmt).isoformat(sep=" ")
        except ValueError:
            pass
    return str(value)


def choose_frame(frames):
    candidates = []
    for name, groups in frames.items():
        active = groups.get("active_trade", {})
        rows = active.get("rows", []) if isinstance(active, dict) else []
        if rows:
            candidates.append((FRAME_MINUTES.get(name, 10**9), -len(rows), name))
    if candidates:
        return sorted(candidates)[0][2]
    # Preserve a useful source reference when the active window is unavailable.
    return min(frames, key=lambda name: FRAME_MINUTES.get(name, 10**9)) if frames else "unavailable"


def row_for_bar(row, index, after_stop=False):
    return {
        "bar_index": index,
        "timestamp": iso_from_source(row.get("tradeDate")),
        "open": num(row.get("open")),
        "high": num(row.get("high")),
        "low": num(row.get("low")),
        "close": num(row.get("close")),
        **({"volume": num(row.get("qty"))} if row.get("qty") is not None else {}),
        **({"bar_phase": "post_stop"} if after_stop else {"bar_phase": "active_trade"}),
    }


def favorable_price(direction, bar):
    return bar["high"] if direction.upper() == "BUY" else bar["low"]


def stop_touched(direction, bar, stop):
    return (bar["low"] <= stop) if direction.upper() == "BUY" else (bar["high"] >= stop)


def target_touched(direction, bar, target):
    return (bar["high"] >= target) if direction.upper() == "BUY" else (bar["low"] <= target)


def derive(record):
    order = record["order"]
    outcome = record["outcome"]
    direction = str(order.get("order_type") or "").upper()
    entry = num(order.get("entry_price"))
    target = num(order.get("target_price"))
    stop = num(order.get("stoploss_price"))
    frames = record.get("ohlc", {}).get("frames", {})
    frame = choose_frame(frames)
    groups = frames.get(frame, {})
    active_rows = groups.get("active_trade", {}).get("rows", [])
    post_rows = groups.get("post_trade", {}).get("rows", [])
    path = [row_for_bar(row, i) for i, row in enumerate(active_rows)]
    post_stop_path = [row_for_bar(row, i + 1, after_stop=True) for i, row in enumerate(post_rows[:20])]

    favorable = [favorable_price(direction, bar) for bar in path if favorable_price(direction, bar) is not None]
    if favorable:
        if direction == "BUY":
            max_favorable = max(favorable)
            max_idx = next(i for i, bar in enumerate(path) if bar.get("high") == max_favorable)
        else:
            max_favorable = min(favorable)
            max_idx = next(i for i, bar in enumerate(path) if bar.get("low") == max_favorable)
    else:
        max_favorable, max_idx = None, None

    raw_status = str(outcome.get("status") or "").lower()
    reason = str(outcome.get("reason") or "")
    is_win = raw_status == "success" and "target" in reason.lower()
    is_stopped = raw_status == "failed" and "stop" in reason.lower()
    # The requested field is the modeled stop event, not merely a bar whose
    # range crossed the stop level on a winning trade.
    stop_idx = next((i for i, bar in enumerate(path) if stop_touched(direction, bar, stop)), None) if is_stopped and stop is not None else None
    first_half_r_idx = None
    if entry is not None and target is not None:
        half_level = entry + (target - entry) * 0.5
        for i, bar in enumerate(path):
            touched = (bar.get("high") is not None and bar["high"] >= half_level) if direction == "BUY" else (bar.get("low") is not None and bar["low"] <= half_level)
            if touched:
                first_half_r_idx = i
                break

    post_stop_target = any(target_touched(direction, bar, target) for bar in post_stop_path) if is_stopped and target is not None else False

    classification_status = "CLASSIFIED"
    if is_win:
        sequence_flag = "WIN"
        reached_pct = 1.0
    elif is_stopped and (not path or stop_idx is None):
        # A stop outcome without a bar that crosses the stop cannot be
        # assigned to give-back, premature-stop, or clean breakdown without
        # inventing sequence evidence.
        reached_pct = ((max_favorable - entry) / (target - entry)) if max_favorable is not None and target not in (None, entry) else None
        sequence_flag = None
        classification_status = "UNCLASSIFIABLE_BAR_PATH_INCOMPLETE"
    elif is_stopped and stop_idx is not None and max_idx is not None and max_idx < stop_idx and entry is not None and target not in (None, entry):
        reached_pct = (max_favorable - entry) / (target - entry)
        sequence_flag = "PROBLEM_1_GIVEBACK" if reached_pct >= 0.5 else "CLEAN_LOSS"
    elif is_stopped and stop_idx is not None and first_half_r_idx is not None and stop_idx < first_half_r_idx and post_stop_target:
        reached_pct = ((max_favorable - entry) / (target - entry)) if max_favorable is not None and target not in (None, entry) else None
        sequence_flag = "PROBLEM_2_PREMATURE_STOP"
    elif is_stopped:
        reached_pct = ((max_favorable - entry) / (target - entry)) if max_favorable is not None and target not in (None, entry) else None
        sequence_flag = "CLEAN_LOSS"
    else:
        reached_pct = ((max_favorable - entry) / (target - entry)) if max_favorable is not None and target not in (None, entry) else None
        sequence_flag = "CLEAN_LOSS" if raw_status == "failed" else "UNKNOWN"

    resistances = []
    for frame_name, frame_data in frames.items():
        value = frame_data.get("setup", {}).get("nearest_resistance")
        if value is None or entry is None or target is None:
            continue
        value = num(value)
        if direction == "BUY" and entry < value < target:
            resistances.append(value)
        elif direction == "SELL" and target < value < entry:
            resistances.append(value)
    nearest_resistance = (min(resistances) if direction == "BUY" else max(resistances)) if resistances else None

    warnings = list(record.get("data_quality", {}).get("flags", []))
    if not active_rows:
        warnings.append("ACTIVE_BAR_PATH_UNAVAILABLE_FOR_SELECTED_SOURCE_FRAMES")
    if is_stopped and len(post_stop_path) < 20:
        warnings.append("POST_STOP_WINDOW_INCOMPLETE")
    warnings.extend(["ENTRY_ZONE_WIDTH_UNAVAILABLE", "ENTRY_TERTILE_UNAVAILABLE"])

    return {
        "order_id": order.get("order_id"),
        "symbol": order.get("stock_tick"),
        "trade_direction": direction,
        "entry_price": entry,
        "target_price": target,
        "stoploss_price": stop,
        "entry_timestamp": order.get("entry_timestamp"),
        "exit_timestamp": outcome.get("completed_on") or order.get("completed_on"),
        "transaction_status": outcome.get("status"),
        "outcome_reason": reason,
        "source_timeframe": frame,
        "post_entry_bar_path": path,
        "post_stop_20_bars": post_stop_path if is_stopped else [],
        "max_favorable_price": max_favorable,
        "max_favorable_bar_index": max_idx,
        "stop_hit_bar_index": stop_idx,
        "reached_pct_of_target": reached_pct,
        "post_stop_reached_target": post_stop_target,
        "sequence_flag": sequence_flag,
        "classification_status": classification_status,
        "nearest_resistance_between_entry_and_target": nearest_resistance,
        "entry_zone_width_pct": None,
        "entry_position_in_zone": None,
        "structural_context_note": "Evidence unavailable: zone proximal/distal and entry tertile were not present in the Phase 2 source record.",
        "source_files": sorted({s for group in frames.values() for part in group.values() if isinstance(part, dict) for s in part.get("source_files", [])}),
        "data_quality_flags": sorted(set(warnings)),
    }


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    records = []
    for filename in sorted(glob.glob(str(SRC / "*" / "order_*.json"))):
        with open(filename, encoding="utf-8") as fh:
            record = json.load(fh)
        if record.get("outcome", {}).get("status") not in {"success", "failed"}:
            continue
        records.append(derive(record))
    records.sort(key=lambda item: int(item["order_id"]))

    jsonl = OUT / "completed_trade_failure_mode_cut.jsonl"
    with open(jsonl, "w", encoding="utf-8") as fh:
        for item in records:
            fh.write(json.dumps(item, separators=(",", ":"), ensure_ascii=False) + "\n")

    summary = OUT / "completed_trade_failure_mode_summary.json"
    counts = {}
    for item in records:
        counts[item["sequence_flag"]] = counts.get(item["sequence_flag"], 0) + 1
    with open(summary, "w", encoding="utf-8") as fh:
        json.dump({"generated_on": datetime.now().isoformat(timespec="seconds"), "trade_count": len(records), "sequence_counts": counts, "source": str(SRC), "records": records}, fh, indent=2, ensure_ascii=False)

    csv_path = OUT / "completed_trade_failure_mode_summary.csv"
    columns = [
        "order_id", "symbol", "trade_direction", "entry_price", "target_price",
        "stoploss_price", "entry_timestamp", "exit_timestamp", "transaction_status",
        "source_timeframe", "max_favorable_price", "max_favorable_bar_index",
        "stop_hit_bar_index", "reached_pct_of_target", "post_stop_reached_target",
        "sequence_flag", "classification_status", "nearest_resistance_between_entry_and_target",
        "entry_zone_width_pct", "entry_position_in_zone", "post_entry_bar_count",
        "post_stop_bar_count", "data_quality_flags",
    ]
    with open(csv_path, "w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=columns)
        writer.writeheader()
        for item in records:
            row = {key: item.get(key) for key in columns}
            row["post_entry_bar_count"] = len(item["post_entry_bar_path"])
            row["post_stop_bar_count"] = len(item["post_stop_20_bars"])
            row["data_quality_flags"] = ";".join(item["data_quality_flags"])
            writer.writerow(row)

    readme = OUT / "README.md"
    readme.write_text(
        "# PREDIXA failure-mode data cut\n\n"
        "Generated from the read-only Phase 2 forensic JSON records. One JSONL row is emitted per completed trade, including wins. `post_entry_bar_path` contains the available fill-to-exit OHLC rows; stopped trades also contain up to 20 rows in `post_stop_20_bars`.\n\n"
        "Sequence flags follow the supplied specification. A WIN is taken from the recorded target-hit outcome. A stopped trade is classified from bar order only when the required active and continuation bars are available.\n\n"
        "Known data gaps are preserved as null and flagged: broker/OMS linkage and some timestamps are inferred or unavailable; zone proximal/distal and entry tertile were not present in the Phase 2 records; some active/post-stop windows are incomplete. These gaps prevent a confident structural correlation for those fields.\n",
        encoding="utf-8",
    )
    package_zip = OUT.with_suffix(".zip")
    with zipfile.ZipFile(package_zip, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for filename in (jsonl, summary, csv_path, readme):
            archive.write(filename, filename.name)
    print(f"Generated {len(records)} records at {OUT}")
    print(json.dumps({str(key): value for key, value in counts.items()}, sort_keys=True))


if __name__ == "__main__":
    main()

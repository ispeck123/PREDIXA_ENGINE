#!/usr/bin/env python3
"""Generate the failure-mode cut for every completed order-master row."""
from __future__ import annotations

import copy
import csv
import glob
import json
import sys
import zipfile
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(Path(__file__).resolve().parent))
from generate_failure_mode_data_cut import derive  # noqa: E402

MASTER = ROOT / "outputs/cash_order_master_engine_rerun_20260901_141530/all_orders_engine_enriched.csv"
FORENSIC_DIRS = [ROOT / "outputs/forensics_phase2", ROOT / "outputs/forensics_phase1"]
OUT = ROOT / "outputs/predixa_failure_mode_data_cut_order_master_20260916"


def load_forensics():
    result = {}
    # Phase 2 is preferred where the same ID exists; phase 1 fills gaps.
    for directory in reversed(FORENSIC_DIRS):
        for filename in glob.glob(str(directory / "*" / "order_*.json")):
            with open(filename, encoding="utf-8") as fh:
                record = json.load(fh)
            result[str(record["order"]["order_id"])] = record
    return result


def f(value):
    if value in (None, "", "nan", "NaN"):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return value


def build_record(master, forensic):
    if forensic:
        record = copy.deepcopy(forensic)
    else:
        record = {
            "data_quality": {"flags": ["BAR_PATH_EVIDENCE_UNAVAILABLE_FOR_ORDER_MASTER_RECORD"]},
            "ohlc": {"frames": {"daily": {"active_trade": {"rows": []}, "post_trade": {"rows": []}}}},
            "setup": {"order_master": {}},
            "outcome": {},
        }
    order = record.setdefault("order", {})
    order.update({
        "order_id": int(master["order_id"]),
        "stock_tick": master.get("symbol"),
        "order_type": master.get("order_type"),
        "entry_price": f(master.get("entry_price")),
        "stoploss_price": f(master.get("stoploss_price")),
        "target_price": f(master.get("target_price")),
        "stock_quantity": f(master.get("stock_quantity")),
        "entry_timestamp": master.get("entry_timestamp"),
        "completed_on": master.get("completed_on"),
    })
    record["outcome"] = {
        "status": master.get("status"),
        "reason": master.get("reason") or "",
        "completed_on": master.get("completed_on"),
    }
    return record


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    forensics = load_forensics()
    with open(MASTER, newline="", encoding="utf-8") as fh:
        master_rows = [row for row in csv.DictReader(fh) if row.get("status") in {"success", "failed"}]

    records = []
    for master in master_rows:
        oid = str(int(float(master["order_id"])))
        item = derive(build_record(master, forensics.get(oid)))
        # entry_tertile is present in the order master and is therefore the
        # authoritative value for this cut, even though it was absent in the
        # Phase 2 snapshot.
        tertile = master.get("entry_tertile")
        item["entry_position_in_zone"] = int(float(tertile)) if tertile not in (None, "", "nan", "NaN") else None
        item["order_master_source"] = str(MASTER.relative_to(ROOT))
        item["order_master_match_status"] = "BAR_PATH_JOINED" if oid in forensics else "BAR_PATH_UNAVAILABLE"
        records.append(item)
    records.sort(key=lambda x: int(x["order_id"]))

    jsonl = OUT / "completed_trade_failure_mode_cut.jsonl"
    with open(jsonl, "w", encoding="utf-8") as fh:
        for item in records:
            fh.write(json.dumps(item, separators=(",", ":"), ensure_ascii=False) + "\n")

    counts = {}
    for item in records:
        key = item["sequence_flag"] or "UNCLASSIFIABLE"
        counts[key] = counts.get(key, 0) + 1
    summary = OUT / "completed_trade_failure_mode_summary.json"
    summary.write_text(json.dumps({
        "generated_on": datetime.now().isoformat(timespec="seconds"),
        "order_master_source": str(MASTER),
        "completed_trade_count": len(records),
        "sequence_counts": counts,
        "records": records,
    }, indent=2, ensure_ascii=False), encoding="utf-8")

    fields = ["order_id", "symbol", "trade_direction", "entry_price", "target_price", "stoploss_price", "entry_timestamp", "exit_timestamp", "transaction_status", "source_timeframe", "max_favorable_price", "max_favorable_bar_index", "stop_hit_bar_index", "reached_pct_of_target", "post_stop_reached_target", "sequence_flag", "classification_status", "nearest_resistance_between_entry_and_target", "entry_zone_width_pct", "entry_position_in_zone", "order_master_match_status", "post_entry_bar_count", "post_stop_bar_count", "data_quality_flags"]
    csv_path = OUT / "completed_trade_failure_mode_summary.csv"
    with open(csv_path, "w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=fields)
        writer.writeheader()
        for item in records:
            row = {k: item.get(k) for k in fields}
            row["post_entry_bar_count"] = len(item["post_entry_bar_path"])
            row["post_stop_bar_count"] = len(item["post_stop_20_bars"])
            row["data_quality_flags"] = ";".join(item["data_quality_flags"])
            writer.writerow(row)

    readme = OUT / "README.md"
    readme.write_text(
        "# PREDIXA failure-mode data cut — order master scope\n\n"
        f"This cut includes every completed (`success` or `failed`) row in `{MASTER.relative_to(ROOT)}`. It contains {len(records)} completed orders. Phase 2/Phase 1 forensic records are joined by Order ID where available; unmatched orders are retained with empty bar paths and `BAR_PATH_UNAVAILABLE`.\n\n"
        "The order master is authoritative for order identity, symbol, direction, entry, target, stop, timestamps, outcome, and entry tertile. No conclusions are changed. `entry_zone_width_pct` remains null because proximal/distal zone boundaries are not present in the order-master or joined forensic record.\n\n"
        "A sequence flag is left null when the required stop/bar sequence cannot be established from the available OHLC path. This avoids treating missing evidence as a clean loss.\n",
        encoding="utf-8",
    )
    package_zip = OUT.with_suffix(".zip")
    with zipfile.ZipFile(package_zip, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for filename in (jsonl, summary, csv_path, readme):
            archive.write(filename, filename.name)
    print(f"Generated {len(records)} completed order-master records at {OUT}")
    print(json.dumps(counts, sort_keys=True))


if __name__ == "__main__":
    main()

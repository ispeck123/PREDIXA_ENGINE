#!/usr/bin/env python3
"""Analyze entry-time E/A regime and permission versus realized price path."""
from __future__ import annotations

import csv
import json
import sys
import zipfile
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from scripts.setup_engine import process_setup  # noqa: E402
from shared.config.settings import stock_logic_config as slcfg  # noqa: E402

MASTER = ROOT / "outputs/cash_order_master_engine_rerun_20260901_141530/all_orders_engine_enriched.csv"
PATHS = ROOT / "outputs/predixa_failure_mode_data_cut_evaluator_20260916/completed_trade_failure_mode_cut.jsonl"
OUT = ROOT / "outputs/predixa_entry_regime_permission_analysis_20260917"


def enum_value(x):
    return getattr(x, "value", str(x) if x is not None else None)


def regime_snapshot(row):
    try:
        tf = int(float(row["time_frame"]))
        frames = getattr(slcfg, f"TIME_FRAMES_{tf}")
        setup_time = pd.Timestamp(row["purchased_cmp_date"])
        setup = process_setup(row["symbol"], frames, setup_time)
        if not isinstance(setup, dict) or setup.get("trend_context") is None:
            return {"scan_status": "UNAVAILABLE"}, ["TREND_CONTEXT_UNAVAILABLE"]
        ctx = setup["trend_context"]
        direction = str(row["order_type"]).upper()
        allowed = bool(ctx.allow_long) if direction == "BUY" else bool(ctx.allow_short)
        trade_type = ctx.trade_type_long if direction == "BUY" else ctx.trade_type_short
        return {
            "scan_status": "AVAILABLE",
            "regime_E": enum_value(ctx.regime_E),
            "regime_A": enum_value(ctx.regime_A),
            "regime_X": enum_value(ctx.regime_X),
            "allow_long": bool(ctx.allow_long),
            "allow_short": bool(ctx.allow_short),
            "trade_direction_permitted": allowed,
            "permission_for_trade": "PERMITTED" if allowed else "NOT_PERMITTED",
            "trade_type_for_direction": enum_value(trade_type),
            "bias": ctx.bias,
            "permitted_setup": ctx.permitted_setup,
            "htf_veto_longs": bool(ctx.htf_veto_longs),
            "htf_veto_shorts": bool(ctx.htf_veto_shorts),
            "scan_timestamp": str(setup_time),
        }, []
    except Exception as exc:
        return {"scan_status": "ERROR"}, [f"TREND_CONTEXT_SCAN_ERROR: {type(exc).__name__}: {exc}"]


def path_metrics(row, path):
    direction = str(row["order_type"]).upper()
    entry = float(row["entry_price"])
    stop = float(row["stoploss_price"])
    target = float(row["target_price"])
    risk = abs(entry - stop)
    reward = abs(target - entry)
    favorable = []
    adverse = []
    first = None
    for i, bar in enumerate(path):
        if direction == "BUY":
            fav = float(bar["high"]) - entry
            adv = entry - float(bar["low"])
            up = float(bar["high"]) > entry
            down = float(bar["low"]) < entry
        else:
            fav = entry - float(bar["low"])
            adv = float(bar["high"]) - entry
            up = float(bar["low"]) < entry
            down = float(bar["high"]) > entry
        favorable.append(max(0.0, fav)); adverse.append(max(0.0, adv))
        if first is None:
            if up and down:
                first = "SAME_BAR_AMBIGUOUS"
            elif up:
                first = "PERMITTED_DIRECTION"
            elif down:
                first = "AGAINST_TRADE_DIRECTION"
    max_fav = max(favorable, default=None)
    max_adv = max(adverse, default=None)
    dominant = None
    if max_fav is not None and max_adv is not None and (max_fav > 0 or max_adv > 0):
        dominant = "PERMITTED_DIRECTION" if max_fav > max_adv else "AGAINST_TRADE_DIRECTION" if max_adv > max_fav else "BALANCED"
    return {
        "max_favorable_R": max_fav / risk if risk else None,
        "max_adverse_R": max_adv / risk if risk else None,
        "max_favorable_pct_of_target": max_fav / reward if reward else None,
        "first_unambiguous_move": first,
        "dominant_excursion_direction": dominant,
        "outcome_direction": "PERMITTED_DIRECTION" if row.get("fresh_evaluator_status") == "success" else "AGAINST_TRADE_DIRECTION" if row.get("fresh_evaluator_status") == "failed" else "UNRESOLVED",
    }


def main():
    with open(MASTER, newline="", encoding="utf-8") as fh:
        master = {int(float(r["order_id"])): r for r in csv.DictReader(fh) if r.get("status") in {"success", "failed"}}
    paths = {int(json.loads(line)["order_id"]): json.loads(line) for line in open(PATHS, encoding="utf-8")}
    records = []
    for oid, row in sorted(master.items()):
        regime, warnings = regime_snapshot(row)
        path_row = paths.get(oid, {})
        metrics = path_metrics({**row, **path_row}, path_row.get("post_entry_bar_path", []))
        record = {
            "order_id": oid, "symbol": row["symbol"], "trade_direction": row["order_type"],
            "recorded_status": row["status"], "recorded_reason": row["reason"],
            "fresh_evaluator_status": path_row.get("fresh_evaluator_status"),
            **regime, **metrics,
            "data_quality_flags": sorted(set(warnings + path_row.get("data_quality_flags", []))),
        }
        records.append(record)

    OUT.mkdir(parents=True, exist_ok=True)
    jsonl = OUT / "entry_regime_permission_analysis.jsonl"
    with open(jsonl, "w", encoding="utf-8") as fh:
        for r in records: fh.write(json.dumps(r, separators=(",", ":"), ensure_ascii=False) + "\n")
    fields = list(records[0].keys())
    csv_path = OUT / "entry_regime_permission_analysis.csv"
    with open(csv_path, "w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=fields); writer.writeheader()
        for r in records:
            x = dict(r); x["data_quality_flags"] = ";".join(x["data_quality_flags"]); writer.writerow(x)

    grouped = defaultdict(lambda: Counter())
    for r in records:
        key = f"E={r.get('regime_E')}, A={r.get('regime_A')}"
        grouped[key][r["outcome_direction"]] += 1
        grouped[key]["total"] += 1
    lines = ["# Entry Regime / Permission Analysis", "", f"Completed trades analyzed: {len(records)}", "", "## (E, A) state summary", "", "| E regime | A regime | Trades | Permitted-direction outcomes | Against-direction outcomes |", "|---|---:|---:|---:|---:|"]
    for key, counts in sorted(grouped.items()):
        e, a = key.split(", ")
        lines.append(f"| {e.split('=')[1]} | {a.split('=')[1]} | {counts['total']} | {counts['PERMITTED_DIRECTION']} | {counts['AGAINST_TRADE_DIRECTION']} |")
    lines += ["", "## Interpretation", "", "The `outcome_direction` column uses the fresh evaluator result: target hit = permitted direction; stop hit = against trade direction. `first_unambiguous_move` and `dominant_excursion_direction` are path-based controls, because a stop-loss outcome alone does not prove the price never first moved favorably.", "", "A state should only be called systematic if it has repeated observations and a consistently high against-direction rate. This dataset is small; states with one or very few trades are descriptive, not statistically conclusive.", ""]
    (OUT / "README.md").write_text("\n".join(lines), encoding="utf-8")
    with zipfile.ZipFile(OUT.with_suffix(".zip"), "w", compression=zipfile.ZIP_DEFLATED) as z:
        for p in (jsonl, csv_path, OUT / "README.md"): z.write(p, p.name)
    print("Generated", len(records), "records")
    print(json.dumps({k: dict(v) for k, v in sorted(grouped.items())}, indent=2))


if __name__ == "__main__": main()

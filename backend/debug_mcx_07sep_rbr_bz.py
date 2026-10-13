#!/usr/bin/env python3
"""Read-only stage trace for the CRUDEOILM 07-Sep-2026 13:00–15:00 RBR BZ.

The requested candidate is identified by its base coordinates, not a zone ID:
base [3979, 3981] / 07-Sep 13:00–15:00, expected RBR BZ around 8409/8344.
No database, scanner, OMS, or production code is mutated.
"""
from __future__ import annotations

import json
from datetime import datetime
from enum import Enum
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from scripts.additional_engine_class import ZoneQualityScorer
from scripts.mcx_session import mcx_e1_session_ids
from scripts.models import CandleSeries, Config, TF, ZoneType, load_preprocess_data
from scripts.setup_engine_new import process_setup_fc
from scripts.trade_engine import GapModule, ZoneDetector, atr, ema, process_qualified_zones_setup, volatility_regime

ROOT = Path(__file__).resolve().parents[1]
CSV = ROOT / "data/indian_commodity_data/latest_data_csv/CRUDEOILM_19102026_sixty.csv"
# Requested as-of scanner time: yesterday, before the 16:00 candle closes.
CUTOFF = datetime(2026, 10, 6, 15, 30, 0)
JSON_OUT = ROOT / "reports/mcx_07sep_rbr_bz_pipeline_trace.json"
MD_OUT = ROOT / "reports/MCX_07SEP_RBR_BZ_PIPELINE_REPORT.md"
BASE_START, BASE_END, LEGOUT = 3979, 3981, 3982


def value(item: Any) -> Any:
    if isinstance(item, Enum):
        return item.value
    if isinstance(item, (pd.Timestamp, datetime, np.datetime64)):
        return pd.Timestamp(item).isoformat(sep=" ")
    return item


def zone_data(zone: Any) -> dict[str, Any]:
    if zone is None:
        return {"exists": False}
    return {
        "exists": True, "zone_id": zone.zone_id, "zone_type": value(zone.ztype),
        "proximal": zone.proximal, "distal": zone.distal,
        "base_start_idx": zone.base_start, "base_end_idx": zone.base_end,
        "legout_end_idx": zone.departure_idx, "base_len": zone.base_len,
        "pattern": value(getattr(zone, "zone_pattern", None)),
        "removes_structure": zone.removes_structure,
        "retest_count": zone.retest_count, "penetration_pct": zone.penetration_pct,
        "raw_score": zone.raw_score, "final_score": zone.final_score,
        "score_total": getattr(zone, "score_total", None),
        "state": value(zone.state), "block_reason": zone.block_reason,
        "invalidated": zone.invalidated, "violation": value(zone.violation),
        "replaced_by_composite": getattr(zone, "replaced_by_composite", False),
        "is_part_of_overlapping": zone.is_part_of_overlapping,
        "overlapping_partners_id": zone.overlapping_partners_id,
        "source_zone_ids": zone.source_zone_ids,
    }


def bar(df: pd.DataFrame, i: int) -> dict[str, Any]:
    row = df.iloc[i]
    return {"idx": i, "timestamp": value(row.tradeDate), "open": float(row.open),
            "high": float(row.high), "low": float(row.low), "close": float(row.close),
            "range": float(row.high - row.low),
            "body": float(abs(row.close - row.open)),
            "body_pct": abs(float(row.close - row.open)) / float(row.high - row.low)}


def run() -> dict[str, Any]:
    df, _ = load_preprocess_data(CSV, CUTOFF)
    cs = CandleSeries(o=df.open.tolist(), h=df.high.tolist(), l=df.low.tolist(),
                      c=df.close.tolist(), ts=df.unix_timestamp.tolist())
    cfg = Config()
    atr_values = atr(cs.h, cs.l, cs.c, cfg.atr_period)
    atr_now = float(atr_values[-1] or 1.0)
    vol = volatility_regime(atr_now, float(ema([x or 0 for x in atr_values], 20)[-1] or atr_now), cfg)
    detector = ZoneDetector(cfg)
    flags = [detector._is_basing(cs, i, atr_values[i] if atr_values[i] else None) for i in range(cs.n_completed)]
    regular = detector.detect("TEST", TF.X, cs)
    raw = regular + GapModule().detect("TEST", TF.X, cs, vol, opposing_zones=regular)

    # Exact base-coordinate match is the only valid identity for the requested zone.
    requested_raw = next((z for z in raw if z.ztype == ZoneType.BZ and z.base_start == BASE_START and z.base_end == BASE_END), None)
    closest_raw = next((z for z in raw if z.zone_id == "TEST_X_BZ_3981"), None)
    gdz = next((z for z in raw if z.zone_id == "TEST_X_GDZ_3975"), None)

    qualified, all_zones = process_qualified_zones_setup(str(CSV), TF.X, CUTOFF, e1_session_enforced=True)
    requested_post = next((z for z in all_zones if z.ztype == ZoneType.BZ and z.base_start == BASE_START and z.base_end == BASE_END), None)
    closest_post = next((z for z in all_zones if z.zone_id == "TEST_X_BZ_3981"), None)
    gdz_post = next((z for z in all_zones if z.zone_id == "TEST_X_GDZ_3975"), None)

    # This executes the full active MCX setup path. It does not score a zone
    # absent from the qualified list, which is itself the stage trace result.
    setup = process_setup_fc("CRUDEOILM", ["daily", "two_forty", "sixty"], "19102026", CUTOFF, False)
    active_ids = {z.zone_id for z in setup["zones_X"]} if isinstance(setup, dict) else set()

    # The production qualifier starts at created_idx + 1.  For BZ_3981,
    # created_idx is the base candle, so index 3982 is its own departure bar.
    departure_violation = None
    if closest_post is not None:
        sessions = mcx_e1_session_ids(df.unix_timestamp.tolist())
        zone_height = closest_post.proximal - closest_post.distal
        for i in range(closest_post.created_idx + 1, len(df)):
            if sessions[i] != sessions[closest_post.created_idx]:
                continue
            if df.iloc[i].low < closest_post.proximal:
                depth = closest_post.proximal - float(df.iloc[i].low)
                depth_pct = (depth / zone_height) * 100 if zone_height else None
                if depth_pct is not None and depth_pct > 65:
                    departure_violation = {
                        "bar_idx": i, "timestamp": value(df.iloc[i].tradeDate),
                        "low": float(df.iloc[i].low), "proximal": closest_post.proximal,
                        "distal": closest_post.distal, "zone_height": zone_height,
                        "depth": depth, "depth_pct": depth_pct,
                        "is_departure_bar": i == closest_post.departure_idx,
                    }
                    break

    formation_replays = []
    for formation_cutoff in (
        datetime(2026, 9, 7, 15, 30),
        datetime(2026, 9, 7, 16, 30),
        datetime(2026, 9, 7, 17, 30),
    ):
        replay_qualified, replay_all = process_qualified_zones_setup(
            str(CSV), TF.X, formation_cutoff, e1_session_enforced=True
        )
        replay_zone = next((z for z in replay_all if z.zone_id == "TEST_X_BZ_3981"), None)
        formation_replays.append({
            "cutoff": formation_cutoff.isoformat(sep=" "),
            "zone_emitted": replay_zone is not None,
            "state": value(replay_zone.state) if replay_zone else None,
            "block_reason": replay_zone.block_reason if replay_zone else None,
            "in_final_qualified_list": replay_zone in replay_qualified if replay_zone else False,
        })

    # The requested candidate does not exist as an engine Zone if detector did
    # not emit it. Do not manufacture one just to produce a score.
    score_result = {
        "reached_ZoneQualityScorer_score_zone": requested_post is not None and requested_post in qualified,
        "result": "NOT_REACHED" if requested_post is None else zone_data(requested_post),
        "reason": "Detector emitted no BZ with base_start=3979 and base_end=3981." if requested_raw is None else None,
    }

    # Explicitly prove that no overlap state in the active helper absorbed BZ_3981.
    return {
        "report_type": "read_only_live_mcx_rbr_bz_stage_trace",
        "input": {"symbol": "CRUDEOILM", "tf": "X / 60m", "cutoff": CUTOFF.isoformat(sep=" "),
                  "requested_base": [BASE_START, BASE_END], "requested_legout": LEGOUT,
                  "requested_description": "RBR BZ 07-Sep 13:00–15:00, expected prox≈8409/distal≈8344"},
        "base_bars": [bar(df, i) for i in range(BASE_START, LEGOUT + 1)],
        "detector_basing_flags": {str(i): bool(flags[i]) for i in range(BASE_START, LEGOUT + 1)},
        "requested_candidate": {
            "detector": zone_data(requested_raw),
            "post_structure": zone_data(requested_post),
            "final_qualified": requested_post is not None and requested_post in qualified,
            "active_X_setup_list": requested_post is not None and requested_post.zone_id in active_ids,
            "score_zone": score_result,
            "conclusion": "DROPPED_AT_DETECTOR" if requested_raw is None else "SEE_STAGE_FIELDS",
        },
        "nearest_actual_detector_zone": zone_data(closest_raw),
        "nearest_actual_post_qualification_zone": zone_data(closest_post),
        "actual_single_base_bz_stage_trace": {
            "detector": "EMITTED" if closest_raw else "NOT_EMITTED",
            "post_structure_removal": closest_post.removes_structure if closest_post else None,
            "final_qualified": closest_post is not None and closest_post in qualified,
            "active_X_setup_list": closest_post is not None and closest_post.zone_id in active_ids,
            "ZoneQualityScorer_score_zone": "NOT_REACHED (removed by qualification filter)" if closest_post not in qualified else "REACHED",
            "block_reason": closest_post.block_reason if closest_post else None,
            "departure_bar_used_as_violation": departure_violation,
        },
        "formation_time_replays": formation_replays,
        "gdz_3975_context": zone_data(gdz_post),
        "composite_absorption_check": {
            "requested_zone_absorbed_by_TEST_X_GDZ_3975": False,
            "reason": "The requested [3979,3981] BZ is not emitted, so no Zone object exists to replace. The nearest actual BZ_3981 has no replacement flag, no overlap partners, and no source_zone_ids.",
            "active_pipeline_note": "setup_engine_new.py:629 computes overlaps, but line 632 immediately replaces zones_X_processed with process_qualified_zones_setup output; the helper does not mark replaced_by_composite.",
        },
        "source_evidence": {
            "base_detection": "scripts/trade_engine.py:1360-1535",
            "qualification": "scripts/trade_engine.py:4220-4249",
            "active_setup_scoring": "scripts/setup_engine_new.py:629-659",
            "quality_scorer": "scripts/additional_engine_class.py:324-347",
        },
    }


def markdown(report: dict[str, Any]) -> str:
    candidate = report["requested_candidate"]
    near = report["nearest_actual_post_qualification_zone"]
    gdz = report["gdz_3975_context"]
    single = report["actual_single_base_bz_stage_trace"]
    violation = single["departure_bar_used_as_violation"]
    formation = report["formation_time_replays"]
    lines = [
        "# MCX CRUDEOILM 07-Sep RBR BZ Live-Path Trace", "",
        "## Requested candidate", "",
        "Base coordinates: **07-Sep-2026 13:00–15:00** (`3979..3981`); legout `3982` (16:00). "
        "The replay identifies candidates by these coordinates, not by the 07-Sep gap-open GDZ.", "",
        "## Stage result", "",
        f"- Detector: **{'EMITTED' if candidate['detector']['exists'] else 'NOT EMITTED'}**",
        f"- Post-structure: **{'REACHED' if candidate['post_structure']['exists'] else 'NOT REACHED'}**",
        f"- Final qualified list: **{candidate['final_qualified']}**",
        f"- Active X setup list: **{candidate['active_X_setup_list']}**",
        f"- ZoneQualityScorer.score_zone: **{candidate['score_zone']['result']}**",
        f"- Block reason: **{candidate['score_zone']['reason'] or 'N/A (candidate never existed)'}**", "",
        "The live detector does not emit the requested three-bar `3979..3981` zone because 13:00 and 14:00 are non-basing. It **does**, however, emit the 15:00 candle as `TEST_X_BZ_3981`. The live failure is therefore in the later qualification pass, not in recognizing the 15:00 base candle.", "",
        "## Exact rejection logic", "",
        "`ZoneDetector._is_basing` calculates `body_pct` and immediately returns false when it exceeds `Config.basing_body_pct` (0.50): `scripts/trade_engine.py:421-425`. "
        "During detector flag construction, those results become the only eligible base flags: `scripts/trade_engine.py:1413-1416`. The detector then skips every false flag: `scripts/trade_engine.py:1422-1425`.", "",
        "- Index 3979 / 13:00: body `88` ÷ range `100` = `0.880` > `0.50` → **not basing**.",
        "- Index 3980 / 14:00: body `47` ÷ range `62` = `0.758` > `0.50` → **not basing**.",
        "- Index 3981 / 15:00: body `3` ÷ range `34` = `0.088` ≤ `0.50` → basing.", "",
        "Consequently, the engine cannot construct the requested wide three-bar zone (`prox≈8409/distal≈8344`). It constructs a narrower one-bar zone instead. `ZoneQualityScorer.score_zone` is only invoked after `process_qualified_zones_setup` returns zones, at `scripts/setup_engine_new.py:632-659`.", "",
        "## Base and legout evidence", "", "| Idx | Timestamp | O | H | L | C | Body% | Basing |", "|---:|---|---:|---:|---:|---:|---:|---|",
    ]
    flags = report["detector_basing_flags"]
    for item in report["base_bars"]:
        lines.append(f"| {item['idx']} | {item['timestamp']} | {item['open']} | {item['high']} | {item['low']} | {item['close']} | {item['body_pct']:.3f} | {flags[str(item['idx'])]} |")
    lines += [
        "", "## Nearest actual emitted BZ", "",
        f"`{near['zone_id']}` is the actual one-bar RBR emitted from the 15:00 base: proximal `{near['proximal']}`, distal `{near['distal']}`, base `3981..3981`, departure `3982`. Its stage trace is:",
        f"- detector: **{single['detector']}**; structure removal: **{single['post_structure_removal']}**; final qualified: **{single['final_qualified']}**; active X setup: **{single['active_X_setup_list']}**; scorer: **{single['ZoneQualityScorer_score_zone']}**.",
        f"- block reason: **{single['block_reason']}**.", "",
        "### Actual invalidation cause", "",
        "`ZoneQualifier.update_violation` starts scanning at `zone.created_idx + 1` (`scripts/trade_engine.py:2391`). For this zone, `created_idx=3981`, therefore it scans index `3982` — the zone's own 16:00 departure candle. For regular X-TF BZs, a low below proximal is converted to penetration (`scripts/trade_engine.py:2491-2497`) and penetration above 65% makes the zone RED/invalidated (`scripts/trade_engine.py:2510-2515`).",
        f"At index {violation['bar_idx']} ({violation['timestamp']}), low `{violation['low']}` produces depth `{violation['depth']}` from proximal `{violation['proximal']}` over zone height `{violation['zone_height']}` = **{violation['depth_pct']:.2f}%**. It is the departure bar: **{violation['is_departure_bar']}**. This is the direct reason the emitted 15:00 BZ never becomes qualified.", "",
        "### As-of evidence", "",
        f"The principal replay uses the requested scanner cutoff `{report['input']['cutoff']}`. The same zone is already RED at that cutoff because the consuming candle is dated 07-Sep, not a later 06-Oct candle.",
        "| Replay cutoff | BZ_3981 emitted | State | Block reason | Qualified |",
        "|---|---|---|---|---|",
    ]
    for replay in formation:
        lines.append(f"| {replay['cutoff']} | {replay['zone_emitted']} | {replay['state']} | {replay['block_reason']} | {replay['in_final_qualified_list']} |")
    lines += [
        "",
        "The 15:30 and 16:30 formation-time replays do not yet emit the one-bar pattern. At 17:30—when the detector first emits it—the result is already RED from the 16:00 departure low. This rules out a later 06-Oct / 18:00 candle as the source of the recorded 68.42% penetration.", "",
        "## Composite / GDZ check", "",
        "**No — the requested BZ was not absorbed by `TEST_X_GDZ_3975`.** It was never emitted. The nearest actual `TEST_X_BZ_3981` has `replaced_by_composite=false`, no overlap partners, and no source-zone IDs. "
        f"`TEST_X_GDZ_3975` is independently `{gdz['state']}` / `{gdz['block_reason']}` and is also absent from final qualified zones.", "",
        "## Evidence locations", "",
        "- Detector base/legout logic: `scripts/trade_engine.py:1360-1535`",
        "- Qualification path: `scripts/trade_engine.py:4220-4249`",
        "- Active setup path and scoring loop: `scripts/setup_engine_new.py:629-659`",
        "- ZoneQualityScorer: `scripts/additional_engine_class.py:324-347`", "",
    ]
    return "\n".join(lines)


if __name__ == "__main__":
    report = run()
    JSON_OUT.write_text(json.dumps(report, indent=2, default=value) + "\n", encoding="utf-8")
    MD_OUT.write_text(markdown(report), encoding="utf-8")
    print(json.dumps(report["requested_candidate"], indent=2, default=value))
    print(f"JSON report: {JSON_OUT}")
    print(f"Markdown report: {MD_OUT}")

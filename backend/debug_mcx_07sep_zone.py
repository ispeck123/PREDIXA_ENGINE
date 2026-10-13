#!/usr/bin/env python3
"""Read-only forensic replay for the CRUDEOILM 07-Sep-2026 60-minute GDZ.

This tool intentionally does not call the database, scanner persistence, OMS, or
broker code.  It replays the same CSV / setup-engine path used by the MCX
scanner and writes a JSON plus Markdown evidence report.  It is useful when a
zone is detected but is later absent from the qualified-zone list.

Example:
    PYTHONPATH=. python scripts/debug_mcx_07sep_zone.py
"""

from __future__ import annotations

import argparse
import copy
import json
import logging
from datetime import datetime
from enum import Enum
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from scripts.models import CandleSeries, Config, TF, load_preprocess_data
from scripts.setup_engine_new import process_setup_fc
from scripts.trade_engine import GapModule, ZoneDetector, ZoneRanker, atr, ema, volatility_regime


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CSV = ROOT / "data/indian_commodity_data/latest_data_csv/CRUDEOILM_19102026_sixty.csv"
DEFAULT_JSON = ROOT / "reports/mcx_07sep_zone_pipeline_report.json"
DEFAULT_MD = ROOT / "reports/MCX_07SEP_ZONE_PIPELINE_REPORT.md"


def _json_value(value: Any) -> Any:
    """Convert model values and pandas values to JSON-safe evidence values."""
    if isinstance(value, Enum):
        return value.value
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, (pd.Timestamp, datetime, np.datetime64)):
        return pd.Timestamp(value).isoformat(sep=" ")
    if hasattr(value, "value"):
        return value.value
    return str(value)


def _zone_fields(zone: Any) -> dict[str, Any]:
    """The requested post-pipeline row, preserving absent fields as null."""
    return {
        "zone_id": zone.zone_id,
        "zone_type": _json_value(zone.ztype),
        "timeframe": _json_value(zone.tf),
        "proximal": zone.proximal,
        "distal": zone.distal,
        "base_start_idx": zone.base_start,
        # Zone uses departure_idx rather than a separate legout_end_idx.
        "legout_end_idx": zone.departure_idx,
        "legout_end_idx_source": "Zone.departure_idx",
        "removes_structure": zone.removes_structure,
        "rr": getattr(zone, "rr", None),
        "rr_ratio": getattr(zone, "rr_ratio", None),
        "retest_count": zone.retest_count,
        "penetration_pct": zone.penetration_pct,
        "score_total": getattr(zone, "score_total", None),
        "raw_score": getattr(zone, "raw_score", None),
        "final_score": getattr(zone, "final_score", None),
        "final_weighted_score": getattr(zone, "final_weighted_score", None),
        "state": _json_value(zone.state),
        "block_reason": zone.block_reason,
        "invalidated": zone.invalidated,
        "violation": _json_value(zone.violation),
        "base_len": zone.base_len,
        "gap_composite_score": getattr(zone, "gap_composite_score", None),
        "gap_is_structural": getattr(zone, "gap_is_structural", None),
        "session_accepted": getattr(zone, "session_accepted", None),
    }


def _bar(df: pd.DataFrame, position: int) -> dict[str, Any]:
    row = df.iloc[position]
    return {
        "position": position,
        "source_index": int(row["index"]),
        "timestamp": _json_value(row["tradeDate"]),
        "open": float(row["open"]),
        "high": float(row["high"]),
        "low": float(row["low"]),
        "close": float(row["close"]),
    }


def _legacy_ranker_probe(zone: Any, result: dict[str, Any]) -> dict[str, Any]:
    """Prove the legacy ranker's configuration behavior without changing models."""
    cfg = Config()
    outcome: dict[str, Any] = {
        "cfg_class": f"{type(cfg).__module__}.{type(cfg).__name__}",
        "badzone_base_len_exists": hasattr(cfg, "badzone_base_len"),
        "rr_min_exists": hasattr(cfg, "rr_min"),
        "max_base_len": cfg.max_base_len,
        "min_rr": cfg.min_rr,
        "probe": "copy only; no source object or persisted data was modified",
    }
    # The actual zone is invalidated, therefore ZoneRanker's first hard gate
    # returns before it ever reads either missing cfg attribute.
    actual = copy.copy(zone)
    actual.replaced_by_composite = False
    ZoneRanker(cfg).score(actual, result["trend_context"], result["vol_regime_X"])
    outcome["actual_invalidated_zone_probe"] = {
        "result": "RETURNED_AT_INVALIDATION_GATE",
        "score_total": getattr(actual, "score_total", None),
        "block_reason": actual.block_reason,
    }

    # A second copy proves the cfg access independently.  It is not a trading
    # simulation: only the preceding invalidation gate is bypassed in memory.
    cfg_probe = copy.copy(zone)
    cfg_probe.replaced_by_composite = False
    cfg_probe.invalidated = False
    try:
        ZoneRanker(cfg).score(cfg_probe, result["trend_context"], result["vol_regime_X"])
        outcome["cfg_access_probe"] = {"result": "UNEXPECTED_SUCCESS"}
    except Exception as exc:  # Evidence capture: this is the condition under review.
        outcome["cfg_access_probe"] = {
            "result": "EXCEPTION",
            "exception_type": type(exc).__name__,
            "exception_message": str(exc),
        }
    return outcome


def run(csv_path: Path, cutoff: datetime, target_zone_id: str) -> dict[str, Any]:
    logging.info("Loading candle stream: %s; cutoff=%s", csv_path, cutoff)
    df, _ = load_preprocess_data(csv_path, cutoff)
    cs = CandleSeries(
        o=df["open"].tolist(), h=df["high"].tolist(), l=df["low"].tolist(),
        c=df["close"].tolist(), ts=df["unix_timestamp"].tolist(),
    )
    cfg = Config()
    atr_values = atr(cs.h, cs.l, cs.c, cfg.atr_period)
    atr_now = float(atr_values[-1] or 1.0)
    atr_average = float(ema([value or 0.0 for value in atr_values], 20)[-1] or atr_now)
    vol = volatility_regime(atr_now, atr_average, cfg)

    # Stage 1: exactly the raw detector and X-TF gap detector used by the
    # qualification helper before violation/retest processing.
    regular = ZoneDetector(cfg).detect("TEST", TF.X, cs)
    detected = list(regular)
    detected.extend(GapModule().detect("TEST", TF.X, cs, vol, opposing_zones=regular))
    raw_zone = next((zone for zone in detected if zone.zone_id == target_zone_id), None)
    if raw_zone is None:
        raise RuntimeError(f"Target zone {target_zone_id} was not detected in the replay")

    logging.info("Replaying active setup engine for post-qualification evidence")
    result = process_setup_fc(
        "CRUDEOILM", ["daily", "two_forty", "sixty"], "19102026", cutoff, False
    )
    if not isinstance(result, dict):
        raise RuntimeError(f"Setup engine returned: {result}")

    # process_setup_fc exposes qualified X zones only.  Replay the helper's
    # complete all-zones list separately, so an invalidated zone remains
    # inspectable rather than disappearing at its final filter.
    from scripts.trade_engine import process_qualified_zones_setup

    qualified, all_zones = process_qualified_zones_setup(
        str(csv_path), TF.X, cutoff, e1_session_enforced=True
    )
    post_zone = next((zone for zone in all_zones if zone.zone_id == target_zone_id), None)
    if post_zone is None:
        raise RuntimeError(f"Target zone {target_zone_id} disappeared before qualification evidence")

    live_qualified = next((zone for zone in result["zones_X"] if zone.zone_id == target_zone_id), None)
    base_window = [_bar(df, index) for index in range(post_zone.base_start, post_zone.departure_idx + 1)]
    report = {
        "report_type": "read_only_mcx_zone_pipeline_replay",
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "input": {
            "symbol": "CRUDEOILM", "timeframe": "X / 60m", "expiry": "19102026",
            "csv": str(csv_path.relative_to(ROOT)), "cutoff": cutoff.isoformat(sep=" "),
            "target_zone_id": target_zone_id,
        },
        "post_pipeline_14_field_row": _zone_fields(post_zone),
        "detected_before_qualification": _zone_fields(raw_zone),
        "qualification_outcome": {
            "present_in_all_detected_and_qualified_zones": True,
            "present_in_final_qualified_zones": any(zone.zone_id == target_zone_id for zone in qualified),
            "present_in_active_setup_engine_zones_X": live_qualified is not None,
            "final_filter": "state != RED and 0.0 <= penetration_pct <= 50 for TF.X",
            "rejection": post_zone.block_reason,
        },
        "construction_bars": base_window,
        "legacy_zone_ranker_configuration_probe": _legacy_ranker_probe(post_zone, result),
        "active_mcx_scoring": {
            "pipeline": "setup_engine_new.SDEnginePipeline -> ZoneQualityScorer.score_zone",
            "zone_ranker_used": False,
            "source": "scripts/setup_engine_new.py:632-659",
            "score_total_interpretation": "Not populated by the active MCX pipeline; final_score is the active score field.",
        },
        "source_evidence": {
            "raw_detection": "scripts/trade_engine.py:4204-4209",
            "violation_retest_and_structure": "scripts/trade_engine.py:4220-4230",
            "qualified_filter": "scripts/trade_engine.py:4241-4249",
            "active_mcx_scoring": "scripts/setup_engine_new.py:632-659",
            "legacy_ranker_cfg": "scripts/trade_engine.py:3249-3287 and 3492-3498",
            "base_config": "scripts/models.py:383-440",
        },
    }
    return report


def markdown(report: dict[str, Any]) -> str:
    row = report["post_pipeline_14_field_row"]
    cfg = report["legacy_zone_ranker_configuration_probe"]
    bars = report["construction_bars"]
    lines = [
        "# MCX CRUDEOILM 07-Sep Zone Pipeline Replay",
        "",
        "## Scope",
        "",
        "Read-only replay. No scanner, database, OMS, broker, or production logic was changed.",
        "",
        "## Requested post-pipeline row",
        "",
        "| Field | Value |",
        "|---|---:|",
    ]
    for field in ("zone_id", "zone_type", "timeframe", "proximal", "distal", "base_start_idx",
                  "legout_end_idx", "removes_structure", "rr", "retest_count", "penetration_pct",
                  "score_total", "state", "block_reason"):
        lines.append(f"| {field} | {row.get(field)} |")
    lines += [
        "",
        "`legout_end_idx` is represented by the model field `departure_idx`. `score_total` and `rr` are not populated by the active MCX setup path; its active equivalents are "
        f"`final_score={row['final_score']}` and `rr_ratio={row['rr_ratio']}`.",
        "",
        "## Pipeline result",
        "",
        f"The raw detector found the GDZ, with `removes_structure={report['detected_before_qualification']['removes_structure']}`. "
        f"After violation/retest processing it is `{row['state']}` and is rejected with `{row['block_reason']}`. "
        "It is absent from both the final qualified list and active setup-engine X-zone list.",
        "",
        "## Construction window",
        "",
        "| Pos | Timestamp | Open | High | Low | Close |",
        "|---:|---|---:|---:|---:|---:|",
    ]
    for bar in bars:
        lines.append("| {position} | {timestamp} | {open} | {high} | {low} | {close} |".format(**bar))
    lines += [
        "",
        "## ZoneRanker configuration check",
        "",
        f"The active MCX scanner does **not** invoke `ZoneRanker.score`; it uses `ZoneQualityScorer.score_zone`. "
        f"The legacy `trade_engine.SDEnginePipeline` constructs ZoneRanker with `{cfg['cfg_class']}`. "
        f"That object has `badzone_base_len={cfg['badzone_base_len_exists']}` and `rr_min={cfg['rr_min_exists']}`; "
        f"it instead exposes `max_base_len={cfg['max_base_len']}` and `min_rr={cfg['min_rr']}`. "
        f"For this already-invalidated zone, the first ZoneRanker hard gate returns `"
        f"{cfg['actual_invalidated_zone_probe']['block_reason']}` before reading configuration. "
        f"A copy with only that preceding gate bypassed fails at the configuration access: `"
        f"{cfg['cfg_access_probe']['exception_type']}: {cfg['cfg_access_probe']['exception_message']}`.",
        "",
        "## Source evidence",
        "",
        "- Detection: `scripts/trade_engine.py:4204-4209`",
        "- Violation, retest and structure pass: `scripts/trade_engine.py:4220-4230`",
        "- Final qualified-zone filter: `scripts/trade_engine.py:4241-4249`",
        "- Active MCX setup scoring: `scripts/setup_engine_new.py:632-659`",
        "- Legacy ZoneRanker gates: `scripts/trade_engine.py:3249-3287`",
        "- Legacy ZoneRanker construction: `scripts/trade_engine.py:3492-3498`",
        "- Base Config thresholds: `scripts/models.py:383-440`",
        "",
    ]
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--csv", type=Path, default=DEFAULT_CSV)
    parser.add_argument("--cutoff", default="2026-10-06 15:43:53")
    parser.add_argument("--zone-id", default="TEST_X_GDZ_3975")
    parser.add_argument("--json-out", type=Path, default=DEFAULT_JSON)
    parser.add_argument("--report-out", type=Path, default=DEFAULT_MD)
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    cutoff = datetime.fromisoformat(args.cutoff)
    report = run(args.csv.resolve(), cutoff, args.zone_id)
    args.json_out.parent.mkdir(parents=True, exist_ok=True)
    args.json_out.write_text(json.dumps(report, indent=2, default=_json_value) + "\n", encoding="utf-8")
    args.report_out.write_text(markdown(report), encoding="utf-8")
    print(json.dumps(report["post_pipeline_14_field_row"], indent=2, default=_json_value))
    print(f"JSON report: {args.json_out}")
    print(f"Markdown report: {args.report_out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

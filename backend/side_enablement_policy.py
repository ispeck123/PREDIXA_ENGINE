"""
side_enablement_policy.py — Phase-0 single source of truth for (segment, side) enablement.

Replaces the two legacy, inconsistent mechanisms (`ENABLE_FC_SELL` for futures/commodity
and `CASH_SHORT_TFS` for cash) with one coherent, fail-closed policy.

Design (SOLID):
  - SRP : this object's only job is side x segment enablement.
  - OCP : add/enable a segment via config, no engine edits.
  - DIP : the engine depends on `is_enabled(...)`, never on raw flags.

Security / fail-safe:
  - SHORT is DEFAULT-OFF for every segment, including unknown segments and empty config.
  - Shorts can only be enabled by an explicit, reviewed, audited config change that has
    passed the Phase-2 acceptance bar (net-of-cost >= +0.10R, holdout + shadow).
  - A missing or malformed config can never enable a short.
"""
from enum import Enum
from typing import Optional, Dict


class Side(str, Enum):
    LONG = "LONG"
    SHORT = "SHORT"


# Canonical default policy. LONG enabled (long-only v1 product); SHORT fail-closed everywhere.
# DO NOT flip a SHORT to True here without recording the Phase-2 acceptance evidence + sign-off.
_DEFAULT_POLICY: Dict[str, Dict[str, bool]] = {
    # v1 = long-only across ALL segments. Deployed repo had SHORT:True (veto NOT enforced) — a live
    # defect: the scanner could emit shorts. Corrected to fail-closed. Short admission is POST-SUNSET
    # (2026-12-31), acceptance = holdout+shadow, NOT backtest. The futures-short backtest evidence
    # (+0.35R) is filed to the short-rework dossier; it does NOT authorise flipping these to True.
    "NSE_CASH": {"LONG": True, "SHORT": False},   # also legal: no overnight cash short in India
    "NSE_FO":   {"LONG": True, "SHORT": False},
    "NSEFO":    {"LONG": True, "SHORT": False},
    "MCX":      {"LONG": True, "SHORT": False},
}


class SideEnablementPolicy:
    """Fail-closed policy for whether a (segment, side) may emit a setup/order."""

    def __init__(self, config: Optional[Dict[str, Dict[str, bool]]] = None):
        # config is None -> canonical default; explicit {} -> still fail-closed on SHORT.
        self._config = config if config is not None else _DEFAULT_POLICY

    def is_enabled(self, segment: str, side) -> bool:
        side = side if isinstance(side, Side) else Side(str(side).upper())
        entry = self._config.get((segment or "").upper(), {})
        if side == Side.LONG:
            return bool(entry.get("LONG", True))      # long-only product: default True
        return bool(entry.get("SHORT", False))         # SHORT fail-closed: default False


# Module-level singleton the engine consults.
SIDE_POLICY = SideEnablementPolicy()


def resolve_segment(segment: Optional[str] = None,
                    is_cash: Optional[bool] = None,
                    is_future: Optional[bool] = None) -> str:
    """Map run() routing flags to a canonical segment key."""
    if is_cash is True:
        return "NSE_CASH"
    if segment:
        return str(segment).upper()
    if is_future is True:
        return "NSEFO"
    return "MCX"

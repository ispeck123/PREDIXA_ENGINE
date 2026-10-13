"""
PREDIXA — Exchange-specific TF / regime gate
============================================
Drop-in, config-driven permission gate applied in the setup/permission layer
BEFORE a setup is emitted. Decides, per (exchange, strategy_tf, e_regime,
a_regime), whether to trade and at what size.

WHY exchange-specific:
  - The TF *set itself differs by exchange*. NSE cash / stock-futures use one
    strategy_tf enum; MCX commodities use a DIFFERENT stack (e.g. D-240-60).
    So a TF index means different things across exchanges — never share a list.
  - Regime edge is asset-class-specific (cross-asset study, 12-Oct-2026):
    equities favour with-trend / dip-buy, NOT sideways; commodities favour SW.
    So permit/deny cells must be derived per segment from that segment's own
    per-cell backtest — not copied across.

STATUS:
  - NSE_CASH : POPULATED from CASH_2Y_BACKTEST net-of-cost per-cell R (delivery).
  - MCX      : PENDING its own futures per-cell backtest -> fail-open (PERMIT_ALL).
  - NSEFO    : PENDING its own futures per-cell backtest -> fail-open (PERMIT_ALL).

Fail-open by design: an unconfigured/pending segment is NOT blocked (the gate is
additive; it only filters where we have data). Flip `default` to "DENY" per
segment once its backtest lands.
"""

from dataclasses import dataclass, field
from typing import Optional

# tier -> position-size multiplier
SIZE = {"CORE": 1.0, "MARGINAL": 0.5, "PERMIT": 1.0, "DENY": 0.0}


@dataclass
class ExchangeGate:
    tf_set: tuple                 # strategy_tf values valid for THIS exchange
    excluded_tfs: frozenset       # TFs net-negative in every regime -> always deny
    permit_cells: dict            # (e_regime, a_regime, strategy_tf) -> "CORE"|"MARGINAL"
    default: str = "DENY"         # for cells not excluded and not in permit_cells
    source: str = ""
    notes: str = ""


TF_REGIME_GATE = {
    # ---------------------------------------------------------------- NSE CASH
    # Source: CASH_2Y_BACKTEST_TRACKING_CELL_EVIDENCE, net of delivery cost
    # (STT 0.2% RT on ~1.5% stops => ~0.14R). tf1 net -0.36R in EVERY regime.
    # BUY-only engine. Cells not listed are DENY.
    "NSE_CASH": ExchangeGate(
        tf_set=(1, 2, 5, 6, 25),
        excluded_tfs=frozenset({1}),
        permit_cells={
            ("SW", "SW", 2): "CORE",  ("SW", "SW", 6): "CORE",  ("SW", "SW", 25): "CORE",
            ("SW", "UP", 2): "CORE",  ("SW", "UP", 6): "CORE",
            ("UP", "UP", 2): "CORE",  ("UP", "UP", 5): "CORE",
            # positive net mean but fat-tail-dependent -> half size, monitor
            ("UP", "SW", 2): "MARGINAL", ("UP", "SW", 5): "MARGINAL",
            ("UP", "UP", 25): "MARGINAL",
        },
        default="DENY",
        source="CASH_2Y_BACKTEST net-of-cost per-cell R (delivery, STT 0.2%)",
        notes="Equity segment: SW/SW best NET in-engine (zone-quality driven); "
              "generic cross-asset study says equities do NOT favour SW, so do "
              "not extend SW-bias to MCX. tf1 excluded globally.",
    ),

    # ------------------------------------------------------------------- MCX
    # TODO: MCX uses a DIFFERENT strategy_tf stack than equities — fill tf_set
    # from the MCX strategy config, and populate permit_cells from the MCX
    # futures per-cell backtest (not yet run). Futures friction ~0.016R, so the
    # haircut is tiny — expect a MORE permissive gate than cash.
    "MCX": ExchangeGate(
        # COMMODITY_TIME_FRAME_4 = [daily, two_forty, sixty].  This is the
        # live MCX D-240-60 stack; it is deliberately not an equity TF list.
        tf_set=(4,),
        excluded_tfs=frozenset(),          # TODO: from MCX backtest
        permit_cells={},                   # TODO: from MCX backtest
        default="PERMIT_ALL",              # fail-open until data lands
        source="PENDING MCX futures per-cell backtest",
        notes="Commodity segment: cross-asset study supports SW-favoured S/D here. "
              "Do NOT reuse NSE_CASH TF indices.",
    ),

    # ------------------------------------------------------------------ NSEFO
    "NSEFO": ExchangeGate(
        tf_set=(),                         # TODO: stock-futures tf enum
        excluded_tfs=frozenset(),          # TODO: from NSEFO backtest
        permit_cells={},
        default="PERMIT_ALL",              # fail-open until data lands
        source="PENDING NSEFO futures per-cell backtest",
        notes="Equity-derivative: expect with-trend/dip-buy > SW (equity long bias).",
    ),
}


def gate(exchange: str, strategy_tf, e_regime: Optional[str] = None,
         a_regime: Optional[str] = None):
    """
    Returns (tier, size_mult, reason).
      tier     : "CORE" | "MARGINAL" | "PERMIT" | "DENY"
      size_mult: position-size multiplier (0.0 means do not trade)
    Call in the permission layer before emitting a setup; drop the setup if
    size_mult == 0, else scale size by size_mult.
    """
    cfg = TF_REGIME_GATE.get(exchange)
    if cfg is None:
        return ("PERMIT", 1.0, f"unconfigured exchange '{exchange}' -> fail-open")

    if cfg.tf_set and strategy_tf not in cfg.tf_set:
        # TF index not valid for this exchange — almost always a wiring bug.
        return ("PERMIT", 1.0, f"tf {strategy_tf} not in {exchange} tf_set -> fail-open (check wiring)")

    if strategy_tf in cfg.excluded_tfs:
        return ("DENY", 0.0, f"tf {strategy_tf} excluded on {exchange} (net-negative all regimes)")

    tier = cfg.permit_cells.get((e_regime, a_regime, strategy_tf))
    if tier:
        return (tier, SIZE[tier], f"{exchange} {e_regime}/{a_regime}/tf{strategy_tf} = {tier}")

    if cfg.default == "PERMIT_ALL":
        return ("PERMIT", 1.0, f"{exchange} gate pending backtest -> fail-open")
    return ("DENY", 0.0, f"{exchange} {e_regime}/{a_regime}/tf{strategy_tf} not in permit set")


# ---------------------------------------------------------------------------
# INTEGRATION
# ---------------------------------------------------------------------------
# In the permission/scoring layer, where a setup's permission_state is finalised:
#
#     tier, size_mult, reason = gate(exchange, strategy_tf, e_regime, a_regime)
#     if size_mult == 0.0:
#         skip_setup(reason)            # do not emit
#     else:
#         setup.size *= size_mult       # CORE=full, MARGINAL=half
#         setup.gate_tier = tier
#         setup.gate_reason = reason    # for the tracking-cell audit trail
#
# NOTES
# - `exchange` must be the segment key ("NSE_CASH" | "MCX" | "NSEFO"), derived
#   from the instrument/segment, NOT guessed from the symbol.
# - To activate MCX/NSEFO: fill tf_set + permit_cells from each segment's own
#   per-cell futures backtest, then flip `default` to "DENY".
# - Keep this the SINGLE source of truth for TF/regime gating across segments.

if __name__ == "__main__":
    for ex, tf, e, a in [("NSE_CASH", 1, "SW", "SW"), ("NSE_CASH", 2, "SW", "SW"),
                         ("NSE_CASH", 2, "UP", "SW"), ("NSE_CASH", 25, "UP", "SW"),
                         ("MCX", 60, "SW", "SW"), ("NSEFO", 2, "UP", "UP")]:
        print(f"{ex:9} tf{tf:<3} {e}/{a} -> {gate(ex, tf, e, a)}")

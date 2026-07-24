"""
PREDIXA 4.0 — Position Sizing, Capital Allocation & Trade Arbitration.

Deterministic, config-driven, zero human intervention at runtime. The only human
action is setting the config (equity, per-segment risk%/caps, portfolio caps).

Design (SOLID):
  - PositionSizer    : pure (setup, policy) -> Position. Fixed-fractional on
                       |entry-stop|*(1+slip), lot-rounded, notional-capped.
  - CapitalAllocator : owns segment exposure ceilings + the net-viability guardrail
                       (cannot fund a net-negative segment; flags sub-bar ones).
  - TradeArbitrator  : ranks candidates (swappable RankingPolicy) and admits top-down
                       under portfolio caps; emits a full auditable decision log.

Evidence guardrail uses measured net-of-cost expectancy at 10L sizing:
  NSEFO +0.27R, NSE_CASH +0.08R, MCX -0.18R.
"""
from __future__ import annotations
from dataclasses import dataclass, field
from typing import Protocol, Sequence
import math

SLIPPAGE = 0.0005  # SL-leg slippage buffer baked into per-unit risk (limit entry/target)

# Measured net-of-cost expectancy per segment (from BACKTEST-NET @ 10L). Single source.
SEGMENT_NET_R = {"NSEFO": 0.27, "NSE_CASH": 0.08, "MCX": -0.18}


# ----------------------------------------------------------------------------- config
@dataclass(frozen=True)
class SegmentPolicy:
    enabled: bool
    risk_pct: float          # % of total equity risked per trade
    max_concurrent: int
    exposure_cap: float      # max margin (futures) / capital (cash) deployed, rupees
    notional_cap: float      # max notional per single position, rupees
    margin_pct: float        # margin as fraction of notional (1.0 = unleveraged cash)
    min_net_R: float = 0.10  # viability bar for the guardrail


@dataclass(frozen=True)
class PortfolioPolicy:
    total_equity: float
    max_open_risk_pct: float   # % of equity across all open positions
    max_concurrent: int
    per_sector_cap: int
    reserve_pct: float         # min free-margin reserve (% of equity)


@dataclass(frozen=True)
class Setup:
    symbol: str
    segment: str
    entry: float
    stop: float
    target: float
    zone_score: float
    rr: float
    sector: str
    lot_size: int = 1          # 1 = divisible (cash); >1 = futures/commodity lot


@dataclass(frozen=True)
class Position:
    setup: Setup
    qty: int
    risk_rupees: float
    notional: float
    margin: float


# ------------------------------------------------------------------------- sizing
class PositionSizer:
    def __init__(self, portfolio: PortfolioPolicy, segments: dict[str, SegmentPolicy]):
        self.portfolio = portfolio
        self.segments = segments

    def size(self, s: Setup) -> Position | None:
        pol = self.segments[s.segment]
        per_unit_risk = abs(s.entry - s.stop) * (1 + SLIPPAGE)
        if per_unit_risk <= 0:
            return None
        risk_budget = pol.risk_pct / 100.0 * self.portfolio.total_equity
        raw_qty = risk_budget / per_unit_risk
        lot = max(1, s.lot_size)
        qty = int(math.floor(raw_qty / lot) * lot)
        if qty <= 0:
            return None  # one lot already exceeds the risk budget -> cannot size cleanly
        # notional cap (lot-aware)
        if qty * s.entry > pol.notional_cap:
            qty = int(math.floor(pol.notional_cap / s.entry / lot) * lot)
        if qty <= 0:
            return None
        notional = qty * s.entry
        return Position(setup=s, qty=qty, risk_rupees=qty * per_unit_risk,
                        notional=notional, margin=notional * pol.margin_pct)


# --------------------------------------------------------------------- allocation
class CapitalAllocator:
    """Owns segment exposure ceilings + the net-viability guardrail."""
    def __init__(self, portfolio: PortfolioPolicy, segments: dict[str, SegmentPolicy]):
        self.portfolio = portfolio
        self.segments = segments

    def segment_status(self, segment: str) -> str:
        pol = self.segments[segment]
        net = SEGMENT_NET_R.get(segment, -999)
        if not pol.enabled or net < 0:
            return "BLOCKED"          # gated or net-negative -> never funded
        if net < pol.min_net_R:
            return "PROVISIONAL"      # positive but sub-bar -> allowed, flagged
        return "ACTIVE"

    def exposure_ok(self, segment: str, add_margin: float, segment_margin_used: float) -> bool:
        return (segment_margin_used + add_margin) <= self.segments[segment].exposure_cap

    def reserve_ok(self, total_margin_after: float) -> bool:
        free = self.portfolio.total_equity - total_margin_after
        return free >= self.portfolio.reserve_pct / 100.0 * self.portfolio.total_equity


# ----------------------------------------------------------------------- ranking
class RankingPolicy(Protocol):
    def key(self, s: Setup) -> tuple: ...

class ScoreRanking:
    """v1: zone_score desc, RR desc, symbol asc — fully deterministic total order."""
    def key(self, s: Setup) -> tuple:
        return (-s.zone_score, -s.rr, s.symbol)

class EVRanking:
    """v2 (needs calibrated win-prob): net expected-R desc. Placeholder hook."""
    def __init__(self, win_prob_fn):
        self.win_prob_fn = win_prob_fn
    def key(self, s: Setup) -> tuple:
        p = self.win_prob_fn(s)
        ev = p * s.rr - (1 - p)
        return (-ev, -s.zone_score, s.symbol)


# -------------------------------------------------------------------- arbitration
@dataclass
class Decision:
    setup: Setup
    admitted: bool
    qty: int = 0
    reason: str = ""

class TradeArbitrator:
    def __init__(self, portfolio, segments, sizer: PositionSizer,
                 allocator: CapitalAllocator, ranking: RankingPolicy):
        self.portfolio = portfolio
        self.segments = segments
        self.sizer = sizer
        self.allocator = allocator
        self.ranking = ranking

    def arbitrate(self, candidates: Sequence[Setup],
                  open_positions: Sequence[Position] = ()) -> list[Decision]:
        # running state from already-open positions
        open_risk = sum(p.risk_rupees for p in open_positions)
        total_margin = sum(p.margin for p in open_positions)
        seg_count = {k: 0 for k in self.segments}
        seg_margin = {k: 0.0 for k in self.segments}
        sector_count: dict[str, int] = {}
        n_open = len(open_positions)
        for p in open_positions:
            seg_count[p.setup.segment] += 1
            seg_margin[p.setup.segment] += p.margin
            sector_count[p.setup.sector] = sector_count.get(p.setup.sector, 0) + 1

        max_risk = self.portfolio.max_open_risk_pct / 100.0 * self.portfolio.total_equity
        decisions: list[Decision] = []
        ranked = sorted(candidates, key=self.ranking.key)  # deterministic

        for s in ranked:
            status = self.allocator.segment_status(s.segment)
            if status == "BLOCKED":
                decisions.append(Decision(s, False, reason=f"segment {s.segment} BLOCKED"))
                continue
            pol = self.segments[s.segment]
            if n_open >= self.portfolio.max_concurrent:
                decisions.append(Decision(s, False, reason="portfolio max_concurrent"))
                continue
            if seg_count[s.segment] >= pol.max_concurrent:
                decisions.append(Decision(s, False, reason=f"{s.segment} max_concurrent"))
                continue
            if sector_count.get(s.sector, 0) >= self.portfolio.per_sector_cap:
                decisions.append(Decision(s, False, reason=f"sector {s.sector} cap"))
                continue
            pos = self.sizer.size(s)
            if pos is None:
                decisions.append(Decision(s, False, reason="unsizeable (1 lot > budget / notional)"))
                continue
            if open_risk + pos.risk_rupees > max_risk:
                decisions.append(Decision(s, False, reason="portfolio open-risk cap"))
                continue
            if not self.allocator.exposure_ok(s.segment, pos.margin, seg_margin[s.segment]):
                decisions.append(Decision(s, False, reason=f"{s.segment} exposure cap"))
                continue
            if not self.allocator.reserve_ok(total_margin + pos.margin):
                decisions.append(Decision(s, False, reason="free-margin reserve"))
                continue
            # admit
            flag = " (PROVISIONAL)" if status == "PROVISIONAL" else ""
            decisions.append(Decision(s, True, qty=pos.qty, reason=f"admitted{flag}"))
            open_risk += pos.risk_rupees
            total_margin += pos.margin
            seg_count[s.segment] += 1
            seg_margin[s.segment] += pos.margin
            sector_count[s.sector] = sector_count.get(s.sector, 0) + 1
            n_open += 1
        return decisions


# ------------------------------------------------------------------ 10L default config
def default_config_10L() -> tuple[PortfolioPolicy, dict[str, SegmentPolicy]]:
    portfolio = PortfolioPolicy(total_equity=1_000_000, max_open_risk_pct=5.0,
                                max_concurrent=4, per_sector_cap=2, reserve_pct=20.0)
    segments = {
        "NSEFO":    SegmentPolicy(True, 1.5, 3, 600_000, 1_200_000, margin_pct=0.18),
        "NSE_CASH": SegmentPolicy(True, 1.0, 2, 300_000,   600_000, margin_pct=1.00),
        "MCX":      SegmentPolicy(False, 1.5, 0,      0,         0, margin_pct=0.16),
    }
    return portfolio, segments

"""MCX proving policy.

The weights in this module are deliberately an eligibility switch during the
single-lot proving phase.  They must not be used as a quantity multiplier.
"""
from __future__ import annotations

MCX_UNDERLYING_CAP = {"GOLD": 1.0, "CRUDE": 1.0, "SILVER": 0.3, "NATGAS": 0.0}
MCX_CELL_WEIGHT = {
    ("SW", "SW", "4"): 1.0,
    ("UP", "SW", "4"): 1.0,
    ("UP", "SW", "3"): 0.3,
    ("SW", "UP", "4"): 0.3,
}
_MCX_SYMBOL_TO_UNDERLYING = {
    "GOLDM": "GOLD", "GOLDGUINEA": "GOLD", "CRUDEOILM": "CRUDE",
    "SILVER": "SILVER", "SILVERM": "SILVER", "NATGASMINI": "NATGAS",
}

# Signals stay on GOLDM; execution is deliberately reduced to the guinea lot.
MCX_EXECUTION_SYMBOL = {"GOLDM": "GOLDGUINEA", "CRUDEOILM": "CRUDEOILM"}
MCX_FIRE_CELLS = {("SW", "SW", "4"), ("UP", "SW", "4")}


def mcx_underlying(symbol: str) -> str | None:
    return _MCX_SYMBOL_TO_UNDERLYING.get(str(symbol).split("@", 1)[0].upper())


def mcx_weight(symbol, e_regime, a_regime, strategy_tf) -> float:
    """Return the provisional MCX eligibility weight, or zero to suppress."""
    underlying = mcx_underlying(symbol)
    if underlying is None:
        return 0.0
    key = (str(e_regime).upper(), str(a_regime).upper(), str(strategy_tf))
    if underlying == "SILVER" and key != ("UP", "SW", "3"):
        return 0.0
    return MCX_UNDERLYING_CAP.get(underlying, 0.0) * MCX_CELL_WEIGHT.get(key, 0.0)


def mcx_disposition(symbol, e_regime, a_regime, strategy_tf) -> tuple[str, float, str | None]:
    """Classify a long setup as FIRE, OBSERVE, or EXCLUDED.

    FIRE is intentionally narrower than positive weight.  OBSERVE cells are
    reviewable OMS candidates, but are never broker-submitted by the scanner.
    """
    weight = mcx_weight(symbol, e_regime, a_regime, strategy_tf)
    key = (str(e_regime).upper(), str(a_regime).upper(), str(strategy_tf))
    source = str(symbol).split("@", 1)[0].upper()
    if weight <= 0:
        return "EXCLUDED", 0.0, None
    if source in MCX_EXECUTION_SYMBOL and key in MCX_FIRE_CELLS:
        return "FIRE", weight, MCX_EXECUTION_SYMBOL[source]
    # Keep an observe setup on its source contract.  Gold is the only source
    # whose execution contract differs from its signal contract.
    return "OBSERVE", weight, MCX_EXECUTION_SYMBOL.get(source, source)

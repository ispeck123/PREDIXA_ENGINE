"""
MFE/MAE computation for B-W-EMBED tuning (task T2). PURE MECHANICAL — no chart eyeballing.

MFE (Max Favorable Excursion) = furthest price moved TOWARD target before the trade closed, in R.
MAE (Max Adverse Excursion)   = furthest price moved TOWARD/PAST stop before the trade closed, in R.

R = |entry - stop|.  A trade "gave back" if it was a loser with MFE >= 1.0 (ran +1R then reversed).
A trade "wicked out" if it was a winner with MAE > 1.0 (breached the stop level, survived, then hit target).

INPUTS you already have per backtest trade:
  entry, stop  : the entry and stoploss prices
  side         : 'BUY' or 'SELL'
  bars         : the exec-TF OHLC bars BETWEEN fill and completion (inclusive), each with .high/.low
                 — the SAME bars the backtest already replays to decide win/loss.

This is meant to be called inside the existing fill->completion replay loop; it adds two running
values, nothing more. No extra data load, no manual step.
"""

def mfe_mae_in_R(entry, stop, side, bar_highs, bar_lows):
    """Return (mfe_R, mae_R). bar_highs/bar_lows are the highs/lows of bars from fill to completion."""
    risk = abs(entry - stop)
    if risk <= 0 or not bar_highs:
        return 0.0, 0.0
    hi = max(bar_highs)
    lo = min(bar_lows)
    if side == 'BUY':
        mfe = (hi - entry) / risk     # favorable = up
        mae = (entry - lo) / risk     # adverse   = down toward stop
    else:  # SELL
        mfe = (entry - lo) / risk     # favorable = down
        mae = (hi - entry) / risk     # adverse   = up toward stop
    return round(mfe, 3), round(mae, 3)


def classify_trade(win, mfe_R, mae_R):
    """Return the two B-W-EMBED metrics flags for this trade."""
    give_back = (not win) and (mfe_R >= 1.0)   # loser that first ran >=1R toward target
    wick_out  = win and (mae_R > 1.0)          # winner that breached the stop before target
    return give_back, wick_out


# ── Aggregate over a trade list to produce the M1/M2 the tuning protocol needs ──
def summarize(trades):
    """
    trades: iterable of dicts with keys entry, stop, side ('BUY'/'SELL'), win (bool),
            bar_highs (list), bar_lows (list).
    Returns dict with n, win_rate, M1_give_back_rate (of losers), M2_wick_out_rate (of winners).
    """
    n = 0; wins = 0; losers = 0; give_backs = 0; wick_outs = 0
    for t in trades:
        mfe, mae = mfe_mae_in_R(t['entry'], t['stop'], t['side'], t['bar_highs'], t['bar_lows'])
        gb, wo = classify_trade(t['win'], mfe, mae)
        n += 1
        if t['win']:
            wins += 1
            if wo: wick_outs += 1
        else:
            losers += 1
            if gb: give_backs += 1
    return {
        'n': n,
        'win_rate': round(wins / n, 4) if n else 0.0,
        'M1_give_back_rate': round(give_backs / losers, 4) if losers else 0.0,   # of losers
        'M2_wick_out_rate':  round(wick_outs / wins, 4) if wins else 0.0,        # of winners
    }

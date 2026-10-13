"""MCX E1 session-boundary helpers.

E1 is a zone-engine rule, not a generic timestamp-gap heuristic.  It only
marks the MCX 23:30 IST close -> 09:00 IST open seam; weekends and ordinary
missing bars are not silently reclassified as session seams.
"""
from __future__ import annotations

from datetime import datetime, time
from zoneinfo import ZoneInfo

IST = ZoneInfo("Asia/Kolkata")

def mcx_e1_session_ids(timestamps) -> list[int] | None:
    """Return contiguous E1 session ids, or ``None`` when no seam exists.

    ``timestamps`` may be Unix seconds, pandas timestamps, or datetimes.  The
    first bar of each 09:00 session after a prior 23:30-or-later bar starts a
    new id.  Daily/weekly/monthly data therefore remains one uninterrupted
    series, which is essential for HTF structural context.
    """
    if not timestamps:
        return None
    values = []
    for value in timestamps:
        try:
            if isinstance(value, (int, float)):
                # FIX 1: unix_timestamp encodes IST-wall-clock as a UTC epoch; invert
                # the SAME way (utc) to recover the true wall clock, else a +5:30
                # double-shift makes the 18:00 bar look like 23:30 (false seam).
                dt = datetime.utcfromtimestamp(value).replace(tzinfo=IST)
            else:
                # pandas.Timestamp supports to_pydatetime; normal datetime is
                # handled directly without introducing pandas into production.
                dt = value.to_pydatetime() if hasattr(value, "to_pydatetime") else value
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=IST)
                else:
                    dt = dt.astimezone(IST)
            values.append(dt)
        except (TypeError, ValueError, OSError):
            return None
    ids, current = [0], 0
    for previous, now in zip(values, values[1:]):
        seam = (
            previous.date() < now.date()
            and now.time() == time(9, 0)        # FIX 2: first bar of a new MCX session
            and previous.time() >= time(13, 0)  # prev is an intraday afternoon/evening bar
        )
        if seam:
            current += 1
        ids.append(current)
    return ids if current else None


def same_e1_session(series, left: int, right: int) -> bool:
    ids = getattr(series, "session_id", None)
    return not ids or ids[left] == ids[right]

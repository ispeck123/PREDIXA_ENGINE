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
                dt = datetime.fromtimestamp(value, tz=IST)
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
            and previous.time() >= time(23, 30)
            and now.time() <= time(9, 0)
        )
        if seam:
            current += 1
        ids.append(current)
    return ids if current else None


def same_e1_session(series, left: int, right: int) -> bool:
    ids = getattr(series, "session_id", None)
    return not ids or ids[left] == ids[right]

"""Disruption severity (D-17): red (3) only when the service is actually stopped.

PTV's real `disruption_type` strings are unverified (RESEARCH A6, LOW confidence). The pattern
tuples below are the one place to adjust once the smoke script or live data shows the real values.

Red overload (RESEARCH Pitfall 7, review WR-S5): bare "closed"/"closure"/"cancel" used to match
road closures on detour notices, lift and car-park closures and "some services may be cancelled".
Now closures must name a stop, station, line or route; detour and facility notices stay white
unless they say buses replace the service; hedged cancellations stay white.
"""

# Buses replacing trams or trains always means the service itself is stopped.
_REPLACED: tuple[str, ...] = ("replacement bus", "buses replace", "buses replacing")

_STOPPED: tuple[str, ...] = (
    "suspend",
    "no trams",
    "no trains",
    "no buses",
    "not running",
)

# Closures count only when they close the service's own stop, station, line or route.
_CLOSED: tuple[str, ...] = (
    "stop closed",
    "stops closed",
    "stop closure",
    "station closed",
    "station closure",
    "line closed",
    "line closure",
    "route closed",
    "route closure",
)

_CANCEL = "cancel"
_HEDGES: tuple[str, ...] = ("may be", "might be", "some services", "some trips", "selected")

# Detours and facility notices (D-15, D-17): warning mark only, never red on their own.
NOT_RED: tuple[str, ...] = (
    "detour",
    "diversion",
    "divert",
    "lift",
    "escalator",
    "car park",
    "carpark",
    "parking",
    "toilet",
    "ticket office",
    "waiting room",
)

RED_PATTERNS: tuple[str, ...] = _REPLACED + _STOPPED + _CLOSED + (_CANCEL,)

# The description is only consulted for these (long free text would over-trigger otherwise).
_DESC_PATTERNS = ("replacement bus", "buses replace")


def classify_disruption(dtype: str | None, title: str | None, description: str | None) -> int:
    head = f"{dtype or ''} {title or ''}".lower()
    if any(p in head for p in _REPLACED):
        return 3
    if not any(p in head for p in NOT_RED):
        if any(p in head for p in _STOPPED) or any(p in head for p in _CLOSED):
            return 3
        if _CANCEL in head and not any(h in head for h in _HEDGES):
            return 3
    desc = (description or "").lower()
    if any(p in desc for p in _DESC_PATTERNS):
        return 3
    return 0

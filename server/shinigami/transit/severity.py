"""Disruption severity (D-17): red (3) only when the service is actually stopped.

PTV's real `disruption_type` strings are unverified (RESEARCH A6, LOW confidence). RED_PATTERNS is
the one place to adjust once the smoke script or live data shows the real values.
"""

RED_PATTERNS: tuple[str, ...] = (
    "suspend",
    "closed",
    "closure",
    "cancel",
    "replacement bus",
    "buses replace",
    "buses replacing",
    "no trams",
    "no trains",
    "not running",
)

# The description is only consulted for these (long free text would over-trigger otherwise).
_DESC_PATTERNS = ("replacement bus", "buses replace")


def classify_disruption(dtype: str | None, title: str | None, description: str | None) -> int:
    head = f"{dtype or ''} {title or ''}".lower()
    if any(p in head for p in RED_PATTERNS):
        return 3
    desc = (description or "").lower()
    if any(p in desc for p in _DESC_PATTERNS):
        return 3
    return 0

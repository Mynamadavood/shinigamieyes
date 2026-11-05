"""Saved places (D-09) loaded from a server-side places.toml.

Privacy: home coordinates live only in that file. Warnings name the id, never numbers.
"""

import logging
import tomllib
from dataclasses import dataclass
from pathlib import Path

log = logging.getLogger("shinigami.places")


@dataclass(frozen=True)
class Place:
    id: str
    label: str
    lat: float
    lon: float


def load_places(path: Path) -> list[Place]:
    try:
        with open(path, "rb") as f:
            data = tomllib.load(f)
    except FileNotFoundError:
        log.warning("places file not found; no saved places")
        return []
    except (tomllib.TOMLDecodeError, OSError):
        log.warning("places file unreadable; no saved places")
        return []
    out: list[Place] = []
    seen: set[str] = set()
    for entry in data.get("place", []):
        pid = entry.get("id") if isinstance(entry, dict) else None
        if not isinstance(pid, str):
            log.warning("skipping place entry without a valid id")
            continue
        try:
            lat, lon = float(entry["lat"]), float(entry["lon"])
            label = str(entry["label"])
            ok = -90 <= lat <= 90 and -180 <= lon <= 180 and pid not in seen
        except (KeyError, TypeError, ValueError):
            ok = False
        if not ok:
            log.warning("skipping invalid place %s", pid)
            continue
        seen.add(pid)
        out.append(Place(pid, label, lat, lon))
    return out

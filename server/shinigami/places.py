"""Saved places (D-09) loaded from a server-side places.toml.

Privacy: home coordinates live only in that file. Warnings name the id, never numbers.
Home never gets camera layers: nearby camera positions would reveal its location
(UAT gap 1, David 2026-11-10). A place is home when its id is "home", its label starts
with "home", or it sets `is_home = true` (review WR-S1: any private place not named
home must set the flag). Home is never given cameras, even with `cameras = true`.
Other places default to cameras on.
"""

import logging
import re
import tomllib
from dataclasses import dataclass
from pathlib import Path

log = logging.getLogger("shinigami.places")

# Same rule as /api/profile?place= (review WR-S10): an id the API would reject is skipped.
PLACE_ID_RE = re.compile(r"[a-z0-9_-]{1,32}")


@dataclass(frozen=True)
class Place:
    id: str
    label: str
    lat: float
    lon: float
    cameras: bool = True
    home: bool = False


def is_home_like(pid: str, label: str) -> bool:
    return pid.casefold() == "home" or label.strip().casefold().startswith("home")


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
        if not PLACE_ID_RE.fullmatch(pid):
            log.warning("skipping place with invalid id %.40r (need [a-z0-9_-], 1-32 chars)", pid)
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
        raw = entry.get("cameras", True)
        if isinstance(raw, bool):
            flag = raw
        else:
            log.warning("place %s has a non-boolean cameras flag; cameras off", pid)
            flag = False
        raw_home = entry.get("is_home", False)
        if not isinstance(raw_home, bool):
            log.warning("place %s has a non-boolean is_home flag; treated as home", pid)
            raw_home = True
        home = raw_home or is_home_like(pid, label)
        if home:
            if raw is True and "cameras" in entry:
                log.warning("place %s is home; cameras stay off", pid)
            flag = False
        seen.add(pid)
        out.append(Place(pid, label, lat, lon, flag, home))
    return out

"""In-memory transit stop dataset (transit_stops.json from the refresh job)."""
from __future__ import annotations

import json
import logging
import math
from dataclasses import dataclass
from pathlib import Path

from shinigami.geo import haversine_m

log = logging.getLogger("shinigami.transit")

ROUTE_TYPE = {"train": 0, "tram": 1, "bus": 2}
LIMITS_M = {"train": 1500, "tram": 800, "bus": 500}
MODES = ("train", "tram", "bus")


def walk_seconds(distance_m: float) -> int:
    """5 km/h with a 30% detour allowance."""
    return round(distance_m * 0.936)


@dataclass(frozen=True)
class NearStop:
    id: int
    mode: str
    route_type: int
    name: str
    lat: float
    lon: float
    distance_m: int
    walk_s: int
    routes: tuple[str, ...]
    dirkeys: tuple[str, ...]


@dataclass(frozen=True)
class Nearby:
    stops: tuple[NearStop, ...]
    none_modes: tuple[str, ...]


def _dirkeys(rec: dict) -> set[str]:
    return {k for pole in rec["poles"] for k in pole[2]}


def _opposite(a: set[str], b: set[str]) -> bool:
    for key in a:
        route, _, d = key.rpartition(":")
        if d in ("0", "1") and f"{route}:{1 - int(d)}" in b:
            return True
    return False


class TransitStore:
    def __init__(self, path: Path) -> None:
        self.path = Path(path)
        self.loaded = False
        self.count = 0
        self.built_at: float | None = None
        self._buckets: dict[int, list[dict]] = {}
        self._by_id: dict[int, dict] = {}
        self._mtime: float | None = None

    def _read(self):
        mtime = self.path.stat().st_mtime
        data = json.loads(self.path.read_text(encoding="utf-8"))
        if data.get("version") != 1:
            raise ValueError("unsupported version")
        buckets: dict[int, list[dict]] = {}
        by_id: dict[int, dict] = {}
        for rec in data["stops"]:
            by_id[int(rec["id"])] = rec
            seen: set[int] = set()
            for pole in rec["poles"]:
                b = math.floor(float(pole[0]) * 100)
                if b not in seen:
                    seen.add(b)
                    buckets.setdefault(b, []).append(rec)
        built = data.get("built_at")
        return (float(built) if built is not None else None), buckets, by_id, mtime

    def load(self) -> bool:
        try:
            built, buckets, by_id, mtime = self._read()
        except Exception as exc:  # noqa: BLE001 - missing/corrupt file leaves the layer pending
            if self.loaded:
                log.warning("transit reload failed: %s", type(exc).__name__)
            else:
                log.info("transit not loaded: %s", type(exc).__name__)
            return False
        self.built_at, self._buckets, self._by_id, self._mtime = built, buckets, by_id, mtime
        self.count = len(by_id)
        self.loaded = True
        return True

    def reload_if_changed(self) -> bool:
        try:
            mtime = self.path.stat().st_mtime
        except OSError as exc:
            log.warning("transit reload failed: %s", type(exc).__name__)
            return False
        if mtime == self._mtime:
            return False
        return self.load()

    def get(self, stop_id: int) -> dict | None:
        return self._by_id.get(stop_id)

    def _candidates(self, lat: float, lon: float, mode: str) -> list[tuple[float, float, float, dict]]:
        buckets = self._buckets  # local ref: the swap in load() is atomic
        limit = LIMITS_M[mode]
        span = math.ceil(limit / 1100) + 1
        centre = math.floor(lat * 100)
        seen: set[int] = set()
        out = []
        for b in range(centre - span, centre + span + 1):
            for rec in buckets.get(b, ()):
                if rec["mode"] != mode or rec["id"] in seen:
                    continue
                seen.add(rec["id"])
                best = None
                for pole in rec["poles"]:
                    d = haversine_m(lat, lon, float(pole[0]), float(pole[1]))
                    if best is None or d < best[0]:
                        best = (d, float(pole[0]), float(pole[1]))
                if best and best[0] <= limit:
                    out.append((best[0], best[1], best[2], rec))
        out.sort(key=lambda t: t[0])
        return out

    @staticmethod
    def _near(mode: str, cand: tuple[float, float, float, dict]) -> NearStop:
        d, plat, plon, rec = cand
        return NearStop(
            id=int(rec["id"]),
            mode=mode,
            route_type=ROUTE_TYPE[mode],
            name=rec["name"],
            lat=plat,
            lon=plon,
            distance_m=round(d),
            walk_s=walk_seconds(d),
            routes=tuple(rec.get("routes", ())),
            dirkeys=tuple(sorted(_dirkeys(rec))),
        )

    def nearby(self, lat: float, lon: float) -> Nearby:
        stops: list[NearStop] = []
        none: list[str] = []
        for mode in MODES:
            cands = self._candidates(lat, lon, mode)
            if not cands:
                none.append(mode)
                continue
            a = cands[0]
            stops.append(self._near(mode, a))
            if mode == "train":
                continue
            a_keys = _dirkeys(a[3])
            if _opposite(a_keys, a_keys):  # serves both directions of some route
                continue
            for cand in cands[1:]:
                if _opposite(a_keys, _dirkeys(cand[3])):
                    stops.append(self._near(mode, cand))
                    break
        return Nearby(stops=tuple(stops), none_modes=tuple(none))

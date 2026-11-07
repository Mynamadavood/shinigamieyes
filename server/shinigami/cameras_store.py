"""In-memory camera dataset (cameras.json from the data refresh job)."""

import json
import logging
import math
from pathlib import Path

from shinigami.geo import haversine_m

log = logging.getLogger("shinigami.cameras")


class CameraStore:
    def __init__(self, path: Path) -> None:
        self.path = Path(path)
        self.loaded = False
        self.built_at: float | None = None
        self._buckets: dict[int, list[dict]] = {}
        self._mtime: float | None = None

    def _read(self) -> tuple[float | None, dict[int, list[dict]], float]:
        mtime = self.path.stat().st_mtime
        data = json.loads(self.path.read_text(encoding="utf-8"))
        if data.get("version") != 1:
            raise ValueError("unsupported version")
        buckets: dict[int, list[dict]] = {}
        for rec in data["cameras"]:
            lat, lon = float(rec["lat"]), float(rec["lon"])
            rec = {**rec, "lat": lat, "lon": lon}
            buckets.setdefault(math.floor(lat * 100), []).append(rec)
        built = data.get("built_at")
        return (float(built) if built is not None else None), buckets, mtime

    def load(self) -> bool:
        try:
            built, buckets, mtime = self._read()
        except Exception as exc:  # noqa: BLE001 - missing/corrupt file leaves layers pending
            if self.loaded:
                log.warning("cameras reload failed: %s", type(exc).__name__)
            else:
                log.info("cameras not loaded: %s", type(exc).__name__)
            return False
        self.built_at, self._buckets, self._mtime = built, buckets, mtime
        self.loaded = True
        return True

    def reload_if_changed(self) -> bool:
        try:
            mtime = self.path.stat().st_mtime
        except OSError as exc:
            log.warning("cameras reload failed: %s", type(exc).__name__)
            return False
        if mtime == self._mtime:
            return False
        return self.load()

    def near(
        self, lat: float, lon: float, radius_m: float, kinds: set[str]
    ) -> list[tuple[float, dict]]:
        buckets = self._buckets  # local ref: the swap in load() is atomic
        span = math.ceil(radius_m / 1100) + 1
        centre = math.floor(lat * 100)
        out: list[tuple[float, dict]] = []
        for b in range(centre - span, centre + span + 1):
            for rec in buckets.get(b, ()):
                if rec.get("k") not in kinds:
                    continue
                d = haversine_m(lat, lon, rec["lat"], rec["lon"])
                if d <= radius_m:
                    out.append((d, rec))
        out.sort(key=lambda t: t[0])
        return out

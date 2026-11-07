"""PMTiles reader wrapper: serves stored gzip MVT tiles from a local file.

Tile coordinates encode where David is, so nothing here logs z/x/y.
"""

import logging
import os
import threading
import time
from pathlib import Path
from typing import Literal

from pmtiles.reader import Reader
from pmtiles.tile import Compression, TileType

log = logging.getLogger("shinigami.tiles")

Status = Literal["ok", "missing", "unsupported"]
RECHECK_S = 30.0
ATTRIBUTION = "© OpenStreetMap contributors · Protomaps"


class TileStore:
    def __init__(self, path: Path) -> None:
        self._path = Path(path)
        self._lock = threading.Lock()
        self._file = None
        self._reader: Reader | None = None
        self._header: dict | None = None
        self._sig: tuple[int, int] | None = None
        self._checked = 0.0
        self.status: Status = "missing"
        self.build = "0"
        self._open()

    def _close(self) -> None:
        if self._file is not None:
            try:
                self._file.close()
            except OSError:
                pass
        self._file = None
        self._reader = None
        self._header = None

    def _open(self) -> None:
        """(Re)open the file; caller holds the lock or is the constructor."""
        self._close()
        self._checked = time.monotonic()
        try:
            st = os.stat(self._path)
        except OSError:
            self.status, self.build, self._sig = "missing", "0", None
            return
        self._sig = (st.st_mtime_ns, st.st_ino)
        self.build = str(int(st.st_mtime))
        try:
            f = open(self._path, "rb")
            flock = threading.Lock()

            def get_bytes(offset: int, length: int) -> bytes:
                with flock:
                    f.seek(offset)
                    return f.read(length)

            reader = Reader(get_bytes)
            header = reader.header()
            if (
                header["tile_type"] != TileType.MVT
                or header["tile_compression"] != Compression.GZIP
            ):
                f.close()
                self.status = "unsupported"
                log.warning("tiles file has unsupported tile type or compression")
                return
        except Exception:  # corrupt/truncated file
            self.status = "unsupported"
            log.warning("tiles file could not be read")
            return
        self._file, self._reader, self._header = f, reader, header
        self.status = "ok"

    def reload_if_changed(self) -> None:
        now = time.monotonic()
        if now - self._checked < RECHECK_S:
            return
        with self._lock:
            if now - self._checked < RECHECK_S:
                return
            self._checked = now
            try:
                st = os.stat(self._path)
                sig = (st.st_mtime_ns, st.st_ino)
            except OSError:
                sig = None
            if sig != self._sig:
                self._open()

    def get(self, z: int, x: int, y: int) -> bytes | None:
        with self._lock:
            reader, header = self._reader, self._header
        if self.status != "ok" or reader is None or header is None:
            return None
        if z < header["min_zoom"] or z > header["max_zoom"]:
            return None
        try:
            return reader.get(z, x, y)
        except (ValueError, OSError):
            return None

    def meta(self) -> dict:
        h = self._header
        if self.status != "ok" or h is None:
            return {
                "status": self.status,
                "build": self.build,
                "minzoom": 0,
                "maxzoom": 0,
                "bounds": [0.0, 0.0, 0.0, 0.0],
                "attribution": ATTRIBUTION,
            }
        return {
            "status": "ok",
            "build": self.build,
            "minzoom": h["min_zoom"],
            "maxzoom": h["max_zoom"],
            "bounds": [
                h["min_lon_e7"] / 1e7,
                h["min_lat_e7"] / 1e7,
                h["max_lon_e7"] / 1e7,
                h["max_lat_e7"] / 1e7,
            ],
            "attribution": ATTRIBUTION,
        }

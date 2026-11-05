"""SQLite (WAL) store with an in-memory read-through/write-through layer.

Synchronous on purpose: single process, microsecond operations.
"""

import json
import sqlite3
from pathlib import Path


class Store:
    def __init__(self, path: Path) -> None:
        path = Path(path)
        path.parent.mkdir(parents=True, exist_ok=True)
        self._db = sqlite3.connect(path, check_same_thread=False)
        self._db.execute("PRAGMA journal_mode=WAL")
        self._db.execute("PRAGMA synchronous=NORMAL")
        self._db.execute(
            "CREATE TABLE IF NOT EXISTS layer_cache ("
            "provider_id TEXT, cell TEXT, payload TEXT, fetched_at REAL, "
            "PRIMARY KEY(provider_id, cell))"
        )
        self._db.execute(
            "CREATE TABLE IF NOT EXISTS geocode_cache ("
            "q_norm TEXT PRIMARY KEY, payload TEXT, created_at REAL)"
        )
        self._db.commit()
        self._layers: dict[tuple[str, str], tuple[dict, float]] = {}
        self._geo: dict[str, list[dict]] = {}

    def get_layer(self, provider_id: str, cell_id: str) -> tuple[dict, float] | None:
        key = (provider_id, cell_id)
        hit = self._layers.get(key)
        if hit is not None:
            return hit
        row = self._db.execute(
            "SELECT payload, fetched_at FROM layer_cache WHERE provider_id=? AND cell=?", key
        ).fetchone()
        if row is None:
            return None
        val = (json.loads(row[0]), float(row[1]))
        self._layers[key] = val
        return val

    def put_layer(self, provider_id: str, cell_id: str, payload: dict, fetched_at: float) -> None:
        self._db.execute(
            "INSERT OR REPLACE INTO layer_cache(provider_id, cell, payload, fetched_at) "
            "VALUES (?,?,?,?)",
            (provider_id, cell_id, json.dumps(payload), fetched_at),
        )
        self._db.commit()
        self._layers[(provider_id, cell_id)] = (payload, fetched_at)

    def get_geocode(self, q_norm: str) -> list[dict] | None:
        if q_norm in self._geo:
            return self._geo[q_norm]
        row = self._db.execute(
            "SELECT payload FROM geocode_cache WHERE q_norm=?", (q_norm,)
        ).fetchone()
        if row is None:
            return None
        val = json.loads(row[0])
        self._geo[q_norm] = val
        return val

    def put_geocode(self, q_norm: str, results: list[dict], created_at: float) -> None:
        self._db.execute(
            "INSERT OR REPLACE INTO geocode_cache(q_norm, payload, created_at) VALUES (?,?,?)",
            (q_norm, json.dumps(results), created_at),
        )
        self._db.commit()
        self._geo[q_norm] = results

    def journal_mode(self) -> str:
        return self._db.execute("PRAGMA journal_mode").fetchone()[0]

    def close(self) -> None:
        self._db.close()

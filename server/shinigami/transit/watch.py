"""Demand-driven watch set: which stops a phone looked at recently (D-23).

Holds stop ids and route types only: no positions, no per-phone identity. In memory, no I/O,
no logging. The departures poller asks it which stops are worth a PTV call right now; when
nobody has looked for `ttl_s`, the set drains and the poller makes zero calls.
"""

from __future__ import annotations

import threading
from dataclasses import dataclass


@dataclass(frozen=True)
class StopRef:
    stop_id: int
    route_type: int


class WatchSet:
    def __init__(self, ttl_s: float = 180, max_stops: int = 6) -> None:
        self.ttl_s = ttl_s
        self.max_stops = max_stops
        self._seen: dict[int, tuple[StopRef, float, int]] = {}
        self._seq = 0
        self._guard = threading.Lock()  # query() may run on a worker thread

    def _prune(self, now: float) -> None:
        for sid in [s for s, (_, t, _q) in self._seen.items() if now - t > self.ttl_s]:
            del self._seen[sid]

    def _ranked(self) -> list[tuple[StopRef, float, int]]:
        return sorted(self._seen.values(), key=lambda v: (v[1], v[2]), reverse=True)

    def touch(self, refs: list[StopRef], now: float) -> list[StopRef]:
        """Mark refs as seen; return those that were not active before this call.

        Within one call the first ref counts as the most recently seen, so when the cap bites
        the nearest stops (listed first by the caller) survive.
        """
        with self._guard:
            self._prune(now)
            new: list[StopRef] = []
            for ref in reversed(refs):
                if ref.stop_id not in self._seen:
                    new.append(ref)
                self._seq += 1
                self._seen[ref.stop_id] = (ref, now, self._seq)
            new.reverse()
            for ref, _t, _q in self._ranked()[self.max_stops :]:
                self._seen.pop(ref.stop_id, None)
            return [r for r in new if r.stop_id in self._seen]

    def active(self, now: float) -> list[StopRef]:
        """Refs seen within the TTL, most recently seen first, capped."""
        with self._guard:
            self._prune(now)
            return [ref for ref, _t, _q in self._ranked()[: self.max_stops]]

    def clear(self) -> None:
        with self._guard:
            self._seen.clear()

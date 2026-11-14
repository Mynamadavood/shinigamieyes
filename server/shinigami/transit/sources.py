"""Departure source seam (D-18) and per-stop direction grouping.

`GtfsRtDepartureSource` will implement the same Protocol when the GTFS-Realtime key arrives
(deferred); the provider only ever talks to `DepartureSource`.
"""

from __future__ import annotations

import math
from typing import Protocol

from shinigami.transit.model import Departure, StopDepartures
from shinigami.transit.ptv_client import PtvClient
from shinigami.transit.watch import StopRef

MAX_RESULTS = 25
_CITY_WORDS = ("city", "flinders street")


class DepartureSource(Protocol):
    async def departures(self, ref: StopRef) -> StopDepartures: ...


class PtvDepartureSource:
    def __init__(self, client: PtvClient) -> None:
        self.client = client

    async def departures(self, ref: StopRef) -> StopDepartures:
        return await self.client.departures(
            ref.route_type,
            ref.stop_id,
            max_results=MAX_RESULTS,
            include_cancelled=ref.route_type == 0,
        )


def _bearing(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dl = math.radians(lon2 - lon1)
    y = math.sin(dl) * math.cos(p2)
    x = math.cos(p1) * math.sin(p2) - math.sin(p1) * math.cos(p2) * math.cos(dl)
    return (math.degrees(math.atan2(y, x)) + 360.0) % 360.0


def _angle_diff(a: float, b: float) -> float:
    d = abs(a - b) % 360.0
    return 360.0 - d if d > 180.0 else d


def _soonest_key(d: Departure) -> float:
    return d.estimated_ts if d.estimated_ts is not None else d.scheduled_ts


def direction_group(
    stop_lat: float, stop_lon: float, deps: list[Departure], store
) -> dict[str, str]:
    """Map run_ref to a direction label for one stop.

    Trains: "city" or "out". Others: "a" (the soonest run's side) or "b" by the bearing to
    the run's final stop; "r{route_id}:{direction_id}" when the final stop is unknown.
    """
    out: dict[str, str] = {}
    bearings: dict[str, float] = {}
    for d in sorted(deps, key=_soonest_key):
        if d.route_type == 0:
            name = d.direction_name.lower()
            out[d.run_ref] = "city" if any(w in name for w in _CITY_WORDS) else "out"
            continue
        rec = store.get(d.final_stop_id) if d.final_stop_id is not None else None
        poles = rec.get("poles") if rec else None
        if poles:
            bearings[d.run_ref] = _bearing(
                stop_lat, stop_lon, float(poles[0][0]), float(poles[0][1])
            )
        else:
            out[d.run_ref] = f"r{d.route_id}:{d.direction_id}"
    ref_bearing: float | None = None
    for d in sorted(deps, key=_soonest_key):
        if d.run_ref in bearings:
            ref_bearing = bearings[d.run_ref]
            break
    for run_ref, b in bearings.items():
        out[run_ref] = "a" if ref_bearing is not None and _angle_diff(b, ref_bearing) <= 90 else "b"
    return out

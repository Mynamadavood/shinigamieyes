"""Vehicles heading to David's shown stops (D-11, D-18, D-20).

Everything here is pure and synchronous: sources read only what the departures and pattern
pollers already cached, so nothing in this module touches the network (PLAT-04).

Two sources sit behind the `VehicleSource` seam:
- `PtvRunPositionSource`: real PTV positions that came with the departures response.
- `PtvInterpolatedSource`: an estimate placed between the two stops a run is travelling
  between, from its stopping-pattern times. Always marked `pos_src="est"`.

A `GtfsRtVehicleSource` will implement the same Protocol later (deferred). The "2 stops away"
wording is never produced because the position-to-stop count is not reliable (RESEARCH
Pitfall 9). The vehicle key is a hash of the run ref; no raw run ref, vehicle descriptor,
operator or bearing is ever carried.

Cache callable convention: `cache(stop_id: int)` returns that stop's cached departures
payload, with the cache row's `fetched_at` merged in when known; `cache(key: str)` returns the
cached pattern cell `{"stops": [...]}` for that run key.
"""

from __future__ import annotations

import hashlib
import itertools
from collections.abc import Callable
from typing import Protocol

from shinigami.geo import haversine_m
from shinigami.transit.model import PatternStop, Vehicle
from shinigami.transit.store import NearStop

MAX_VEHICLES = 8
HEADING_RADIUS_M = 2000
POS_MAX_AGE_S = 180
ETA_HORIZON_S = 1800
PATTERN_RUNS_PER_CYCLE = 4
PATTERN_TTL_S = 60

VEHICLE_ROUTE_TYPES = (1, 2)  # tram, bus: no train markers (D-20)

Cache = Callable[["int | str"], "dict | None"]


def run_key(run_ref: str) -> str:
    return hashlib.sha1(run_ref.encode("utf-8")).hexdigest()[:10]


class VehicleSource(Protocol):
    def vehicles(self, stops: list[NearStop], cache: Cache, now: float) -> list[Vehicle]: ...


def interpolate(pattern: list[PatternStop], now: float) -> tuple[float, float] | None:
    """Linear position between the two consecutive stops whose times bracket `now`."""
    for a, b in itertools.pairwise(pattern):
        if a.ts <= now <= b.ts:
            span = b.ts - a.ts
            f = 0.0 if span <= 0 else (now - a.ts) / span
            return (a.lat + (b.lat - a.lat) * f, a.lon + (b.lon - a.lon) * f)
    return None


def _eta(d: dict) -> tuple[float, bool]:
    est = d.get("estimated_ts")
    return (est, True) if est is not None else (d["scheduled_ts"], False)


def _candidates(stops: list[NearStop], cache: Cache):
    for s in stops:
        payload = cache(s.id)
        if not payload:
            continue
        for d in payload.get("departures") or []:
            if d.get("cancelled") or d.get("route_type") not in VEHICLE_ROUTE_TYPES:
                continue
            yield s, d, payload.get("positions") or {}, payload.get("fetched_at")


def _vehicle(s: NearStop, d: dict, lat, lon, pos_ts, src: str) -> Vehicle:
    eta, live = _eta(d)
    return Vehicle(
        key=run_key(d["run_ref"]),
        route_number=d.get("route_number") or "",
        route_type=d["route_type"],
        destination=d.get("destination") or d.get("direction_name") or "",
        heading_stop_id=s.id,
        heading_stop_name=s.name,
        eta_ts=eta,
        eta_live=live,
        lat=lat,
        lon=lon,
        pos_ts=pos_ts,
        pos_src=src,
    )


def _near_enough(s: NearStop, lat: float, lon: float) -> bool:
    return haversine_m(lat, lon, s.lat, s.lon) <= HEADING_RADIUS_M


class PtvRunPositionSource:
    """Real positions PTV attached to runs in the departures response (buses, some trams)."""

    def vehicles(self, stops: list[NearStop], cache: Cache, now: float) -> list[Vehicle]:
        out: list[Vehicle] = []
        for s, d, positions, fetched_at in _candidates(stops, cache):
            pos = positions.get(d["run_ref"])
            if not pos or pos.get("lat") is None or pos.get("lon") is None:
                continue
            if not _near_enough(s, pos["lat"], pos["lon"]):
                continue
            # PTV sometimes omits the position time: then the position is at least as old as
            # the cached response, so age it by that instead of showing it forever (WR-S4)
            ts = pos.get("ts")
            if ts is None:
                ts = fetched_at
            if ts is None:
                continue  # age unknown: never shown as a real position
            out.append(_vehicle(s, d, pos["lat"], pos["lon"], ts, "ptv"))
        return out


class PtvInterpolatedSource:
    """Estimated positions from cached stopping patterns; labelled `est` (D-20)."""

    def vehicles(self, stops: list[NearStop], cache: Cache, now: float) -> list[Vehicle]:
        out: list[Vehicle] = []
        for s, d, positions, _fetched_at in _candidates(stops, cache):
            if positions.get(d["run_ref"]):
                continue  # a real position wins
            cell = cache(run_key(d["run_ref"]))
            if not cell:
                continue
            try:
                pattern = [PatternStop(**p) for p in cell.get("stops") or []]
            except TypeError:
                continue
            at = interpolate(pattern, now)
            if at is None or not _near_enough(s, at[0], at[1]):
                continue
            out.append(_vehicle(s, d, at[0], at[1], now, "est"))
        return out


def select_vehicles(cands: list[Vehicle], stops: list[NearStop], now: float) -> list[Vehicle]:
    by_id = {s.id: s for s in stops}
    ok: list[Vehicle] = []
    for v in cands:
        if v.eta_ts is None or v.eta_ts < now or v.eta_ts > now + ETA_HORIZON_S:
            continue
        if v.lat is None or v.lon is None:
            continue
        if v.pos_ts is None or now - v.pos_ts > POS_MAX_AGE_S:
            continue  # a position of unknown age is never shown (review WR-S4)
        s = by_id.get(v.heading_stop_id) if v.heading_stop_id is not None else None
        if s is None or not _near_enough(s, v.lat, v.lon):
            continue
        ok.append(v)
    ok.sort(key=lambda v: (v.pos_src != "ptv", v.eta_ts))  # real beats estimate, then soonest
    seen: set[str] = set()
    kept: list[Vehicle] = []
    for v in ok:
        if v.key in seen:
            continue
        seen.add(v.key)
        kept.append(v)
    kept.sort(key=lambda v: v.eta_ts)
    return kept[:MAX_VEHICLES]

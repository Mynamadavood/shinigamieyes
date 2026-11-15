"""Approaching vehicles: sources, interpolation, selection. Synthetic data only, FAKE keys."""

import dataclasses
import hashlib
import json

from shinigami.transit.model import PatternStop, Vehicle
from shinigami.transit.store import NearStop
from shinigami.transit.vehicles import (
    MAX_VEHICLES,
    PtvInterpolatedSource,
    PtvRunPositionSource,
    interpolate,
    run_key,
    select_vehicles,
)

LAT, LON = -37.0, 144.0  # synthetic point
NOW = 1_794_531_600.0


def dlat(m):
    return m / 111_195.0


def stop(i=1, name="Synthetic Stop", lat=LAT, lon=LON, rt=1):
    return NearStop(
        id=i, mode="tram", route_type=rt, name=name, lat=lat, lon=lon, distance_m=10,
        walk_s=10, routes=("96",), dirkeys=(),
    )  # fmt: skip


def dep(run="RUN-A", rt=1, eta=NOW + 180, est=True, cancelled=False, num="96"):
    return {
        "stop_id": 1, "route_id": 7, "route_type": rt, "route_number": num, "route_name": "r",
        "run_ref": run, "direction_id": 1, "direction_name": "Dir", "destination": "Dest",
        "final_stop_id": None, "scheduled_ts": eta - 60, "estimated_ts": eta if est else None,
        "platform": None, "at_platform": False, "cancelled": cancelled, "disruption_ids": [],
    }  # fmt: skip


def cache_of(payloads, patterns=None):
    def cache(k):
        if isinstance(k, int):
            return payloads.get(k)
        return (patterns or {}).get(k)

    return cache


def pos(m_north, ts=NOW - 10):
    return {"lat": LAT + dlat(m_north), "lon": LON, "ts": ts}


def veh(run="A", eta=NOW + 100, m=100, src="ptv", pos_ts=NOW - 5, stop_id=1):
    return Vehicle(
        key=run_key(run), route_number="96", route_type=1, destination="D",
        heading_stop_id=stop_id, heading_stop_name="S", eta_ts=eta, eta_live=True,
        lat=LAT + dlat(m), lon=LON, pos_ts=pos_ts, pos_src=src,
    )  # fmt: skip


# --- interpolate ----------------------------------------------------------------------------


def test_interpolate_midpoint_and_bounds():
    a = PatternStop(1, -37.0, 144.0, 100.0)
    b = PatternStop(2, -37.2, 144.4, 200.0)
    lat, lon = interpolate([a, b], 150.0)
    assert lat == -37.1 and abs(lon - 144.2) < 1e-9
    assert interpolate([a, b], 90.0) is None
    assert interpolate([a, b], 210.0) is None
    assert interpolate([a], 100.0) is None
    assert interpolate([], 100.0) is None


def test_interpolate_picks_the_bracketing_pair():
    p = [PatternStop(i, -37.0 - i, 144.0, 100.0 * i) for i in (1, 2, 3)]
    assert interpolate(p, 250.0) == (-39.5, 144.0)


# --- PtvRunPositionSource -------------------------------------------------------------------


def test_run_position_source_real_bus():
    s = stop(rt=2)
    payload = {"departures": [dep(rt=2)], "positions": {"RUN-A": pos(600)}}
    (v,) = PtvRunPositionSource().vehicles([s], cache_of({1: payload}), NOW)
    assert v.pos_src == "ptv" and v.heading_stop_id == 1 and v.eta_live is True
    assert v.heading_stop_name == "Synthetic Stop" and v.eta_ts == NOW + 180
    assert v.key == hashlib.sha1(b"RUN-A").hexdigest()[:10]
    assert v.pos_ts == NOW - 10


def test_run_position_source_scheduled_eta_not_live():
    payload = {"departures": [dep(rt=2, est=False)], "positions": {"RUN-A": pos(100)}}
    (v,) = PtvRunPositionSource().vehicles([stop()], cache_of({1: payload}), NOW)
    assert v.eta_live is False


def test_run_position_source_drops_far_cancelled_and_trains():
    s = stop()
    far = {"departures": [dep(rt=2)], "positions": {"RUN-A": pos(2500)}}
    canc = {"departures": [dep(rt=2, cancelled=True)], "positions": {"RUN-A": pos(100)}}
    train = {"departures": [dep(rt=0)], "positions": {"RUN-A": pos(100)}}
    nopos = {"departures": [dep(rt=2)], "positions": {}}
    for p in (far, canc, train, nopos):
        assert PtvRunPositionSource().vehicles([s], cache_of({1: p}), NOW) == []


# --- PtvInterpolatedSource ------------------------------------------------------------------


def test_interpolated_source_estimates_tram():
    s = stop()
    cell = {
        "stops": [
            {"stop_id": 5, "lat": LAT + dlat(1000), "lon": LON, "ts": NOW - 60},
            {"stop_id": 1, "lat": LAT, "lon": LON, "ts": NOW + 60},
        ]
    }
    payload = {"departures": [dep()], "positions": {}}
    c = cache_of({1: payload}, {run_key("RUN-A"): cell})
    (v,) = PtvInterpolatedSource().vehicles([s], c, NOW)
    assert v.pos_src == "est" and v.pos_ts == NOW
    assert abs(v.lat - (LAT + dlat(500))) < 1e-9 and v.lon == LON


def test_interpolated_source_nothing_without_pattern_or_with_real_position():
    s = stop()
    payload = {"departures": [dep()], "positions": {}}
    assert PtvInterpolatedSource().vehicles([s], cache_of({1: payload}), NOW) == []
    cell = {"stops": [{"stop_id": 5, "lat": LAT, "lon": LON, "ts": NOW - 60},
                      {"stop_id": 1, "lat": LAT, "lon": LON, "ts": NOW + 60}]}  # fmt: skip
    withpos = {"departures": [dep()], "positions": {"RUN-A": pos(10)}}
    c = cache_of({1: withpos}, {run_key("RUN-A"): cell})
    assert PtvInterpolatedSource().vehicles([s], c, NOW) == []


# --- select_vehicles ------------------------------------------------------------------------


def test_select_dedupes_keeping_earliest_eta():
    stops = [stop(1), stop(2)]
    a = veh("A", eta=NOW + 300, stop_id=1)
    b = veh("A", eta=NOW + 100, stop_id=2)
    out = select_vehicles([a, b], stops, NOW)
    assert len(out) == 1 and out[0].eta_ts == NOW + 100 and out[0].heading_stop_id == 2


def test_select_real_beats_estimate_for_same_run():
    out = select_vehicles(
        [veh("A", eta=NOW + 100, src="est"), veh("A", eta=NOW + 200, src="ptv")], [stop()], NOW
    )
    assert [v.pos_src for v in out] == ["ptv"]


def test_select_caps_at_eight_soonest_first():
    cands = [veh(f"R{i}", eta=NOW + 60 + i * 10) for i in range(12)][::-1]
    out = select_vehicles(cands, [stop()], NOW)
    assert len(out) == MAX_VEHICLES
    assert [v.eta_ts for v in out] == [NOW + 60 + i * 10 for i in range(8)]


def test_select_drops_stale_far_past_and_distant_eta():
    s = [stop()]
    assert select_vehicles([veh(pos_ts=NOW - 181)], s, NOW) == []
    assert len(select_vehicles([veh(pos_ts=NOW - 179)], s, NOW)) == 1
    assert select_vehicles([veh(m=2100)], s, NOW) == []
    assert select_vehicles([veh(eta=NOW - 1)], s, NOW) == []
    assert select_vehicles([veh(eta=NOW + 1801)], s, NOW) == []
    assert len(select_vehicles([veh(eta=NOW + 1800)], s, NOW)) == 1


def test_vehicle_has_no_identifying_fields():
    v = veh("SECRET-RUN-REF")
    blob = json.dumps(dataclasses.asdict(v))
    assert "SECRET-RUN-REF" not in blob
    names = {f.name for f in dataclasses.fields(v)}
    assert not {"run_ref", "bearing", "vehicle_descriptor", "operator", "vehicle_id"} & names

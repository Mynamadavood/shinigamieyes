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


def dep(run="RUN-A", rt=1, eta=NOW + 180, est=True, cancelled=False, num="96", rid=7, did=1):
    return {
        "stop_id": 1, "route_id": rid, "route_type": rt, "route_number": num, "route_name": "r",
        "run_ref": run, "direction_id": did, "direction_name": "Dir", "destination": "Dest",
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


# =============================== Task 2: provider, budget, Home ===============================

import logging
from datetime import UTC, datetime

import httpx
import pytest
import respx
from conftest import FakeRuntime
from pydantic import SecretStr
from shinigami.main import create_app
from shinigami.providers.base import ProviderContext
from shinigami.providers.transit import TransitVehiclesProvider
from shinigami.store import Store
from shinigami.transit.service import ATTRIBUTION, TransitService
from shinigami.transit.store import TransitStore
from shinigami.transit.vehicles import PATTERN_RUNS_PER_CYCLE
from shinigami.transit.watch import StopRef

DEVID = "1000001"
KEY = "00000000-0000-0000-0000-000000000000"
FOUR = ("transit_stops", "transit_departures", "transit_disruptions", "transit_vehicles")


def iso(t):
    return datetime.fromtimestamp(t, UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def pattern_js(a_ts, b_ts):
    def d(sid, t):
        return {"stop_id": sid, "run_ref": "x", "route_id": 7, "direction_id": 1,
                "scheduled_departure_utc": iso(t), "estimated_departure_utc": None}  # fmt: skip

    def st(sid, lat):
        return {"stop_id": sid, "stop_name": "p", "stop_latitude": lat, "stop_longitude": LON}

    return {
        "departures": [d(3101, a_ts), d(3102, b_ts)],
        "stops": {"3101": st(3101, LAT + dlat(1000)), "3102": st(3102, LAT + dlat(27))},
        "runs": {}, "directions": {}, "disruptions": {}, "status": {"version": "3.0", "health": 1},
    }  # fmt: skip


class Harness:
    def __init__(self, tmp_path, transit_store_file, creds=True):
        stops = [
            {"id": 2720, "mode": "tram", "name": "Synthetic Mall",
             "poles": [[LAT + dlat(27), LON, ["96:0"]]], "gtfs_ids": [], "routes": ["96"]},
            {"id": 4400, "mode": "bus", "name": "Synthetic Uni",
             "poles": [[LAT + dlat(40), LON, ["907:0"]]], "gtfs_ids": [], "routes": ["907"]},
        ]  # fmt: skip
        st = TransitStore(transit_store_file(stops))
        st.load()
        self.now = NOW
        self.service = TransitService(st, DEVID if creds else None, KEY if creds else None)
        self.http = httpx.AsyncClient()
        self.service.attach_http(self.http)
        self.provider = TransitVehiclesProvider(self.service)
        self.store = Store(tmp_path / "p.db")
        self.ctx = ProviderContext(
            settings=None, clock=lambda: self.now, store=self.store, http=self.http,
            runtime=FakeRuntime(),
        )  # fmt: skip

    def query(self):
        return self.provider.query(self.ctx, LAT, LON, self.now)

    def put_deps(self, stop_id, deps, positions=None, at=None):
        self.store.put_layer(
            "transit", f"dep:{stop_id}",
            {"departures": deps, "positions": positions or {}}, at or self.now,
        )  # fmt: skip

    def watch(self, *ids):
        self.service.watch.touch([StopRef(i, 1) for i in ids], self.now)


@pytest.fixture
def h(tmp_path, transit_store_file):
    return Harness(tmp_path, transit_store_file)


def six_tram_deps(base=NOW):
    return [dep(f"RUN-{i}", eta=base + 100 + i * 60, rid=100 + i, did=i) for i in range(6)]


def run_of(call):
    return str(call.request.url).split("/run/")[1].split("/")[0]


def test_provider_meta():
    m = TransitVehiclesProvider.meta
    assert (m.id, m.tier, m.ttl_s, m.stale_after_s, m.interval_s) == (
        "transit_vehicles", "polled", 30, 120, 30,
    )  # fmt: skip
    assert m.exact_location_only is True and m.attribution == ATTRIBUTION


@respx.mock
async def test_empty_watch_set_makes_no_calls(h):
    route = respx.route().mock(return_value=httpx.Response(200, json={}))
    h.put_deps(2720, six_tram_deps())
    await h.provider.refresh(h.ctx)
    assert route.call_count == 0


@respx.mock
async def test_no_key_zero_calls(tmp_path, transit_store_file):
    n = Harness(tmp_path, transit_store_file, creds=False)
    route = respx.route().mock(return_value=httpx.Response(200, json={}))
    n.watch(2720)
    n.put_deps(2720, six_tram_deps())
    await n.provider.refresh(n.ctx)
    layer = n.query()
    assert route.call_count == 0 and layer.status == "pending" and layer.items == []


@respx.mock
async def test_pattern_budget_and_cache(h):
    route = respx.route().mock(
        return_value=httpx.Response(200, json=pattern_js(NOW - 60, NOW + 120))
    )
    h.watch(2720)
    h.put_deps(2720, six_tram_deps())
    await h.provider.refresh(h.ctx)
    assert route.call_count == PATTERN_RUNS_PER_CYCLE == 4
    assert {run_of(c) for c in route.calls} == {f"RUN-{i}" for i in range(4)}
    for i in range(4):
        assert h.store.get_layer("transit", f"pat:{run_key(f'RUN-{i}')}") is not None
    assert h.store.get_layer("transit", f"pat:{run_key('RUN-5')}") is None
    h.now = NOW + 10  # first four are younger than 60 s: fetch only the other two
    await h.provider.refresh(h.ctx)
    assert route.call_count == 6
    h.now = NOW + 20
    await h.provider.refresh(h.ctx)
    assert route.call_count == 6
    h.now = NOW + 75  # the first four have aged past 60 s
    await h.provider.refresh(h.ctx)
    assert route.call_count == 10


@respx.mock
async def test_pattern_skips_positioned_far_eta_cancelled_and_trains(h):
    route = respx.route().mock(return_value=httpx.Response(200, json=pattern_js(NOW, NOW + 1)))
    h.watch(2720)
    deps = [
        dep("POS", eta=NOW + 100, rid=1), dep("FAR", eta=NOW + 1300, rid=2),
        dep("CAN", eta=NOW + 100, rid=3, cancelled=True), dep("TRN", rt=0, eta=NOW + 100, rid=4),
        dep("OK", eta=NOW + 100, rid=5),
    ]  # fmt: skip
    h.put_deps(2720, deps, positions={"POS": pos(100)})
    await h.provider.refresh(h.ctx)
    assert [run_of(c) for c in route.calls] == ["OK"]


@respx.mock
async def test_query_contract_est_and_real(h):
    respx.route().mock(return_value=httpx.Response(200, json=pattern_js(NOW - 60, NOW + 120)))
    h.watch(2720, 4400)
    h.put_deps(2720, [dep("RUN-T", eta=NOW + 120, est=True, num="96")])
    h.put_deps(
        4400,
        [dep("RUN-B", rt=2, eta=NOW + 200, num="907", rid=9)],
        positions={"RUN-B": pos(600, ts=NOW - 5)},
    )
    await h.provider.refresh(h.ctx)
    layer = h.query()
    assert layer.id == "transit_vehicles" and layer.status == "fresh" and layer.as_of == NOW
    by = {i.id: i for i in layer.items}
    assert set(by) == {f"veh:{run_key('RUN-T')}", f"veh:{run_key('RUN-B')}"}
    t = by[f"veh:{run_key('RUN-T')}"]
    assert t.name == "Tram 96 to Dest" and t.verb == "arrives" and t.group == "tram"
    assert t.target_ts == NOW + 120 and t.kind == "transit_vehicle" and t.severity == 0
    assert t.stale_after_s == 120 and t.geom["type"] == "Point"
    assert t.geom["coordinates"][0] == LON and t.geom["coordinates"][1] < LAT + dlat(1000)
    assert t.detail == {
        "route_number": "96", "route_type": 1, "mode": "tram", "destination": "Dest",
        "heading_stop_id": 2720, "heading_stop_name": "Synthetic Mall", "eta_ts": NOW + 120,
        "eta_live": True, "pos_ts": NOW, "pos_src": "est",
    }  # fmt: skip
    b = by[f"veh:{run_key('RUN-B')}"]
    assert b.detail["pos_src"] == "ptv" and b.detail["heading_stop_name"] == "Synthetic Uni"
    assert b.name == "Bus 907 to Dest" and b.detail["pos_ts"] == NOW - 5
    assert [i.target_ts for i in layer.items] == sorted(i.target_ts for i in layer.items)
    blob = json.dumps(layer.model_dump())
    for bad in ("run_ref", "RUN-T", "RUN-B", "vehicle_descriptor", "bearing", "operator"):
        assert bad not in blob


def test_query_pending_empty_cache_then_fresh_then_stale(h):
    assert h.query().status == "pending" and h.query().items == []
    h.put_deps(2720, [dep("RUN-T", eta=NOW + 120)])
    assert h.query().status == "fresh"
    h.now = NOW + 121
    assert h.query().status == "stale"


def test_query_caps_at_eight(h):
    deps = [dep(f"R{i}", rt=2, eta=NOW + 60 + i, rid=i) for i in range(12)]
    h.put_deps(2720, deps, positions={f"R{i}": pos(100) for i in range(12)})
    items = h.query().items
    assert len(items) == 8
    assert [i.id for i in items] == [f"veh:{run_key(f'R{i}')}" for i in range(8)]


@respx.mock
async def test_pattern_failures_log_safely_and_raise_only_when_all_fail(h, caplog):
    caplog.set_level(logging.DEBUG)
    h.watch(2720)
    h.put_deps(2720, six_tram_deps())
    respx.route().mock(return_value=httpx.Response(403))
    with pytest.raises(Exception) as ei:
        await h.provider.refresh(h.ctx)
    assert getattr(ei.value, "kind", None) == "http_403"
    text = " ".join(r.getMessage() for r in caplog.records if not r.name.startswith("httpx"))
    assert "refresh failed provider=transit_vehicles err=PtvError kind=http_403" in text
    for bad in (DEVID, KEY, "signature", "timetableapi", "RUN-", "2720", "-37"):
        assert bad.lower() not in text.lower()


@respx.mock
async def test_partial_pattern_failure_does_not_raise(h):
    h.watch(2720)
    h.put_deps(2720, six_tram_deps())
    n = {"c": 0}

    def handler(request):
        n["c"] += 1
        if n["c"] == 1:
            return httpx.Response(500)
        return httpx.Response(200, json=pattern_js(NOW - 60, NOW + 120))

    respx.route().mock(side_effect=handler)
    await h.provider.refresh(h.ctx)
    assert n["c"] == 4


async def test_departures_refresh_publishes_vehicle_touch(tmp_path, transit_store_file):
    from shinigami.providers.transit import TransitDeparturesProvider
    from shinigami.runtime import EventBus

    h = Harness(tmp_path, transit_store_file)
    h.ctx.bus = EventBus()
    q = h.ctx.bus.subscribe()
    h.watch(2720)
    dp = TransitDeparturesProvider(h.service)
    with respx.mock:
        respx.route().mock(return_value=httpx.Response(200, json={"departures": []}))
        await dp.refresh(h.ctx)
    assert q.get_nowait() == {"type": "touch", "provider": "transit_vehicles"}


# ---- end to end: profile read-only, Home and cameras=false never get transit ----

HOME = (-10.5321, 120.5432)  # fictional point, open sea
PUB = (-37.0, 144.0)


def _world(settings, transit_store_file):
    transit_store_file(
        [
            {"id": 2720, "mode": "tram", "name": "S",
             "poles": [[PUB[0] + 0.0003, PUB[1], ["96:0"]]], "gtfs_ids": [], "routes": ["96"]},
            {"id": 7, "mode": "tram", "name": "H",
             "poles": [[HOME[0] + 0.0003, HOME[1], ["5:0"]]], "gtfs_ids": [], "routes": ["5"]},
        ]
    )  # fmt: skip
    settings.places_path.write_text(
        '[[place]]\nid = "home"\nlabel = "Home"\nis_home = true\n'
        f"lat = {HOME[0]}\nlon = {HOME[1]}\n\n"
        f'[[place]]\nid = "nocam"\nlabel = "N"\ncameras = false\nlat = {PUB[0]}\nlon = {PUB[1]}\n\n'
        f'[[place]]\nid = "pub"\nlabel = "Pub"\nlat = {PUB[0]}\nlon = {PUB[1]}\n'
    )
    s = settings.model_copy(update={"ptv_devid": SecretStr(DEVID), "ptv_key": SecretStr(KEY)})
    app = create_app(s, start_runtime=False)
    rt = FakeRuntime()
    app.state.ctx.runtime = rt
    client = httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://t")
    return app, client, rt


def test_all_four_transit_providers_registered(settings, transit_store_file):
    app, _c, _rt = _world(settings, transit_store_file)
    ids = [p.meta.id for p in app.state.providers]
    assert all(i in ids for i in FOUR)


async def test_profile_with_all_transit_providers_makes_no_http_call(settings, transit_store_file):
    app, client, _rt = _world(settings, transit_store_file)
    now = app.state.ctx.clock()
    app.state.ctx.store.put_layer(
        "transit", "dep:2720", {"departures": [dep("R", eta=now + 100)], "positions": {}}, now
    )
    with respx.mock(assert_all_called=False) as router:
        route = router.route().mock(return_value=httpx.Response(200, json={}))
        r = await client.get("/api/profile", params={"lat": PUB[0], "lon": PUB[1]})
    assert r.status_code == 200 and route.call_count == 0
    layers = r.json()["layers"]
    assert all(i in layers for i in FOUR)
    assert "run_ref" not in r.text and "vehicle_descriptor" not in r.text


class _Req:
    pass


async def _stream_frames(app, place):
    from shinigami.api.profile import camera_ok, resolve_location
    from shinigami.api.stream import event_stream

    req = _Req()
    req.app = app
    location, la, lo = resolve_location(req, None, None, place)
    ctx = app.state.ctx
    calls = {"n": 0}

    async def dc():
        calls["n"] += 1
        return calls["n"] > len(FOUR)  # drain exactly the four published touches, then stop

    exact_ok = camera_ok(req, location)
    gen = event_stream(ctx, app.state.providers, location, la, lo, dc, exact_ok=exact_ok)
    first = await gen.__anext__()
    assert first.event == "hello"
    frames = []
    expected = sum(1 for p in app.state.providers if exact_ok or not p.meta.exact_location_only)
    for _ in range(expected):
        frames.append(json.loads((await gen.__anext__()).data)["id"])
    for pid in FOUR:
        ctx.bus.publish({"type": "touch", "provider": pid})
    async for ev in gen:
        frames.append(json.loads(ev.data)["id"])
    return frames


@pytest.mark.parametrize("place", ["home", "nocam"])
async def test_home_and_camera_off_never_get_transit(settings, transit_store_file, place):
    app, client, rt = _world(settings, transit_store_file)
    with respx.mock(assert_all_called=False) as router:
        route = router.route().mock(return_value=httpx.Response(200, json={}))
        r = await client.get("/api/profile", params={"place": place})
        assert r.status_code == 200
        assert not [k for k in r.json()["layers"] if k.startswith("transit_")]
        frames = await _stream_frames(app, place)
        assert not [f for f in frames if f.startswith("transit_")]
        for p in app.state.providers:  # refresh side: empty watch set means no work
            if p.meta.id in FOUR and p.meta.id != "transit_stops":
                await p.refresh(app.state.ctx)
        assert route.call_count == 0
    assert app.state.transit.watch.active(app.state.ctx.clock()) == []
    assert rt.nudges == []
    assert str(HOME[0]) not in r.text and str(HOME[1]) not in r.text


async def test_stream_control_non_home_place_does_get_transit_frames(settings, transit_store_file):
    app, _client, _rt = _world(settings, transit_store_file)
    frames = await _stream_frames(app, "pub")
    assert frames.count("transit_vehicles") >= 2  # snapshot frame plus the touch frame


@respx.mock
async def test_pattern_cache_stays_bounded_over_many_runs(h):
    # review CR-S1: every run ref is new, so without pruning pat:* rows grow forever
    from shinigami.providers.transit import PATTERN_KEEP_S

    respx.route().mock(return_value=httpx.Response(200, json=pattern_js(NOW - 60, NOW + 120)))
    h.service.client._clock = lambda: h.now  # keep the 60/min guard on the fake clock
    step = 30
    for cycle in range(400):
        h.now = NOW + cycle * step
        h.watch(2720)
        deps = [dep(f"C{cycle}-{i}", eta=h.now + 100 + i, rid=1000 * cycle + i) for i in range(4)]
        h.put_deps(2720, deps)
        await h.provider.refresh(h.ctx)
    rows = (
        h.store._db()
        .execute(
            "SELECT COUNT(*) FROM layer_cache WHERE provider_id='transit' AND cell LIKE 'pat:%'"
        )
        .fetchone()[0]
    )
    mem = sum(1 for k in h.store._layers if k[0] == "transit" and k[1].startswith("pat:"))
    bound = 4 * (PATTERN_KEEP_S // step + 1)
    assert 0 < rows <= bound < 400 * 4
    assert mem == rows
    # once the watch set drains, the remaining cells age out too
    h.service.watch.clear()
    h.now += PATTERN_KEEP_S + 1
    await h.provider.refresh(h.ctx)
    assert not any(k[1].startswith("pat:") for k in h.store._layers if k[0] == "transit")

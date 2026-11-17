"""Departures polling: watch set, source seam, direction groups, provider. FAKE keys only."""

import dataclasses
import json
import logging

import httpx
import pytest
import respx
from shinigami.providers.base import ProviderContext
from shinigami.providers.transit import TransitDeparturesProvider
from shinigami.store import Store
from shinigami.transit.model import Departure
from shinigami.transit.service import ATTRIBUTION, TransitService
from shinigami.transit.sources import PtvDepartureSource, direction_group
from shinigami.transit.store import TransitStore
from shinigami.transit.vehicles import run_key
from shinigami.transit.watch import StopRef, WatchSet

DEVID = "1000001"
KEY = "00000000-0000-0000-0000-000000000000"
LAT, LON = -37.0, 144.0  # synthetic point
T0 = 1794531600.0  # 2026-11-13T01:00:00Z, the fixture's first scheduled time


def dlat(m):
    return m / 111_195.0


def dlon(m):
    return m / 88_800.0


# --- WatchSet -------------------------------------------------------------------------------


def test_watch_ttl_boundaries():
    w = WatchSet()
    r = StopRef(1, 1)
    assert w.touch([r], 0) == [r]
    assert w.active(179) == [r]
    assert w.active(181) == []


def test_watch_returns_only_new_and_keeps_six_most_recent():
    w = WatchSet()
    refs = [StopRef(i, 1) for i in range(1, 9)]
    for i, r in enumerate(refs):
        assert w.touch([r], float(i)) == [r]
    assert [r.stop_id for r in w.active(10.0)] == [8, 7, 6, 5, 4, 3]
    assert w.touch([StopRef(8, 1)], 11.0) == []
    w2 = WatchSet()
    assert len(w2.touch(refs, 0.0)) == 6
    assert [r.stop_id for r in w2.active(1.0)] == [1, 2, 3, 4, 5, 6]


def test_watch_holds_no_coordinates():
    assert [f.name for f in dataclasses.fields(StopRef)] == ["stop_id", "route_type"]
    w = WatchSet()
    w.touch([StopRef(1, 1)], 0)
    w.clear()
    assert w.active(0) == []


# --- source ---------------------------------------------------------------------------------


async def test_source_calls_client_with_expected_args():
    calls = []

    class Fake:
        async def departures(self, *a, **k):
            calls.append((a, k))

    src = PtvDepartureSource(Fake())
    await src.departures(StopRef(2720, 1))
    await src.departures(StopRef(1900, 0))
    assert calls[0] == ((1, 2720), {"max_results": 25, "include_cancelled": False})
    assert calls[1] == ((0, 1900), {"max_results": 25, "include_cancelled": True})


# --- direction groups -----------------------------------------------------------------------


def dep(run, route_type=1, final=None, sched=0.0, est=None, direction="X", route_id=7, did=1):
    return Departure(
        stop_id=1, route_id=route_id, route_type=route_type, route_number="96", route_name="r",
        run_ref=run, direction_id=did, direction_name=direction, destination="Dest",
        final_stop_id=final, scheduled_ts=sched, estimated_ts=est, platform=None,
        at_platform=False, cancelled=False,
    )  # fmt: skip


def finals_store(transit_store_file):
    stops = [
        {"id": 10, "mode": "tram", "name": "East", "poles": [[LAT, LON + dlon(2000), []]],
         "gtfs_ids": [], "routes": []},
        {"id": 11, "mode": "tram", "name": "West", "poles": [[LAT, LON - dlon(2000), []]],
         "gtfs_ids": [], "routes": []},
    ]  # fmt: skip
    st = TransitStore(transit_store_file(stops))
    st.load()
    return st


def test_direction_group_by_bearing(transit_store_file):
    st = finals_store(transit_store_file)
    deps = [
        dep("w1", final=11, sched=10), dep("e1", final=10, sched=5),
        dep("e2", final=10, sched=50), dep("w2", final=11, sched=60),
    ]  # fmt: skip
    g = direction_group(LAT, LON, deps, st)
    assert g["e1"] == "a" and g["e2"] == "a"  # soonest run's side is always "a"
    assert g["w1"] == "b" and g["w2"] == "b"


def test_direction_group_unknown_final_falls_back(transit_store_file):
    st = finals_store(transit_store_file)
    g = direction_group(LAT, LON, [dep("u", final=999, route_id=96, did=5)], st)
    assert g == {"u": "r96:5"}
    assert direction_group(LAT, LON, [dep("v", final=None, route_id=3, did=0)], st) == {"v": "r3:0"}


def test_direction_group_trains(transit_store_file):
    st = finals_store(transit_store_file)
    deps = [
        dep("c", route_type=0, direction="Flinders Street"),
        dep("c2", route_type=0, direction="Synthetic City"),
        dep("o", route_type=0, direction="Synthetic Outer"),
    ]
    assert direction_group(LAT, LON, deps, st) == {"c": "city", "c2": "city", "o": "out"}


# --- service --------------------------------------------------------------------------------


def test_attach_http(transit_store_file):
    st = TransitStore(transit_store_file([]))
    st.load()
    s = TransitService(st, None, None)
    s.attach_http(object())
    assert s.client is None and s.source is None and s.ptv_state == "no_key"
    s2 = TransitService(st, DEVID, KEY)
    assert s2.client is None
    s2.attach_http(httpx.AsyncClient())
    assert s2.client is not None and s2.source is not None and s2.ptv_state == "idle"
    assert DEVID not in repr(s2) and KEY not in repr(s2)


# --- provider -------------------------------------------------------------------------------

FIX = "departures_tram.json"


class RT:
    def __init__(self):
        self.nudges = []

    def nudge(self, pid):
        self.nudges.append(pid)


class Harness:
    def __init__(self, tmp_path, transit_store_file, creds=True):
        stops = [
            {"id": 2720, "mode": "tram", "name": "Synthetic Mall/Synthetic St #3",
             "poles": [[LAT + dlat(27), LON, ["721:5", "721:6"]]], "gtfs_ids": ["2720"],
             "routes": ["96"]},
            {"id": 3001, "mode": "tram", "name": "Far East",
             "poles": [[LAT, LON + dlon(3000), []]], "gtfs_ids": [], "routes": []},
        ]  # fmt: skip
        st = TransitStore(transit_store_file(stops))
        st.load()
        self.now = T0
        self.service = TransitService(st, DEVID if creds else None, KEY if creds else None)
        self.http = httpx.AsyncClient()
        self.service.attach_http(self.http)
        self.provider = TransitDeparturesProvider(self.service)
        self.rt = RT()
        self.store = Store(tmp_path / "p.db")
        self.ctx = ProviderContext(
            settings=None, clock=lambda: self.now, store=self.store, http=self.http, runtime=self.rt
        )

    def query(self):
        return self.provider.query(self.ctx, LAT, LON, self.now)


@pytest.fixture
def h(tmp_path, transit_store_file):
    return Harness(tmp_path, transit_store_file)


def fixture_json(name=FIX):
    from pathlib import Path

    return json.loads((Path(__file__).parent / "fixtures" / "ptv" / name).read_text())


def test_meta():
    m = TransitDeparturesProvider.meta
    assert (m.id, m.tier, m.ttl_s, m.stale_after_s, m.interval_s) == (
        "transit_departures", "polled", 30, 120, 30,
    )  # fmt: skip
    assert m.exact_location_only is True and m.attribution == ATTRIBUTION


@respx.mock
async def test_no_key_no_calls_no_nudge(tmp_path, transit_store_file):
    h = Harness(tmp_path, transit_store_file, creds=False)
    route = respx.route().mock(return_value=httpx.Response(200, json={}))
    layer = h.query()
    assert layer.status == "pending" and layer.items == []
    await h.provider.refresh(h.ctx)
    assert route.call_count == 0 and h.rt.nudges == []


@respx.mock
async def test_empty_watch_set_no_calls(h):
    route = respx.route().mock(return_value=httpx.Response(200, json={}))
    await h.provider.refresh(h.ctx)
    assert route.call_count == 0


@respx.mock
async def test_refresh_caches_and_query_serves(h):
    route = respx.route().mock(return_value=httpx.Response(200, json=fixture_json()))
    first = h.query()
    assert first.status == "pending" and first.items == []
    assert h.rt.nudges == ["transit_departures"]
    await h.provider.refresh(h.ctx)
    assert route.call_count == 1
    assert "/stop/2720?" in str(route.calls[0].request.url)
    assert h.store.get_layer("transit", "dep:2720") is not None
    assert h.service.ptv_state == "ok" and h.service.last_live_ts == T0
    h.now = T0 + 10
    layer = h.query()
    assert layer.status == "fresh" and layer.as_of == T0
    assert h.rt.nudges == ["transit_departures"]  # cache present: no second nudge
    ids = [i.id for i in layer.items]
    assert ids and all(i.startswith("dep:2720:") for i in ids)
    want = [f"dep:2720:{run_key(r)}" for r in ("R-T1", "R-T2", "R-T3", "R-T4")]
    assert ids == want[: len(ids)]
    by = {i.id: i for i in layer.items}
    t1 = by[f"dep:2720:{run_key('R-T1')}"]
    assert t1.detail["live"] is True and t1.detail["delay_s"] == 90
    assert t1.target_ts == T0 + 90 and t1.detail["scheduled_ts"] == T0
    assert t1.detail["disruption_ids"] == [9001] and t1.verb == "departs"
    assert t1.group in ("2720:a", "2720:b") or t1.group.startswith("2720:r")
    assert t1.kind == "transit_vehicle" and t1.geom is None and t1.stale_after_s == 120
    assert t1.detail["walk_s"] > 0 and t1.detail["stop_id"] == 2720
    assert t1.detail["mode"] == "tram" and t1.name.startswith("Tram 96 to ")
    t2 = by[f"dep:2720:{run_key('R-T2')}"]
    assert t2.detail["live"] is False and t2.detail["delay_s"] is None
    blob = json.dumps(layer.model_dump())
    assert "vehicle_descriptor" not in blob and "operator" not in blob
    assert "R-T1" not in blob and "run_ref" not in blob  # review WR-S7: no raw run refs
    assert DEVID not in blob and KEY not in blob and "signature" not in blob


@respx.mock
async def test_old_items_dropped_and_capped(h):
    deps = [
        {"stop_id": 2720, "route_id": 721, "run_ref": f"R{i}", "direction_id": 5,
         "scheduled_departure_utc": "2026-11-13T01:00:00Z"} for i in range(40)
    ]  # fmt: skip
    deps[0]["scheduled_departure_utc"] = "2026-11-13T00:50:00Z"
    js = {"departures": deps, "routes": {"721": {"route_id": 721, "route_type": 1}}}
    respx.route().mock(return_value=httpx.Response(200, json=js))
    h.query()
    await h.provider.refresh(h.ctx)
    items = h.query().items
    assert len(items) == 30 and f"dep:2720:{run_key('R0')}" not in [i.id for i in items]
    assert [i.target_ts for i in items] == sorted(i.target_ts for i in items)


@respx.mock
async def test_stale_after_120(h):
    respx.route().mock(return_value=httpx.Response(200, json=fixture_json()))
    h.query()
    await h.provider.refresh(h.ctx)
    h.now = T0 + 121
    assert h.query().status == "stale"


@respx.mock
async def test_total_failure_raises_and_logs_safely(h, caplog):
    caplog.set_level(logging.DEBUG)
    respx.route().mock(return_value=httpx.Response(403))
    h.query()
    with pytest.raises(Exception) as ei:
        await h.provider.refresh(h.ctx)
    assert getattr(ei.value, "kind", None) == "http_403"
    assert h.service.ptv_state == "error"
    text = " ".join(r.getMessage() for r in caplog.records if not r.name.startswith("httpx"))
    assert "provider=transit_departures" in text and "PtvError" in text and "http_403" in text
    for bad in (DEVID, KEY, "signature", "timetableapi", "2720", "-37"):
        assert bad.lower() not in text.lower()


@respx.mock
async def test_partial_failure_keeps_ok(h):
    # watch both stops: the second query point is near stop 3001 only by touching directly
    h.service.watch.touch([StopRef(2720, 1), StopRef(3001, 1)], h.now)

    def handler(request):
        if "/stop/3001" in str(request.url):
            return httpx.Response(500)
        return httpx.Response(200, json=fixture_json())

    respx.route().mock(side_effect=handler)
    await h.provider.refresh(h.ctx)
    assert h.service.ptv_state == "ok"
    assert h.store.get_layer("transit", "dep:2720") is not None
    assert h.store.get_layer("transit", "dep:3001") is None


@respx.mock
async def test_revisit_with_old_cache_nudges(h):
    # review WR-S2: a stop that left the watch set and comes back with an hours-old cache
    respx.route().mock(return_value=httpx.Response(200, json=fixture_json()))
    h.query()
    await h.provider.refresh(h.ctx)
    h.rt.nudges.clear()
    h.now = T0 + 3 * 3600  # watch entry expired; cache is far older than STALE_AFTER_S
    h.query()
    assert h.rt.nudges == ["transit_departures"]
    h.rt.nudges.clear()
    h.query()  # still watched now: no repeat nudge
    assert h.rt.nudges == []


@respx.mock
async def test_nudge_fetches_only_new_uncached_stops(h):
    # review WR-S3: a nudge must not re-sweep every watched stop
    route = respx.route().mock(return_value=httpx.Response(200, json=fixture_json()))
    h.service.watch.touch([StopRef(3001, 1)], h.now)  # already watched (far away)
    h.query()  # 2720 is new and uncached: flagged for the nudge
    assert h.rt.nudges == ["transit_departures"]
    assert await h.provider.nudge_refresh(h.ctx) is True
    assert [str(c.request.url).split("/stop/")[1].split("?")[0] for c in route.calls] == ["2720"]
    assert await h.provider.nudge_refresh(h.ctx) is False  # flags were consumed
    assert route.call_count == 1
    await h.provider.refresh(h.ctx)  # the poll still covers the whole watch set
    assert route.call_count == 3

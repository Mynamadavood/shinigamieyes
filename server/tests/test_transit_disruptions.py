"""Transit disruptions: severity classifier and provider. FAKE keys only."""

import json
import logging
from pathlib import Path

import httpx
import pytest
import respx
from shinigami.providers.base import ProviderContext
from shinigami.providers.transit import (
    MAX_DISRUPTIONS,
    TransitDeparturesProvider,
    TransitDisruptionsProvider,
)
from shinigami.store import Store
from shinigami.transit.service import ATTRIBUTION, TransitService
from shinigami.transit.severity import RED_PATTERNS, classify_disruption
from shinigami.transit.store import TransitStore

DEVID = "1000001"
KEY = "00000000-0000-0000-0000-000000000000"
LAT, LON = -37.0, 144.0
T0 = 1794531600.0  # 2026-11-13T01:00:00Z


def dlat(m):
    return m / 111_195.0


# --- classifier ------------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("dtype", "title", "desc", "want"),
    [
        ("Service Suspended", "Route 96 suspended between X and Y", "", 3),
        ("Planned Works", "Buses replace trains Hurstbridge line", "", 3),
        (None, "Stop closed", None, 3),
        ("Minor Delays", "Delays up to 10 min", "", 0),
        ("Planned Works", "Detour via Smith St", "", 0),
        ("Planned Works", "Works", "Replacement buses operate", 3),
        (None, None, None, 0),
        ("Something Else", "Odd", "words", 0),
        ("PLANNED WORKS", "SERVICE CANCELLED", "", 3),
        ("Planned Works", "Works", "service suspended in text", 0),
        # review WR-S5: detours, facility closures and hedged cancellations stay white (D-17)
        ("Route Diversion", "Route 246: Detour due to road closure", "", 0),
        ("Planned Works", "Lift closure at Richmond", "", 0),
        (None, "Lift at Richmond Station closed", None, 0),
        ("Planned Works", "Car park closed", "", 0),
        ("Minor Delays", "Some services may be cancelled", "", 0),
        ("Planned Works", "Road closure on Smith St", "", 0),
        ("Stop Closure", "Synthetic Rd stop closure", "", 3),
        ("Planned Works", "Station closed for works", "", 3),
        ("Planned Works", "Detour: buses replace trams", "", 3),
        ("Service Change", "No trams between X and Y", "", 3),
        ("Planned Works", "Trains cancelled tonight", "", 3),
    ],
)
def test_classify_table(dtype, title, desc, want):
    assert classify_disruption(dtype, title, desc) == want


def test_red_patterns_lowercase():
    assert all(p == p.lower() for p in RED_PATTERNS)


# --- provider --------------------------------------------------------------------------------


class RT:
    def __init__(self):
        self.nudges = []

    def nudge(self, pid):
        self.nudges.append(pid)


def fixture_json(name="disruptions.json"):
    return json.loads((Path(__file__).parent / "fixtures" / "ptv" / name).read_text())


class Harness:
    def __init__(self, tmp_path, transit_store_file, creds=True):
        stops = [
            {"id": 2720, "mode": "tram", "name": "Synthetic Mall/Synthetic St #3",
             "poles": [[LAT + dlat(27), LON, ["721:5"]]], "gtfs_ids": ["2720"],
             "routes": ["96"]},
        ]  # fmt: skip
        st = TransitStore(transit_store_file(stops))
        st.load()
        self.now = T0
        self.service = TransitService(st, DEVID if creds else None, KEY if creds else None)
        self.http = httpx.AsyncClient()
        self.service.attach_http(self.http)
        self.deps = TransitDeparturesProvider(self.service)
        self.provider = TransitDisruptionsProvider(self.service)
        self.rt = RT()
        self.store = Store(tmp_path / "p.db")
        self.ctx = ProviderContext(
            settings=None, clock=lambda: self.now, store=self.store, http=self.http, runtime=self.rt
        )

    def query(self):
        self.deps.query(self.ctx, LAT, LON, self.now)  # touches the watch set like a profile
        return self.provider.query(self.ctx, LAT, LON, self.now)

    def put_deps(self, route_id=721, at=None):
        payload = {
            "departures": [
                {"route_id": route_id, "estimated_ts": None, "scheduled_ts": T0 - 9999.0}
            ],
            "positions": {},
        }
        self.store.put_layer("transit", "dep:2720", payload, at if at is not None else self.now)


@pytest.fixture
def h(tmp_path, transit_store_file):
    return Harness(tmp_path, transit_store_file)


def test_meta():
    m = TransitDisruptionsProvider.meta
    assert (m.id, m.tier, m.ttl_s, m.stale_after_s, m.interval_s) == (
        "transit_disruptions", "polled", 300, 600, 300,
    )  # fmt: skip
    assert m.exact_location_only is True and m.attribution == ATTRIBUTION


@respx.mock
async def test_no_key_zero_calls_pending(tmp_path, transit_store_file):
    h = Harness(tmp_path, transit_store_file, creds=False)
    route = respx.route().mock(return_value=httpx.Response(200, json={}))
    assert h.query().status == "pending"
    await h.provider.refresh(h.ctx)
    assert route.call_count == 0 and h.rt.nudges == []


@respx.mock
async def test_empty_watch_zero_calls(h):
    route = respx.route().mock(return_value=httpx.Response(200, json={}))
    await h.provider.refresh(h.ctx)
    assert route.call_count == 0


@respx.mock
async def test_refresh_one_call_cached(h):
    route = respx.route().mock(return_value=httpx.Response(200, json=fixture_json()))
    h.query()
    await h.provider.refresh(h.ctx)
    assert route.call_count == 1
    req = route.calls[0].request
    assert req.url.path == "/v3/disruptions"
    assert req.url.query.decode().startswith("route_types=0&route_types=1&route_types=2")
    got = h.store.get_layer("transit", "disruptions")
    assert got is not None and len(got[0]["disruptions"]) == 3


async def _fresh(h):
    with respx.mock:
        respx.route().mock(return_value=httpx.Response(200, json=fixture_json()))
        h.query()
        await h.provider.refresh(h.ctx)


async def test_filter_by_route_and_items(h):
    await _fresh(h)
    h.put_deps(route_id=721)
    layer = h.query()
    assert layer.status == "fresh"
    ids = [i.id for i in layer.items]
    # 9001 (route 721, Current, to null); 9002 (route 31) and 9003 (other route) excluded
    assert ids == ["dis:9001"]
    it = layer.items[0]
    assert it.severity == 0 and it.target_ts is None and it.stale_after_s == 600
    assert it.layer == "transit_disruptions" and it.group == "disruption"
    d = it.detail
    assert d["status"] == "Current" and d["service_stopped"] is False
    assert d["route_labels"] and d["stop_names"] == ["Synthetic Mall"]
    assert "url" not in d and "description" not in it.name


async def test_filter_by_stop_id(h):
    await _fresh(h)
    h.put_deps(route_id=5)  # unrelated route; stop id 2720 matches disruption 9001 stops
    assert [i.id for i in h.query().items] == ["dis:9001"]


async def test_window_and_order(h):
    from shinigami.transit.model import Disruption

    h.query()
    h.put_deps(route_id=721)

    def mk(i, status, dtype, title, frm, to, upd):
        return {
            "id": i, "title": title, "description": "", "status": status, "dtype": dtype,
            "updated_ts": upd, "from_ts": frm, "to_ts": to, "route_ids": [721],
            "route_labels": ["Tram 96"], "stop_ids": [], "stop_names": [], "modes": ["tram"],
        }  # fmt: skip

    rows = [
        mk(1, "Current", "Delays", "old", None, T0 - 10, 1),  # ended: dropped
        mk(2, "Current", "Delays", "open", None, None, 5),
        mk(3, "Current", "Delays", "ends soon", None, T0 + 100, 3),
        mk(4, "Planned", "Works", "soon", T0 + 3600, T0 + 7200, 4),
        mk(5, "Planned", "Works", "later", T0 + 90_000, None, 4),  # >24 h: dropped
        mk(6, "Current", "Service Suspended", "stopped", None, T0 + 9999, 2),
    ]
    assert Disruption  # payload is plain dict; model import proves contract names exist
    h.store.put_layer("transit", "disruptions", {"disruptions": rows}, T0)
    layer = h.query()
    assert [i.id for i in layer.items] == ["dis:6", "dis:3", "dis:4", "dis:2"]
    assert layer.items[0].severity == 3 and layer.items[0].detail["service_stopped"] is True
    assert layer.items[1].target_ts == T0 + 100


async def test_cap_and_truncation(h):
    h.query()
    h.put_deps(route_id=721)
    rows = [
        {
            "id": i, "title": "T" * 300, "description": "D" * 900, "status": "Current",
            "dtype": "Delays", "updated_ts": float(i), "from_ts": None, "to_ts": None,
            "route_ids": [721], "route_labels": [], "stop_ids": [], "stop_names": [], "modes": [],
        }
        for i in range(10)
    ]  # fmt: skip
    h.store.put_layer("transit", "disruptions", {"disruptions": rows}, T0)
    items = h.query().items
    assert len(items) == MAX_DISRUPTIONS == 6
    assert len(items[0].name) == 160
    assert len(items[0].detail["description"]) == 400


async def test_pending_and_stale(h):
    h.query()
    assert h.query().status == "pending"  # nothing cached
    h.put_deps()
    assert h.query().status == "pending"  # departures but no disruptions
    h.store.put_layer("transit", "disruptions", {"disruptions": []}, T0)
    assert h.query().status == "fresh"
    h.now = T0 + 601
    h.put_deps(at=h.now)
    assert h.query().status == "stale"


@respx.mock
async def test_failure_logs_safely_and_raises(h, caplog):
    caplog.set_level(logging.DEBUG)
    respx.route().mock(return_value=httpx.Response(500))
    h.query()
    with pytest.raises(Exception) as ei:
        await h.provider.refresh(h.ctx)
    assert getattr(ei.value, "kind", None) == "http_5xx"
    text = " ".join(r.getMessage() for r in caplog.records if not r.name.startswith("httpx"))
    assert "refresh failed provider=transit_disruptions err=PtvError kind=http_5xx" in text
    for bad in (DEVID, KEY, "signature", "timetableapi", "2720", "-37"):
        assert bad.lower() not in text.lower()


async def test_nudge_on_new_ref_and_missing_cache(h):
    h.query()  # new watch ref, no caches
    assert h.rt.nudges.count("transit_disruptions") == 1
    # same stop again: no new ref; departures cache exists but no disruptions cache -> nudge
    h.put_deps()
    h.rt.nudges.clear()
    h.query()
    assert h.rt.nudges == ["transit_disruptions"]
    # disruptions cache present and no new ref -> no nudge
    h.store.put_layer("transit", "disruptions", {"disruptions": []}, T0)
    h.rt.nudges.clear()
    h.query()
    assert "transit_disruptions" not in h.rt.nudges


async def test_no_key_never_nudges(tmp_path, transit_store_file):
    h = Harness(tmp_path, transit_store_file, creds=False)
    h.query()
    assert h.rt.nudges == []

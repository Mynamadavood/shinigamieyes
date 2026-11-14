"""PtvClient tests. FAKE credentials only; respx only, no real PTV calls."""

import asyncio
import logging

import httpx
import pytest
import respx
import shinigami.main  # noqa: F401  (sets the httpx logger to WARNING)
from shinigami.transit.ptv_client import PtvClient, PtvError, sign_path

DEVID = "1000001"
KEY = "00000000-0000-0000-0000-000000000000"
EMPTY = {"departures": [], "stops": {}, "routes": {}, "runs": {}, "directions": {}}


def client(http, **kw):
    return PtvClient(http, DEVID, KEY, **kw)


@respx.mock
async def test_departures_url_is_signed_message_exactly():
    seen = []

    def handler(request):
        seen.append(str(request.url))
        return httpx.Response(200, json=EMPTY)

    respx.route().mock(side_effect=handler)
    async with httpx.AsyncClient() as http:
        await client(http).departures(1, 2720, max_results=20)
        await client(http).departures(1, 2720, max_results=20, include_cancelled=True)
    base = (
        "/v3/departures/route_type/1/stop/2720?max_results=20&expand=Run&expand=Route"
        "&expand=Direction&expand=Disruption&expand=VehiclePosition"
    )
    assert seen[0] == sign_path(base, DEVID, KEY)
    assert seen[1] == sign_path(base + "&include_cancelled=true", DEVID, KEY)


@pytest.mark.parametrize(
    "mock,kind",
    [
        (httpx.Response(403), "http_403"),
        (httpx.Response(404), "http_404"),
        (httpx.Response(429), "http_429"),
        (httpx.Response(500), "http_5xx"),
        (httpx.Response(418), "http_other"),
        (httpx.ReadTimeout("boom"), "timeout"),
        (httpx.ConnectError("boom"), "network"),
        (httpx.Response(200, content=b"{" + b" " * 3_000_000 + b"}"), "too_large"),
        (httpx.Response(200, content=b"<html>"), "bad_json"),
    ],
)
@respx.mock
async def test_error_kinds_and_no_chain(mock, kind):
    if isinstance(mock, Exception):
        respx.route().mock(side_effect=mock)
    else:
        respx.route().mock(return_value=mock)
    async with httpx.AsyncClient() as http:
        with pytest.raises(PtvError) as ei:
            await client(http).departures(1, 2720)
    err = ei.value
    assert err.kind == kind and str(err) == kind
    assert err.__cause__ is None and err.__suppress_context__ is True


@respx.mock
async def test_rate_guard_blocks_61st_without_http():
    route = respx.route().mock(return_value=httpx.Response(200, json=EMPTY))
    now = [100.0]
    async with httpx.AsyncClient() as http:
        c = client(http, clock=lambda: now[0])
        for _ in range(60):
            await c.departures(1, 2720)
        assert route.call_count == 60
        with pytest.raises(PtvError) as ei:
            await c.departures(1, 2720)
        assert ei.value.kind == "rate_guard" and route.call_count == 60
        now[0] += 61
        await c.departures(1, 2720)
        assert route.call_count == 61


@respx.mock
async def test_at_most_four_in_flight():
    live = {"now": 0, "peak": 0}

    async def handler(request):
        live["now"] += 1
        live["peak"] = max(live["peak"], live["now"])
        await asyncio.sleep(0.01)
        live["now"] -= 1
        return httpx.Response(200, json=EMPTY)

    respx.route().mock(side_effect=handler)
    async with httpx.AsyncClient() as http:
        c = client(http)
        await asyncio.gather(*(c.departures(1, 2720) for _ in range(12)))
    assert live["peak"] <= 4


@respx.mock
async def test_nothing_leaks_to_logs(caplog):
    caplog.set_level(logging.DEBUG)
    respx.route().mock(return_value=httpx.Response(403))
    async with httpx.AsyncClient() as http:
        with pytest.raises(PtvError):
            await client(http).departures(1, 2720)
    text = caplog.text.lower()
    for needle in (DEVID, KEY, "signature", "timetableapi"):
        assert needle.lower() not in text
    assert logging.getLogger("httpx").getEffectiveLevel() >= logging.WARNING


# ---- parsing against schema-derived fixtures (D-24) ----
import json
from datetime import UTC, datetime
from pathlib import Path

from shinigami.transit.model import (
    parse_departures,
    parse_disruptions,
    parse_pattern,
)

FIX = Path(__file__).parent / "fixtures" / "ptv"


def load(name):
    return json.loads((FIX / name).read_text(encoding="utf-8"))


def epoch(s):
    return datetime.fromisoformat(s).replace(tzinfo=UTC).timestamp()


def test_every_fixture_is_labelled():
    for p in FIX.glob("*.json"):
        assert "schema-derived" in load(p.name)["_fixture"]
    assert "schema-derived" in (FIX / "README.md").read_text(encoding="utf-8")


def test_tram_departures_live_and_scheduled_only():
    sd = parse_departures(load("departures_tram.json"), 1)
    # the null run_ref, bad time and null stop rows are skipped individually
    assert [d.run_ref for d in sd.departures] == ["R-T1", "R-T2", "R-T3", "R-T4"]
    t1, t2, t3, _t4 = sd.departures
    assert t1.estimated_ts == epoch("2026-11-13T01:01:30") and t1.scheduled_ts == epoch(
        "2026-11-13T01:00:00"
    )
    assert t2.estimated_ts is None
    assert t3.estimated_ts < t3.scheduled_ts
    assert (t1.route_number, t1.route_name) == ("96", "Synthetic Town - Synthetic Park")
    assert (t1.destination, t1.direction_name) == ("Synthetic Park", "Synthetic Park")
    assert t1.disruption_ids == (9001,) and t1.route_type == 1 and not t1.cancelled
    assert {d.route_number for d in sd.departures} == {"96", "109"}
    assert sd.positions == {}


def test_train_platform_and_cancelled():
    sd = parse_departures(load("departures_train.json"), 0)
    a, b, c = sd.departures
    assert a.platform == "4" and a.at_platform is True and not a.cancelled
    assert b.at_platform is False and b.estimated_ts is None
    assert c.cancelled is True
    assert sd.positions == {}  # no train markers (D-20)


def test_bus_position_and_no_vehicle_identifiers():
    sd = parse_departures(load("departures_bus.json"), 2)
    assert list(sd.positions) == ["R-B1"]
    p = sd.positions["R-B1"]
    assert (p.lat, p.lon, p.ts) == (-37.5, 144.5, epoch("2026-11-13T01:01:45"))
    text = repr(sd).lower()
    for needle in ("operator-synth", "vehicle-synth", "descriptor"):
        assert needle not in text


def test_departures_capped_and_tolerant():
    rows = [
        {
            "stop_id": 1,
            "route_id": 1,
            "run_ref": f"r{i}",
            "scheduled_departure_utc": "2026-11-13T01:00:00Z",
        }
        for i in range(100)
    ]
    assert len(parse_departures({"departures": rows}, 1).departures) == 60
    assert parse_departures({}, 1).departures == ()
    assert parse_departures({"departures": [None, 5, "x"], "runs": [1]}, 1).departures == ()


def test_pattern_in_sequence():
    ps = parse_pattern(load("pattern_tram.json"), 1)
    assert [s.stop_id for s in ps] == [3101, 3102, 3103]  # stop with lat 0 skipped
    assert ps[0].ts == epoch("2026-11-13T01:01:00")  # estimated wins
    assert ps[1].ts == epoch("2026-11-13T01:03:00")  # else scheduled
    assert (ps[0].lat, ps[0].lon) == (-37.7001, 144.7001)


def test_disruptions_flatten_and_labels():
    ds = parse_disruptions(load("disruptions.json"))
    assert [d.id for d in ds] == [9001, 9002, 9003]  # regional / ferry ignored, dup dropped
    d1, d2, d3 = ds
    assert d1.to_ts is None and d1.from_ts == epoch("2026-11-12T20:00:00")
    assert d1.route_labels == ("Tram 96",) and d1.modes == frozenset({"Tram"})
    assert d2.route_labels == ("Train · Hurstbridge line",) and d2.to_ts is not None
    assert d3.route_labels == ("Bus 907",) and d3.stop_names == ("Synthetic Uni",)
    assert d1.updated_ts == epoch("2026-11-13T00:30:00")


@respx.mock
async def test_client_methods_parse_fixtures():
    def route(path_re, name):
        respx.get(url__regex=path_re).mock(
            return_value=httpx.Response(200, content=(FIX / name).read_bytes())
        )

    route(r".*/v3/departures/route_type/1/.*", "departures_tram.json")
    route(r".*/v3/pattern/run/.*", "pattern_tram.json")
    route(r".*/v3/disruptions\?.*", "disruptions.json")
    route(r".*/v3/stops/location/.*", "stops_location.json")
    async with httpx.AsyncClient() as http:
        c = client(http)
        assert len((await c.departures(1, 2720)).departures) == 4
        assert len(await c.pattern("R-T1", 1)) == 3
        assert len(await c.disruptions()) == 3
        assert await c.stops_near(-37.8, 144.9, (0, 1), 800) == [2720, 1900]

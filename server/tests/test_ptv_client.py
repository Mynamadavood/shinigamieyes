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

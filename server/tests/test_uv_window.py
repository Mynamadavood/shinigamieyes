import json
from pathlib import Path

import httpx
import pytest
import respx
from shinigami.geo import snap_cell
from shinigami.providers.base import ProviderContext
from shinigami.providers.uv_window import URL, UvWindowProvider, uv_boundaries
from shinigami.store import Store

FIX = json.loads((Path(__file__).parent / "fixtures" / "open_meteo_uv.json").read_text())
T0 = FIX["hourly"]["time"][0]  # 2026-11-05T00:00Z
NOW = T0 + 6 * 3600
LAT, LON = -37.8136, 144.9631


def ctx_for(tmp_path, now=NOW):
    return ProviderContext(
        settings=None, clock=lambda: now, store=Store(tmp_path / "u.db"), http=httpx.AsyncClient()
    )


def test_boundaries_basic():
    times = [h * 3600 for h in range(9, 19)]
    uv = [2.6, 4.4, 5.0, 5.5, 5.8, 5.5, 5.0, 4.5, 4.7, 2.9]
    # 10 values: 09..18 ; 4.7 @17:00, 2.9 @18:00
    b = uv_boundaries(times, uv)
    assert [v for v, _ in b] == ["starts", "ends"]
    assert abs(b[0][1] - (9 * 3600 + (3 - 2.6) / (4.4 - 2.6) * 3600)) < 1
    assert 17 * 3600 + 3300 < b[1][1] < 17 * 3600 + 3700


def test_boundaries_never_reaches():
    assert uv_boundaries([0, 3600, 7200], [1.0, 2.0, 2.9]) == []


def test_boundaries_starts_above():
    b = uv_boundaries([0, 3600, 7200], [5.0, 4.0, 1.0])
    assert [v for v, _ in b] == ["ends"]


@respx.mock
async def test_fetch_and_query(tmp_path):
    route = respx.get(URL).respond(200, json=FIX)
    ctx = ctx_for(tmp_path)
    p = UvWindowProvider()
    cell = snap_cell(LAT, LON)
    await p.fetch_cell(ctx, cell)
    params = route.calls.last.request.url.params
    assert float(params["latitude"]) == cell.lat and float(params["longitude"]) == cell.lon
    assert params["hourly"] == "uv_index_clear_sky"
    assert params["timezone"] == "UTC" and params["timeformat"] == "unixtime"
    assert params["forecast_days"] == "3"
    layer = p.query(ctx, LAT, LON, NOW)
    assert layer.id == "uv_window" and layer.status == "fresh"
    assert layer.items
    for it in layer.items:
        assert it.group == "uv_window" and it.verb in ("starts", "until")
        assert it.name == ("UV protection starts" if it.verb == "starts" else "UV protection until")
        assert NOW <= it.target_ts <= NOW + 36 * 3600
        assert it.detail == {"approx": True, "basis": "clear-sky UV ≥ 3", "estimated": False}
        assert it.stale_after_s == 21600
        assert it.id.startswith(f"uv_window:{it.verb}:")
    # first boundary after 06:00Z is the evening drop below 3 (~06:57Z)
    assert layer.items[0].verb == "until"
    assert abs(layer.items[0].target_ts - (T0 + 6 * 3600 + 3600 * (4.7 - 3) / (4.7 - 2.9))) < 1


def test_pending_no_network(tmp_path):
    layer = UvWindowProvider().query(ctx_for(tmp_path), LAT, LON, NOW)
    assert layer.status == "pending" and layer.items == []


@respx.mock
@pytest.mark.parametrize("failure", ["500", "timeout"])
async def test_estimate_fallback(tmp_path, failure):
    if failure == "500":
        respx.get(URL).respond(500)
        exc = httpx.HTTPStatusError
    else:
        respx.get(URL).mock(side_effect=httpx.ConnectTimeout("t"))
        exc = httpx.ConnectTimeout
    ctx = ctx_for(tmp_path)
    p = UvWindowProvider()
    with pytest.raises(exc):
        await p.fetch_cell(ctx, snap_cell(LAT, LON))
    layer = p.query(ctx, LAT, LON, NOW)
    assert layer.items
    assert all(i.detail["estimated"] is True for i in layer.items)
    assert "Estimated" in layer.attribution


@respx.mock
async def test_failure_keeps_existing_cache(tmp_path):
    ctx = ctx_for(tmp_path)
    p = UvWindowProvider()
    cell = snap_cell(LAT, LON)
    ctx.store.put_layer("uv_window", cell.id, {"boundaries": [["ends", NOW + 100]]}, NOW - 10)
    respx.get(URL).respond(500)
    with pytest.raises(httpx.HTTPStatusError):
        await p.fetch_cell(ctx, cell)
    layer = p.query(ctx, LAT, LON, NOW)
    assert [i.detail["estimated"] for i in layer.items] == [False]


async def test_stale_after_ttl(tmp_path):
    ctx = ctx_for(tmp_path)
    cell = snap_cell(LAT, LON)
    ctx.store.put_layer(
        "uv_window", cell.id, {"boundaries": [["ends", NOW + 20000]], "estimated": False}, NOW
    )
    p = UvWindowProvider()
    assert p.query(ctx, LAT, LON, NOW + 10799).status == "fresh"
    assert p.query(ctx, LAT, LON, NOW + 10801).status == "stale"

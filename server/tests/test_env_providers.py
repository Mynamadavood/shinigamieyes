"""Phase 4 environment providers: weather + rain countdown, CFA fire danger, pollen/asthma."""

from datetime import datetime
from pathlib import Path

import httpx
import pytest
import respx
from shinigami.geo import snap_cell
from shinigami.providers import fire, pollen, weather
from shinigami.providers.arpansa import level as uv_level
from shinigami.providers.base import ProviderContext
from shinigami.store import Store

FIX = Path(__file__).parent / "fixtures"
LAT, LON = -37.8136, 144.9631
T0 = 1795734900.0  # first 15-minute slot of the recorded Open-Meteo response


def ctx_for(tmp_path, now):
    return ProviderContext(
        settings=None, clock=lambda: now, store=Store(tmp_path / "e.db"), http=httpx.AsyncClient()
    )


def melb(y, m, d, h=12):
    return datetime(y, m, d, h, tzinfo=fire.TZ).timestamp()


# weather ------------------------------------------------------------------
def om_payload(mm):
    return {
        "current": {
            "time": T0, "temperature_2m": 21.7, "apparent_temperature": 23.5,
            "weather_code": 51, "precipitation": mm[0],
        },
        "minutely_15": {"time": [T0 + i * 900 for i in range(len(mm))], "precipitation": mm},
    }


def test_rain_change():
    times = [T0 + i * 900 for i in range(6)]
    assert weather.rain_change(times, [0, 0, 0.5, 0.5, 0, 0], T0 + 60) == (False, T0 + 1800)
    assert weather.rain_change(times, [0.3, 0.3, 0, 0, 0, 0], T0 + 60) == (True, T0 + 1800)
    assert weather.rain_change(times, [0] * 6, T0) == (False, None)
    # the slot that holds "now" decides wet_now, even part-way through it
    assert weather.rain_change(times, [0.3, 0, 0, 0, 0, 0], T0 + 899) == (True, T0 + 900)
    assert weather.rain_change(times, [0] * 6, T0 + 99999) is None


@respx.mock
async def test_weather_fetch_and_query(tmp_path):
    mm = [0.0] * 8 + [0.5] * 16
    route = respx.get(weather.URL).respond(200, json=om_payload(mm))
    ctx = ctx_for(tmp_path, T0 + 60)
    p = weather.WeatherProvider()
    cell = snap_cell(LAT, LON)
    await p.fetch_cell(ctx, cell)
    q = route.calls.last.request.url.params
    # privacy: only the cell centre leaves the box
    assert float(q["latitude"]) == cell.lat and float(q["longitude"]) == cell.lon
    layer = p.query(ctx, LAT, LON, T0 + 60)
    assert layer.status == "fresh"
    now_item, rain = layer.items
    assert now_item.detail["display"] == "22° · Drizzle" and now_item.detail["chip"] is True
    assert now_item.detail["link"] == weather.RADAR_URL and now_item.target_ts is None
    assert rain.name == "Rain starts" and rain.target_ts == T0 + 8 * 900
    # later, while it is raining, the same data says when it ends: never, inside 6 h
    later = p.query(ctx, LAT, LON, T0 + 9 * 900)
    assert later.items[1].name == "Rain ends" and later.items[1].target_ts is None
    assert later.items[1].detail["display"] == "raining, 6 h+"


async def test_weather_pending_and_stale(tmp_path):
    ctx = ctx_for(tmp_path, T0)
    p = weather.WeatherProvider()
    assert p.query(ctx, LAT, LON, T0).status == "pending"
    payload = {"temp": 10.0, "feels": 8.0, "code": 3, "times": [T0], "mm": [0.0]}
    ctx.store.put_layer("weather", snap_cell(LAT, LON).id, payload, T0)
    assert p.query(ctx, LAT, LON, T0 + 3 * weather.TTL_S).status == "stale"


@respx.mock
async def test_weather_upstream_error_raises(tmp_path):
    respx.get(weather.URL).respond(503)
    with pytest.raises(httpx.HTTPStatusError):
        await weather.WeatherProvider().fetch_cell(ctx_for(tmp_path, T0), snap_cell(LAT, LON))


# fire danger --------------------------------------------------------------
def test_parse_cfa_fixture():
    days = fire.parse_cfa((FIX / "cfa_central.xml").read_bytes())
    assert days == {
        "2026-11-27": {"rating": "NO RATING", "tfb": False},
        "2026-11-28": {"rating": "HIGH", "tfb": False},
        "2026-11-29": {"rating": "EXTREME", "tfb": True},
    }


def test_parse_cfa_rejects_empty():
    with pytest.raises(ValueError):
        fire.parse_cfa(b"<rss><channel></channel></rss>")


@respx.mock
async def test_fire_refresh_and_query(tmp_path):
    respx.get(fire.URL).respond(200, content=(FIX / "cfa_central.xml").read_bytes())
    fetched = melb(2026, 11, 27, 6)
    ctx = ctx_for(tmp_path, fetched)
    p = fire.FireDangerProvider()
    await p.refresh(ctx)
    fri = p.query(ctx, LAT, LON, melb(2026, 11, 27, 7))
    assert fri.items[0].detail["display"] == "No rating" and fri.items[0].severity == 0
    sat = p.query(ctx, LAT, LON, melb(2026, 11, 28)).items[0]
    assert sat.detail["display"] == "High" and sat.severity == 2
    sun = p.query(ctx, LAT, LON, melb(2026, 11, 29)).items[0]
    assert sun.detail["display"] == "Extreme · Total Fire Ban" and sun.severity == 3
    # past the feed's last day: pending, never yesterday's rating shown as today's
    assert p.query(ctx, LAT, LON, melb(2026, 11, 30)).status == "pending"


def test_fire_tfb_forces_top_level(tmp_path):
    now = melb(2026, 12, 1)
    ctx = ctx_for(tmp_path, now)
    ctx.store.put_layer(
        "fire_danger", "global", {"days": {"2026-12-01": {"rating": "MODERATE", "tfb": True}}}, now
    )
    assert fire.FireDangerProvider().query(ctx, LAT, LON, now).items[0].severity == 3


# pollen -------------------------------------------------------------------
def test_parse_pollen_fixture():
    out = pollen.parse_pollen((FIX / "melbournepollen.html").read_text())
    assert out == {"pollen": "high", "asthma": "moderate", "date": "Friday, November 27, 2026"}


def test_parse_pollen_out_of_season_and_redesign():
    off = '<div class="pollen-data bar-pollen-Unknown" id="bar-pollen-div"></div>'
    assert pollen.parse_pollen(off)["pollen"] is None
    with pytest.raises(ValueError):
        pollen.parse_pollen("<html>new site</html>")


@respx.mock
async def test_pollen_refresh_and_query(tmp_path):
    respx.get(pollen.URL).respond(200, text=(FIX / "melbournepollen.html").read_text())
    ctx = ctx_for(tmp_path, T0)
    p = pollen.PollenProvider()
    await p.refresh(ctx)
    layer = p.query(ctx, LAT, LON, T0)
    by = {i.group: i for i in layer.items}
    assert by["pollen"].name == "Grass pollen" and by["pollen"].severity == 2
    assert by["asthma"].name == "Thunderstorm asthma" and by["asthma"].severity == 2
    assert all(i.detail["chip"] for i in layer.items)
    assert p.query(ctx, LAT, LON, T0 + pollen.STALE_AFTER_S + 1).status == "stale"


# uv -----------------------------------------------------------------------
@pytest.mark.parametrize(("idx", "lvl"), [(0, 0), (2.9, 0), (3, 1), (6, 2), (8, 3), (12, 3)])
def test_uv_level(idx, lvl):
    assert uv_level(idx) == lvl

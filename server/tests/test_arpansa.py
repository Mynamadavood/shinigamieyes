from datetime import UTC, datetime
from pathlib import Path

import httpx
import pytest
import respx
from shinigami.providers.arpansa import URL, ArpansaUvProvider, band, parse_arpansa
from shinigami.providers.base import ProviderContext
from shinigami.store import Store

FIX = (Path(__file__).parent / "fixtures" / "uvvalues.xml").read_bytes()
MEL_TS = datetime(2026, 11, 5, 12, 49, tzinfo=UTC).timestamp()
SYN_TS = datetime(2026, 11, 5, 1, 56, tzinfo=UTC).timestamp()


def make_xml(index="6.9", status="ok", station="Melbourne"):
    body = (
        '<?xml version="1.0" encoding="utf-8"?><stations>'
        f'<location id="{station}"><index>{index}</index>'
        "<utcdatetime>2026/11/05 01:56</utcdatetime>"
        f"<status>{status}</status></location></stations>"
    )
    return b"\xef\xbb\xbf" + body.encode("utf-8")


def ctx_for(tmp_path, now):
    return ProviderContext(
        settings=None, clock=lambda: now, store=Store(tmp_path / "a.db"), http=httpx.AsyncClient()
    )


def test_fixture_has_bom():
    assert FIX[:3] == b"\xef\xbb\xbf"


def test_parse_fixture():
    idx, ts, status = parse_arpansa(FIX)
    assert idx == 0.0 and ts == MEL_TS and status == "ok"


def test_parse_utc():
    idx, ts, _ = parse_arpansa(make_xml())
    assert idx == 6.9
    assert ts == SYN_TS


def test_parse_errors():
    with pytest.raises(ValueError):
        parse_arpansa(make_xml(status="offline"))
    with pytest.raises(ValueError):
        parse_arpansa(make_xml(station="Sydney"))


def test_band():
    got = [band(x) for x in (2.9, 3, 6, 8, 11)]
    assert got == ["Low", "Moderate", "High", "Very high", "Extreme"]


@respx.mock
async def test_refresh_and_query(tmp_path):
    respx.get(URL).respond(200, content=make_xml())
    ctx = ctx_for(tmp_path, SYN_TS + 60)
    p = ArpansaUvProvider()
    await p.refresh(ctx)
    layer = p.query(ctx, -37.8, 144.9, SYN_TS + 60)
    assert layer.id == "uv_now" and layer.status == "fresh"
    (item,) = layer.items
    assert item.name == "UV index now" and item.group == "uv_now" and item.verb == "now"
    assert item.target_ts is None and item.kind == "environment"
    assert item.detail["display"] == "6.9 · High"
    assert layer.as_of == SYN_TS and item.stale_after_s == 1800
    assert p.query(ctx, 0, 0, SYN_TS + 1801).status == "stale"


@respx.mock
async def test_fixture_refresh(tmp_path):
    respx.get(URL).respond(200, content=FIX)
    ctx = ctx_for(tmp_path, MEL_TS + 10)
    p = ArpansaUvProvider()
    await p.refresh(ctx)
    assert p.query(ctx, 0, 0, MEL_TS + 10).items[0].detail["display"] == "0 · Low"


def test_pending(tmp_path):
    ctx = ctx_for(tmp_path, 1000.0)
    layer = ArpansaUvProvider().query(ctx, 0, 0, 1000.0)
    assert layer.status == "pending" and layer.items == []


@respx.mock
async def test_refresh_failure_keeps_reading(tmp_path):
    ctx = ctx_for(tmp_path, 1000.0)
    ctx.store.put_layer("uv_now", "global", {"index": 4.0, "utc_ts": 900.0}, 900.0)
    p = ArpansaUvProvider()
    respx.get(URL).respond(500)
    with pytest.raises(httpx.HTTPStatusError):
        await p.refresh(ctx)
    respx.get(URL).mock(side_effect=httpx.ConnectTimeout("t"))
    with pytest.raises(httpx.ConnectTimeout):
        await p.refresh(ctx)
    assert ctx.store.get_layer("uv_now", "global")[0]["index"] == 4.0

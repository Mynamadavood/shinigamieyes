import gzip
import os

import httpx
import pytest
from pmtiles.tile import Compression, TileType, zxy_to_tileid
from pmtiles.writer import Writer
from shinigami.main import create_app
from shinigami.tiles import TileStore

TILE_A = (15, 29000, 19000)
TILE_B = (15, 29001, 19000)
ABSENT = (15, 29005, 19005)


def write_pmtiles(path, tiles, tile_type=TileType.MVT, compression=Compression.GZIP):
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "wb") as f:
        w = Writer(f)
        for (z, x, y), data in sorted(tiles.items(), key=lambda kv: zxy_to_tileid(*kv[0])):
            w.write_tile(zxy_to_tileid(z, x, y), data)
        w.finalize(
            {
                "tile_type": tile_type,
                "tile_compression": compression,
                "min_lon_e7": int(144.2e7),
                "min_lat_e7": int(-38.55e7),
                "max_lon_e7": int(145.75e7),
                "max_lat_e7": int(-37.45e7),
                "center_zoom": 0,
                "center_lon_e7": int(145e7),
                "center_lat_e7": int(-38e7),
            },
            {"name": "test"},
        )


DATA_A = gzip.compress(b"tile-a")
DATA_B = gzip.compress(b"tile-b")


def make_client(settings):
    app = create_app(settings, start_runtime=False)
    return app, httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://t")


def url(t):
    return f"/tiles/{t[0]}/{t[1]}/{t[2]}.mvt"


async def test_stored_tile_200(settings):
    write_pmtiles(settings.tiles_path, {TILE_A: DATA_A, TILE_B: DATA_B})
    _, c = make_client(settings)
    r = await c.get(url(TILE_A))
    assert r.status_code == 200
    assert r.content == b"tile-a"  # httpx transparently gunzips; header asserted below
    assert r.headers["content-encoding"] == "gzip"
    assert r.headers["content-type"] == "application/x-protobuf"
    assert r.headers["cache-control"] == "public, max-age=31536000, immutable"
    h = await c.get("/api/health")
    assert h.json()["tiles"] == "ok"
    m = (await c.get("/api/tiles/meta")).json()
    assert m["status"] == "ok" and m["maxzoom"] == 15
    assert m["bounds"][0] == pytest.approx(144.2)
    assert m["attribution"] == "© OpenStreetMap contributors · Protomaps"


async def test_absent_tile_204(settings):
    write_pmtiles(settings.tiles_path, {TILE_A: DATA_A, TILE_B: DATA_B})
    _, c = make_client(settings)
    r = await c.get(url(ABSENT))
    assert r.status_code == 204
    assert r.headers["cache-control"] == "public, max-age=86400"


async def test_bad_coordinates(settings):
    write_pmtiles(settings.tiles_path, {TILE_A: DATA_A})
    _, c = make_client(settings)
    assert (await c.get("/tiles/16/0/0.mvt")).status_code in (404, 422)
    assert (await c.get("/tiles/15/40000/0.mvt")).status_code == 404
    assert (await c.get("/tiles/15/-1/0.mvt")).status_code in (404, 422)


async def test_missing_file(settings):
    _, c = make_client(settings)
    assert (await c.get("/api/health")).json()["tiles"] == "missing"
    assert (await c.get(url(TILE_A))).status_code == 204
    assert (await c.get("/api/tiles/meta")).json()["status"] == "missing"


@pytest.mark.parametrize(
    "kw",
    [{"compression": Compression.NONE}, {"tile_type": TileType.PNG}],
)
async def test_unsupported(settings, kw):
    write_pmtiles(settings.tiles_path, {TILE_A: DATA_A}, **kw)
    _, c = make_client(settings)
    assert (await c.get("/api/health")).json()["tiles"] == "unsupported"
    assert (await c.get(url(TILE_A))).status_code == 204


def test_reload_on_change(tmp_path, monkeypatch):
    p = tmp_path / "t.pmtiles"
    write_pmtiles(p, {TILE_A: DATA_A})
    store = TileStore(p)
    assert store.get(*TILE_A) == DATA_A
    old_build = store.build
    new = tmp_path / "new.pmtiles"
    write_pmtiles(new, {TILE_A: DATA_B})
    os.utime(new, (1_900_000_000, 1_900_000_000))
    os.replace(new, p)
    import shinigami.tiles as t

    real = t.time.monotonic
    monkeypatch.setattr(t.time, "monotonic", lambda: real() + 60)
    store.reload_if_changed()
    assert store.get(*TILE_A) == DATA_B
    assert store.build != old_build

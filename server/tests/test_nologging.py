import logging
from pathlib import Path


async def test_coordinates_not_logged(client, caplog):
    caplog.set_level(logging.DEBUG)
    r = await client.get("/api/profile", params={"lat": -37.81234, "lon": 144.96321})
    assert r.status_code == 200
    # the httpx test client logs its own request line; only app loggers matter
    for rec in caplog.records:
        if rec.name.startswith("httpx"):
            continue
        msg = rec.getMessage()
        assert "-37.81" not in msg
        assert "144.96" not in msg


def test_unit_disables_access_log():
    unit = Path(__file__).resolve().parents[2] / "deploy" / "shinigami.service"
    assert "--no-access-log" in unit.read_text()


async def test_fake_credentials_never_surface(settings, transit_store_file, caplog):
    from shinigami.api.profile import camera_ok, resolve_location
    from shinigami.api.stream import event_stream
    from test_profile_readonly import _transit_world

    caplog.set_level(logging.DEBUG)
    devid, key = "1000001", "00000000-0000-0000-0000-000000000000"
    app, client, _rt, pt = _transit_world(settings, transit_store_file, devid)
    bodies = [
        (await client.get("/api/health")).text,
        (await client.get("/api/profile", params={"lat": pt[0], "lon": pt[1]})).text,
        (await client.get("/api/profile", params={"place": "pub"})).text,
    ]

    class Req:
        pass

    req = Req()
    req.app = app
    location, la, lo = resolve_location(req, pt[0], pt[1], None)

    async def dc():
        return False

    gen = event_stream(
        app.state.ctx, app.state.providers, location, la, lo, dc, exact_ok=camera_ok(req, location)
    )
    bodies.append((await gen.__anext__()).data or "")
    for _ in range(len(app.state.providers)):
        bodies.append((await gen.__anext__()).data)
    await gen.aclose()
    blob = " ".join(bodies) + " ".join(r.getMessage() for r in caplog.records)
    assert devid not in blob
    assert key not in blob and "signature" not in blob.lower() and "timetableapi" not in blob

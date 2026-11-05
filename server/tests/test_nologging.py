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

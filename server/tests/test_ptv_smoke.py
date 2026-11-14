"""Smoke module tests. FAKE credentials, synthetic store, respx only (no real PTV calls)."""

import json
import re
from pathlib import Path

import httpx
import pytest
import respx
from shinigami.settings import Settings
from shinigami.transit.ptv_client import PtvClient
from shinigami.transit.smoke import main, run_smoke
from shinigami.transit.store import TransitStore

DEVID = "1000001"
KEY = "00000000-0000-0000-0000-000000000000"
FIX = Path(__file__).parent / "fixtures" / "ptv"
LAT, LON = Settings().default_lat, Settings().default_lon


def write_store(path):
    def stop(i, mode, name, dlat):
        return {
            "id": i,
            "mode": mode,
            "name": name,
            "poles": [[LAT + dlat, LON, ["96:0", "96:1"]]],
            "gtfs_ids": [str(i)],
            "routes": ["96"],
        }

    stops = [
        stop(2720, "tram", "Synthetic Mall", 0.0002),
        stop(1900, "train", "Synthetic Junction", 0.002),
    ]
    path.write_text(json.dumps({"version": 1, "built_at": 1.0, "source": "t", "stops": stops}))


def serve(departures="departures_tram.json", dep_status=200):
    def body(name):
        return httpx.Response(200, content=(FIX / name).read_bytes())

    respx.get(url__regex=r".*/v3/route_types\?.*").mock(
        return_value=httpx.Response(200, json={"route_types": [{}, {}, {}, {}, {}]})
    )
    if dep_status == 200:
        respx.get(url__regex=r".*/v3/departures/.*").mock(return_value=body(departures))
    else:
        respx.get(url__regex=r".*/v3/departures/.*").mock(return_value=httpx.Response(dep_status))
    respx.get(url__regex=r".*/v3/disruptions\?.*").mock(return_value=body("disruptions.json"))
    respx.get(url__regex=r".*/v3/stops/location/.*").mock(return_value=body("stops_location.json"))


@pytest.fixture
def store(tmp_path):
    p = tmp_path / "t.json"
    write_store(p)
    s = TransitStore(p)
    assert s.load()
    return s


@respx.mock
async def test_all_four_steps_ok(store):
    serve()
    async with httpx.AsyncClient() as http:
        lines = await run_smoke(PtvClient(http, DEVID, KEY), store, LAT, LON)
    steps = [ln.split(":")[0] for ln in lines if not ln.startswith("run_status_values")]
    assert steps == ["route_types", "departures", "disruptions", "agreement"]
    assert len(lines) >= 4
    assert lines[0] == "route_types: ok count=5"
    assert lines[1].startswith("departures: ok rows=4 live=")
    assert "fields=scheduled_departure_utc" in lines[1] and "run_ref" in lines[1]
    assert re.search(r"live=(\d+) sched=(\d+)", lines[1])
    assert lines[2] == "disruptions: ok total=3 types=" + lines[2].split("types=")[1]
    assert lines[3] == "agreement: 2/2 stop ids match store"
    assert sum(1 for ln in lines if ln.startswith("run_status_values=")) <= 1


@respx.mock
async def test_departures_403_others_still_run(store):
    serve(dep_status=403)
    async with httpx.AsyncClient() as http:
        lines = await run_smoke(PtvClient(http, DEVID, KEY), store, LAT, LON)
    assert "departures: fail kind=http_403" in lines
    assert lines[0].startswith("route_types: ok")
    assert any(ln.startswith("disruptions: ok") for ln in lines)
    assert any(ln.startswith("agreement: ") for ln in lines)


@respx.mock
async def test_no_tram_stop_is_a_skip(tmp_path):
    p = tmp_path / "empty.json"
    p.write_text(json.dumps({"version": 1, "built_at": 1.0, "source": "t", "stops": []}))
    s = TransitStore(p)
    s.load()
    serve()
    async with httpx.AsyncClient() as http:
        lines = await run_smoke(PtvClient(http, DEVID, KEY), s, LAT, LON)
    assert "departures: skip no tram stop" in lines
    assert lines[-1] == "agreement: 0/2 stop ids match store"


@respx.mock
def test_main_output_is_redacted(monkeypatch, tmp_path, capsys):
    p = tmp_path / "t.json"
    write_store(p)
    monkeypatch.setenv("PTV_DEVID", DEVID)
    monkeypatch.setenv("PTV_KEY", KEY)
    monkeypatch.setenv("SHINIGAMI_TRANSIT_STOPS_PATH", str(p))
    serve()
    assert main() == 0
    out = capsys.readouterr().out
    low = out.lower()
    for bad in (DEVID, KEY, "signature", "http", "timetableapi", "2720", "1900", "synthetic"):
        assert bad not in low
    stripped = re.sub(
        r"(count|rows|live|sched|total|types|runs_with_position|run_status_values)=\d+", "", out
    )
    stripped = re.sub(r"agreement: \d+/\d+", "", stripped)
    assert not re.search(r"\d{4,}", stripped)
    assert out.count("\n") >= 4


@respx.mock
@pytest.mark.parametrize("missing", ["PTV_DEVID", "PTV_KEY"])
def test_main_without_key_makes_no_request(monkeypatch, capsys, missing):
    monkeypatch.setenv("PTV_DEVID", DEVID)
    monkeypatch.setenv("PTV_KEY", KEY)
    monkeypatch.delenv(missing)
    route = respx.route().mock(return_value=httpx.Response(200, json={}))
    assert main() == 2
    assert capsys.readouterr().out.strip() == "PTV key not set"
    assert route.call_count == 0

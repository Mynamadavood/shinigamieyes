"""Manual PTV smoke check (D-24): three live calls plus a stop-id agreement check.

Run once on the CT after the PTV key is added to /etc/shinigami/.env:

    sudo -u shinigami bash -c 'set -a; . /etc/shinigami/.env; set +a; \
        /opt/shinigami/.venv/bin/python /opt/shinigami/scripts/ptv_smoke.py'

It prints HTTP-level status kinds, field names and counts only. Never URLs, stop or route
ids or names, coordinates, devid, key or signature. Exit codes: 0 all steps ok, 1 any step
failed or skipped, 2 key not set (no request is made).
"""

from __future__ import annotations

import asyncio
import os
from pathlib import Path

import httpx

from shinigami.settings import Settings
from shinigami.transit.ptv_client import PtvClient, PtvError
from shinigami.transit.store import TransitStore

DEFAULT_STOPS_PATH = "/var/lib/shinigami/data/transit_stops.json"
_TRAM = 1


async def run_smoke(client: PtvClient, store: TransitStore, lat: float, lon: float) -> list[str]:
    lines: list[str] = []

    # 1. route_types
    try:
        count = await client.route_types()
        lines.append(f"route_types: ok count={count}")
    except PtvError as exc:
        lines.append(f"route_types: fail kind={exc.kind}")

    # 2. departures at the nearest tram stop in the store
    tram = next((s for s in store.nearby(lat, lon).stops if s.route_type == _TRAM), None)
    if tram is None:
        lines.append("departures: skip no tram stop")
    else:
        try:
            res = await client.departures(_TRAM, tram.id, max_results=20)
            deps = res.departures
            live = sum(1 for d in deps if d.estimated_ts is not None)
            fields = []
            if deps:
                fields.append("scheduled_departure_utc")
            if live:
                fields.append("estimated_departure_utc")
            if any(d.run_ref for d in deps):
                fields.append("run_ref")
            if any(d.platform for d in deps):
                fields.append("platform_number")
            if any(d.cancelled for d in deps):
                fields.append("cancelled_status")
            lines.append(
                f"departures: ok rows={len(deps)} live={live} sched={len(deps) - live} "
                f"runs_with_position={len(res.positions)} fields={','.join(fields) or 'none'}"
            )
        except PtvError as exc:
            lines.append(f"departures: fail kind={exc.kind}")

    # 3. disruptions
    try:
        dis = await client.disruptions()
        lines.append(f"disruptions: ok total={len(dis)} types={len({d.dtype for d in dis})}")
    except PtvError as exc:
        lines.append(f"disruptions: fail kind={exc.kind}")

    # 4. agreement: stop ids PTV reports near the point must exist in our GTFS-built store
    try:
        ids = await client.stops_near(lat, lon, [0, 1, 2], 800)
        if not ids:
            lines.append("agreement: skip no ptv stops")
        else:
            hit = sum(1 for i in ids if store.get(i) is not None)
            lines.append(f"agreement: {hit}/{len(ids)} stop ids match store")
    except PtvError as exc:
        lines.append(f"agreement: fail kind={exc.kind}")

    return lines


def _is_ok(line: str) -> bool:
    if line.startswith("agreement: "):
        return "stop ids match store" in line
    return ": ok" in line


async def _amain(devid: str, key: str) -> list[str]:
    # No dotenv lookup: the CT keeps secrets in /etc/shinigami/.env (sourced by the
    # caller), and a relative ".env" in an unreadable cwd (e.g. /root) raises EACCES.
    settings = Settings(_env_file=None)
    store = TransitStore(Path(os.environ.get("SHINIGAMI_TRANSIT_STOPS_PATH", DEFAULT_STOPS_PATH)))
    store.load()
    async with httpx.AsyncClient() as http:
        client = PtvClient(http, devid, key)
        return await run_smoke(client, store, settings.default_lat, settings.default_lon)


def main() -> int:
    devid = os.environ.get("PTV_DEVID", "")
    key = os.environ.get("PTV_KEY", "")
    if not devid or not key:
        print("PTV key not set")
        return 2
    lines = asyncio.run(_amain(devid, key))
    for line in lines:
        print(line)
    return 0 if all(_is_ok(line) for line in lines) else 1

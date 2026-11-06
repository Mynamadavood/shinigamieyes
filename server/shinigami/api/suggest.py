"""GET /api/suggest: type-ahead address suggestions via Photon (komoot).

Nominatim's policy forbids autocomplete, so type-ahead goes to Photon, which is built
for it. Server-side proxy only: the phone never talks to Photon. Results are biased to
the Melbourne CBD (a fixed point, never the user's location) and bounded to Greater
Melbourne. Cache-first (forever), polite spacing, never logs the query text.
The Search key still goes to /api/geocode (Nominatim) as the fallback.
"""

import asyncio
import logging
import time
from typing import Any

import httpx
from fastapi import APIRouter, HTTPException, Query, Request

from shinigami.api.geocode import VIEWBOX

log = logging.getLogger("shinigami.suggest")
router = APIRouter()

PHOTON_URL = "https://photon.komoot.io/api/"
MIN_SPACING_S = 0.5
MAX_WAIT_S = 1.0
TIMEOUT_S = 4.0
BIAS_LAT, BIAS_LON = "-37.8136", "144.9631"  # Melbourne CBD, fixed
CACHE_PREFIX = "suggest|"

# Test seams (patched in tests).
_now = time.monotonic
_sleep = asyncio.sleep

_last_slot: float | None = None


def _label(p: dict[str, Any]) -> str | None:
    name = (p.get("name") or "").strip()
    street = (p.get("street") or "").strip()
    num = (p.get("housenumber") or "").strip()
    addr = f"{num} {street}".strip() if street else ""
    if name and addr and name != street:
        return f"{name}, {addr}"
    return addr if num and addr else (name or street or None)


def _map(data: dict[str, Any]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    seen: set[tuple[str, str | None]] = set()
    for f in (data.get("features") or [])[:10]:
        try:
            p = f["properties"]
            lon, lat = (float(c) for c in f["geometry"]["coordinates"][:2])
        except (KeyError, TypeError, ValueError):
            continue
        if str(p.get("countrycode", "")).upper() != "AU":
            continue
        label = _label(p)
        if not label:
            continue
        suburb = p.get("district") or p.get("locality") or p.get("city")
        key = (label.lower(), suburb)
        if key in seen:
            continue
        seen.add(key)
        out.append({"label": label, "suburb": suburb, "lat": lat, "lon": lon})
        if len(out) == 5:
            break
    return out


def _reserve() -> float:
    global _last_slot
    now = _now()
    slot = now if _last_slot is None else max(now, _last_slot + MIN_SPACING_S)
    wait = slot - now
    if wait > MAX_WAIT_S:
        raise HTTPException(status_code=429, detail="rate_limited")
    _last_slot = slot
    return wait


@router.get("/api/suggest")
async def suggest(request: Request, q: str = Query(..., min_length=3, max_length=120)):
    q = q.strip()
    if not 3 <= len(q) <= 120:
        raise HTTPException(status_code=422, detail="bad_query")
    key = CACHE_PREFIX + " ".join(q.lower().split())
    ctx = request.app.state.ctx
    settings = request.app.state.settings

    cached = ctx.store.get_geocode(key)
    if cached is not None:
        return cached

    wait = _reserve()
    if wait > 0:
        await _sleep(wait)

    params = {
        "q": q,
        "limit": "10",
        "lang": "en",
        "lat": BIAS_LAT,
        "lon": BIAS_LON,
        "bbox": VIEWBOX,
    }
    headers = {"User-Agent": f"ShinigamiEyes/{settings.version} (private, single user)"}
    try:
        resp = await ctx.http.get(PHOTON_URL, params=params, headers=headers, timeout=TIMEOUT_S)
        resp.raise_for_status()
        results = _map(resp.json())
    except (httpx.HTTPError, ValueError, TypeError, AttributeError) as exc:
        log.warning("suggest upstream error %s", type(exc).__name__)
        raise HTTPException(status_code=502, detail="search_failed") from None

    ctx.store.put_geocode(key, results, ctx.clock())
    return results

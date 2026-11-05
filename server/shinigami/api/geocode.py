"""GET /api/geocode: user-initiated Nominatim proxy (D-08).

Cache-first (forever), slot-based 1 req/s limiter, identifying User-Agent, no autocomplete.
Never logs the query text or coordinates.
"""

import asyncio
import logging
import time
from typing import Any

import httpx
from fastapi import APIRouter, HTTPException, Query, Request

log = logging.getLogger("shinigami.geocode")
router = APIRouter()

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
MIN_SPACING_S = 1.0
MAX_WAIT_S = 3.0
TIMEOUT_S = 4.0
VIEWBOX = "144.4,-38.5,145.6,-37.4"

# Test seams (patched in tests).
_now = time.monotonic
_sleep = asyncio.sleep

_last_slot: float | None = None
_warned_no_contact = False


def _map(results: list[dict[str, Any]]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for r in results[:5]:
        try:
            lat, lon = float(r["lat"]), float(r["lon"])
        except (KeyError, TypeError, ValueError):
            continue
        parts = [p.strip() for p in str(r.get("display_name", "")).split(",")]
        label = ", ".join(p for p in parts[:2] if p)
        addr = r.get("address") or {}
        suburb = (
            addr.get("suburb") or addr.get("city_district") or addr.get("town") or addr.get("city")
        )
        out.append({"label": label, "suburb": suburb, "lat": lat, "lon": lon})
    return out


def _reserve() -> float:
    """Reserve the next upstream slot; return seconds to wait or raise 429."""
    global _last_slot
    now = _now()
    slot = now if _last_slot is None else max(now, _last_slot + MIN_SPACING_S)
    wait = slot - now
    if wait > MAX_WAIT_S:
        raise HTTPException(status_code=429, detail="rate_limited")
    _last_slot = slot
    return wait


@router.get("/api/geocode")
async def geocode(request: Request, q: str = Query(..., min_length=3, max_length=120)):
    global _warned_no_contact
    q = q.strip()
    if not 3 <= len(q) <= 120:
        raise HTTPException(status_code=422, detail="bad_query")
    q_norm = " ".join(q.lower().split())
    ctx = request.app.state.ctx
    settings = request.app.state.settings

    cached = ctx.store.get_geocode(q_norm)
    if cached is not None:
        return cached

    contact = settings.contact_email.strip()
    if not contact:
        # Nominatim policy requires an identifying contact; do not call anonymously.
        if not _warned_no_contact:
            _warned_no_contact = True
            log.warning("contact_email is not configured; address search disabled")
        raise HTTPException(status_code=502, detail="search_failed")

    wait = _reserve()
    if wait > 0:
        await _sleep(wait)

    headers = {"User-Agent": f"ShinigamiEyes/{settings.version} (private; contact: {contact})"}
    params = {
        "q": q,
        "format": "jsonv2",
        "countrycodes": "au",
        "viewbox": VIEWBOX,
        "bounded": "0",
        "limit": "5",
        "addressdetails": "1",
    }
    try:
        resp = await ctx.http.get(NOMINATIM_URL, params=params, headers=headers, timeout=TIMEOUT_S)
        resp.raise_for_status()
        results = _map(resp.json())
    except (httpx.HTTPError, ValueError, TypeError, AttributeError) as exc:
        log.warning("geocode upstream error %s", type(exc).__name__)
        raise HTTPException(status_code=502, detail="search_failed") from None

    ctx.store.put_geocode(q_norm, results, ctx.clock())
    return results

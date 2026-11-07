"""GET /api/profile: read-only, no outbound I/O (PLAT-04)."""

from typing import Literal

from fastapi import APIRouter, HTTPException, Query, Request

from shinigami.assemble import assemble_profile
from shinigami.geo import haversine_m, snap_cell
from shinigami.schema import Profile, ProfileLocation

router = APIRouter()

NEAR_M = 2000.0


def resolve_location(
    request: Request,
    lat: float | None,
    lon: float | None,
    place: str | None = None,
    src: str = "gps",
    label: str | None = None,
) -> tuple[ProfileLocation, float, float]:
    """Shared rule for /api/profile and /api/stream: (lat, lon) XOR place, or neither."""
    settings = request.app.state.settings
    if (lat is None) != (lon is None):
        raise HTTPException(status_code=422, detail="lat and lon must be given together")
    if place is not None:
        if lat is not None:
            raise HTTPException(status_code=422, detail="place excludes lat/lon")
        p = request.app.state.places.get(place)
        if p is None:
            raise HTTPException(status_code=422, detail="unknown place")
        cell = snap_cell(p.lat, p.lon)  # 0.1 degree centre only (already implied by sun times)
        loc = ProfileLocation(
            source="pin",
            lat=None,
            lon=None,
            place_id=p.id,
            label=p.label,
            cell_lat=cell.lat,
            cell_lon=cell.lon,
        )
        return loc, p.lat, p.lon
    if lat is None or lon is None:
        lat, lon = settings.default_lat, settings.default_lon
        return ProfileLocation(source="default", lat=lat, lon=lon, label="Melbourne CBD"), lat, lon
    if src == "search":
        return (
            ProfileLocation(source="search", lat=lat, lon=lon, label=label or "searched place"),
            lat,
            lon,
        )
    best: tuple[float, str] | None = None
    for p in request.app.state.places.values():
        d = haversine_m(lat, lon, p.lat, p.lon)
        if d <= NEAR_M and (best is None or d < best[0]):
            best = (d, p.label)
    text = f"near {best[1]}" if best else "current location"
    return ProfileLocation(source="gps", lat=lat, lon=lon, label=text), lat, lon


@router.get("/api/profile")
def get_profile(
    request: Request,
    lat: float | None = Query(None, ge=-90, le=90),
    lon: float | None = Query(None, ge=-180, le=180),
    place: str | None = Query(None, max_length=32, pattern="^[a-z0-9_-]+$"),
    src: Literal["gps", "search"] = "gps",
    label: str | None = Query(None, max_length=120),
) -> Profile:
    location, lat, lon = resolve_location(request, lat, lon, place, src, label)
    return assemble_profile(request.app.state.ctx, request.app.state.providers, location, lat, lon)

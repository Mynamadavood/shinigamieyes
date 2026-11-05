"""GET /api/profile: read-only, no outbound I/O (PLAT-04)."""

from fastapi import APIRouter, HTTPException, Query, Request

from shinigami.assemble import assemble_profile
from shinigami.schema import Profile, ProfileLocation

router = APIRouter()


@router.get("/api/profile")
def get_profile(
    request: Request,
    lat: float | None = Query(None, ge=-90, le=90),
    lon: float | None = Query(None, ge=-180, le=180),
) -> Profile:
    if (lat is None) != (lon is None):
        raise HTTPException(status_code=422, detail="lat and lon must be given together")
    settings = request.app.state.settings
    if lat is None or lon is None:
        lat, lon = settings.default_lat, settings.default_lon
        location = ProfileLocation(source="default", lat=lat, lon=lon, label="Melbourne CBD")
    else:
        location = ProfileLocation(source="gps", lat=lat, lon=lon)
    return assemble_profile(request.app.state.ctx, request.app.state.providers, location, lat, lon)

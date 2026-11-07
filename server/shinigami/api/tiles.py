"""Vector tiles from the local PMTiles extract (no tile CDN ever sees David's location)."""

from fastapi import APIRouter, HTTPException, Path, Request, Response

router = APIRouter()

IMMUTABLE = "public, max-age=31536000, immutable"
ABSENT = "public, max-age=86400"


@router.get("/tiles/{z}/{x}/{y}.mvt")
def tile(
    request: Request,
    z: int = Path(ge=0, le=15),
    x: int = Path(ge=0),
    y: int = Path(ge=0),
) -> Response:
    # No logging here: tile coordinates reveal location.
    if x >= (1 << z) or y >= (1 << z):
        raise HTTPException(status_code=404)
    store = request.app.state.tiles
    store.reload_if_changed()
    data = store.get(z, x, y)
    if data is None:
        return Response(status_code=204, headers={"Cache-Control": ABSENT})
    return Response(
        content=data,
        media_type="application/x-protobuf",
        headers={"Content-Encoding": "gzip", "Cache-Control": IMMUTABLE},
    )


@router.get("/api/tiles/meta")
def tiles_meta(request: Request) -> dict:
    store = request.app.state.tiles
    store.reload_if_changed()
    return store.meta()

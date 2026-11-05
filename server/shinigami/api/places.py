"""GET /api/places: ids and labels only (D-09). Coordinates never leave the server."""

from fastapi import APIRouter, Request

router = APIRouter()


@router.get("/api/places")
def list_places(request: Request) -> list[dict[str, str]]:
    return [{"id": p.id, "label": p.label} for p in request.app.state.places.values()]

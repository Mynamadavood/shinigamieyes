"""GET /api/places: ids, labels and the cameras flag only (D-09). Coordinates never leave the server."""

from fastapi import APIRouter, Request

router = APIRouter()


@router.get("/api/places")
def list_places(request: Request) -> list[dict[str, str | bool]]:
    return [{"id": p.id, "label": p.label, "cameras": p.cameras} for p in request.app.state.places.values()]

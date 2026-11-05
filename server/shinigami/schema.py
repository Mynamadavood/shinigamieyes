"""Frozen Item/Layer/Profile contract shared by every phase.

ItemKind deliberately has no person-level kinds (PROJECT.md privacy rule).
"""

from typing import Literal

from pydantic import BaseModel, Field

ItemKind = Literal[
    "place", "infrastructure", "transit_vehicle", "aircraft", "vessel", "self", "environment"
]
LayerStatus = Literal["fresh", "stale", "pending", "error", "out_of_coverage"]


class Item(BaseModel, frozen=True):
    id: str
    layer: str
    group: str
    name: str
    verb: str
    target_ts: float | None  # absolute epoch seconds UTC; None = value-only item
    kind: ItemKind
    severity: int = Field(0, ge=0, le=3)
    detail: dict | None = None
    geom: dict | None = None
    fetched_at: float
    stale_after_s: int | None  # None = never stale
    computed: bool = False


class Layer(BaseModel):
    id: str
    status: LayerStatus
    rev: int
    as_of: float | None
    attribution: str
    items: list[Item]


class ProfileLocation(BaseModel):
    source: Literal["gps", "pin", "search", "default"]
    lat: float | None
    lon: float | None
    place_id: str | None = None
    label: str | None = None


class Profile(BaseModel):
    server_time: float
    rev: int
    location: ProfileLocation
    layers: dict[str, Layer]

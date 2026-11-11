"""Mapped surveillance cameras near a point, read from memory (static info only)."""

from typing import ClassVar

from shinigami.cameras_store import CameraStore
from shinigami.providers.base import Provider, ProviderContext, ProviderMeta
from shinigami.schema import Item, Layer

MAX_ITEMS = 60
ATTRIBUTION = "© OpenStreetMap contributors (ODbL)"
NAMES = {"cctv": "Camera", "guard": "Guard post", "speed": "Speed camera", "redlight": "Red-light camera"}
DETAIL_KEYS = ("camera_type", "direction", "operator", "surveillance", "road", "suburb")


class _CameraProvider(Provider):
    layer_id: str
    radius_m: int
    kinds: ClassVar[set[str]]

    def __init__(self, store: CameraStore) -> None:
        self.store = store

    def query(self, ctx: ProviderContext, lat: float, lon: float, now: float) -> Layer:
        if not self.store.loaded:
            return Layer(
                id=self.layer_id,
                status="pending",
                rev=int(now),
                as_of=None,
                attribution=ATTRIBUTION,
                items=[],
            )
        hits = self.store.near(lat, lon, self.radius_m, self.kinds)
        items: list[Item] = []
        for dist, rec in hits[:MAX_ITEMS]:
            detail: dict = {
                k: rec[k] for k in DETAIL_KEYS if rec.get(k) not in (None, "", "unknown")
            }
            # Review WR-S3, accepted risk (David's call): for a camera-enabled saved place,
            # exact camera geoms plus distance_m let a client trilaterate the place even though
            # the pin's location lat/lon are null. That is fine for public places he chose to
            # show cameras at. Home and any is_home place never reach this code (places.py and
            # assemble.py keep exact providers off them), which is the real protection.
            detail["distance_m"] = round(dist)
            items.append(
                Item(
                    id=f"cam:{rec['id']}",
                    layer=self.layer_id,
                    group=rec["k"],
                    name=NAMES.get(rec["k"], "Camera"),
                    verb="",
                    target_ts=None,
                    kind="infrastructure",
                    severity=0,
                    detail=detail,
                    geom={"type": "Point", "coordinates": [rec["lon"], rec["lat"]]},
                    fetched_at=now,
                    stale_after_s=None,
                    computed=True,
                )
            )
        summary = Item(
            id=f"{self.layer_id}:summary",
            layer=self.layer_id,
            group="summary",
            name="summary",
            verb="",
            target_ts=None,
            kind="infrastructure",
            severity=0,
            detail={"summary": True, "count": len(hits), "radius_m": self.radius_m},
            geom=None,
            fetched_at=now,
            stale_after_s=None,
            computed=True,
        )
        return Layer(
            id=self.layer_id,
            status="fresh",
            rev=int(now),
            as_of=self.store.built_at,
            attribution=ATTRIBUTION,
            items=[summary, *items],
        )


class CctvCameraProvider(_CameraProvider):
    layer_id = "cameras_cctv"
    radius_m = 150
    kinds: ClassVar[set[str]] = {"cctv", "guard"}
    meta = ProviderMeta(
        id="cameras_cctv",
        tier="computed",
        ttl_s=3600,
        stale_after_s=None,
        attribution=ATTRIBUTION,
        exact_location_only=True,
    )


class RoadCameraProvider(_CameraProvider):
    layer_id = "cameras_road"
    radius_m = 1000
    kinds: ClassVar[set[str]] = {"speed", "redlight"}
    meta = ProviderMeta(
        id="cameras_road",
        tier="computed",
        ttl_s=3600,
        stale_after_s=None,
        attribution=ATTRIBUTION,
        exact_location_only=True,
    )

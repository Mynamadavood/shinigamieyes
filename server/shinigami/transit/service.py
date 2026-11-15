"""Shared transit state for the four transit providers: stop store plus PTV credentials/state."""

from shinigami.transit.ptv_client import PtvClient
from shinigami.transit.sources import DepartureSource, PtvDepartureSource
from shinigami.transit.store import Nearby, TransitStore
from shinigami.transit.watch import WatchSet

ATTRIBUTION = (
    "Source: Licensed from Public Transport Victoria under a "
    "Creative Commons Attribution 4.0 International Licence."
)


class TransitService:
    def __init__(self, store: TransitStore, devid: str | None, key: str | None) -> None:
        self.store = store
        # Secrets live only here; never in an attribute that a repr or health body would show.
        self._creds: tuple[str, str] | None = None
        d, k = (devid or "").strip(), (key or "").strip()
        if d and k:
            self._creds = (d, k)
        self.ptv_state: str = "idle" if self._creds else "no_key"
        self.last_live_ts: float | None = None
        self.watch = WatchSet()
        self.client: PtvClient | None = None
        self.source: DepartureSource | None = None
        self.last_new_refs: set[int] = set()  # stop ids newly watched by the last query

    @property
    def ptv_configured(self) -> bool:
        return self._creds is not None

    def creds(self) -> tuple[str, str] | None:
        return self._creds

    def attach_http(self, http) -> None:
        """Build the PTV client once the shared AsyncClient exists (no-op without a key)."""
        creds = self._creds
        if creds is None:
            return
        self.client = PtvClient(http, creds[0], creds[1])
        self.source = PtvDepartureSource(self.client)

    def cached_departures(self, ctx, stop_id: int) -> tuple[dict, float] | None:
        if ctx.store is None:
            return None
        return ctx.store.get_layer("transit", f"dep:{stop_id}")

    def cached_disruptions(self, ctx) -> tuple[dict, float] | None:
        if ctx.store is None:
            return None
        return ctx.store.get_layer("transit", "disruptions")

    def nearby(self, lat: float, lon: float) -> Nearby:
        if not self.store.loaded:
            return Nearby(stops=(), none_modes=())
        return self.store.nearby(lat, lon)

    def __repr__(self) -> str:
        return f"TransitService(loaded={self.store.loaded}, ptv={self.ptv_state})"

"""Shared transit state for the four transit providers: stop store plus PTV credentials/state."""

from shinigami.transit.store import Nearby, TransitStore

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

    @property
    def ptv_configured(self) -> bool:
        return self._creds is not None

    def creds(self) -> tuple[str, str] | None:
        return self._creds

    def nearby(self, lat: float, lon: float) -> Nearby:
        if not self.store.loaded:
            return Nearby(stops=(), none_modes=())
        return self.store.nearby(lat, lon)

    def __repr__(self) -> str:
        return f"TransitService(loaded={self.store.loaded}, ptv={self.ptv_state})"

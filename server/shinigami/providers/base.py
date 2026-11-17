"""Provider contract.

Provider.query() is SYNC and read-only: CPU or local store reads only. It must
NEVER perform network I/O (PLAT-04: /api/profile never takes the slow path).
Network work belongs in refresh() (polled tier) or fetch_cell() (on_demand tier).
"""

from abc import ABC, abstractmethod
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any, Literal

from shinigami.geo import Cell
from shinigami.schema import Layer


@dataclass(frozen=True)
class ProviderMeta:
    id: str
    tier: Literal["computed", "polled", "on_demand"]
    ttl_s: int
    stale_after_s: int | None
    attribution: str
    interval_s: int | None = None
    # True: computed from the exact point; never run for server-held place pins
    exact_location_only: bool = False
    # Longest poll backoff after failures; None means the runtime default (review WR-S3)
    backoff_cap_s: int | None = None


@dataclass
class ProviderContext:
    settings: Any
    clock: Callable[[], float]
    store: Any = None
    http: Any = None
    bus: Any = None
    runtime: Any = None


class Provider(ABC):
    meta: ProviderMeta

    @abstractmethod
    def query(self, ctx: ProviderContext, lat: float, lon: float, now: float) -> Layer:
        """Read-only, synchronous, no network I/O."""

    async def refresh(self, ctx: ProviderContext) -> None:
        return None

    async def nudge_refresh(self, ctx: ProviderContext) -> bool:
        """Refresh on demand (runtime nudge). Default: the full refresh.

        Return False when there was nothing to fetch, so the runtime does not treat a no-op
        as proof that the upstream is healthy again.
        """
        await self.refresh(ctx)
        return True

    async def fetch_cell(self, ctx: ProviderContext, cell: Cell) -> None:
        return None

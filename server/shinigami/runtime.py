"""Provider runtime: event bus, polled refresh loops with backoff, singleflight cell fetches.

Logging rule: only provider id and exception class are ever logged (privacy).
"""

import asyncio
import logging
import random
import threading

from shinigami.geo import Cell
from shinigami.providers.base import Provider, ProviderContext

log = logging.getLogger("shinigami.runtime")

BACKOFF_BASE_S = 30.0
BACKOFF_CAP_S = 1800.0
JITTER = 0.1


async def _sleep(seconds: float) -> None:
    await asyncio.sleep(seconds)


class EventBus:
    def __init__(self) -> None:
        self._subs: list[asyncio.Queue[dict]] = []

    def subscribe(self) -> asyncio.Queue[dict]:
        q: asyncio.Queue[dict] = asyncio.Queue(maxsize=100)
        self._subs.append(q)
        return q

    def unsubscribe(self, q: asyncio.Queue[dict]) -> None:
        if q in self._subs:
            self._subs.remove(q)

    def publish(self, event: dict) -> None:
        for q in list(self._subs):
            while True:
                try:
                    q.put_nowait(event)
                    break
                except asyncio.QueueFull:
                    try:
                        q.get_nowait()  # drop oldest
                    except asyncio.QueueEmpty:
                        break


class Runtime:
    def __init__(self, ctx: ProviderContext, providers: list[Provider]) -> None:
        self.ctx = ctx
        self.providers = {p.meta.id: p for p in providers}
        self._loop: asyncio.AbstractEventLoop | None = None
        self._loop_thread: int | None = None
        self._tasks: set[asyncio.Task] = set()
        self._inflight: dict[tuple[str, str], asyncio.Task] = {}

    # lifecycle -------------------------------------------------------------
    async def start(self) -> None:
        self._loop = asyncio.get_running_loop()
        self._loop_thread = threading.get_ident()
        for p in self.providers.values():
            if p.meta.tier == "polled":
                t = asyncio.create_task(self._poll_loop(p), name=f"poll:{p.meta.id}")
                self._tasks.add(t)
                t.add_done_callback(self._tasks.discard)

    async def stop(self) -> None:
        tasks = list(self._tasks) + list(self._inflight.values())
        for t in tasks:
            t.cancel()
        if tasks:
            await asyncio.wait(tasks, timeout=1.0)
        self._tasks.clear()
        self._inflight.clear()

    # publishing ------------------------------------------------------------
    def _publish_layer(self, provider: Provider, cell_id: str, lat: float, lon: float) -> None:
        bus = self.ctx.bus
        if bus is None:
            return
        layer = provider.query(self.ctx, lat, lon, self.ctx.clock())
        bus.publish(
            {
                "type": "layer",
                "provider": provider.meta.id,
                "cell": cell_id,
                "layer": layer.model_dump(mode="json"),
            }
        )

    # polled tier -----------------------------------------------------------
    async def _poll_loop(self, p: Provider) -> None:
        backoff = BACKOFF_BASE_S
        interval = float(p.meta.interval_s or p.meta.ttl_s)
        while True:
            try:
                await p.refresh(self.ctx)
                self._publish_layer(p, "global", 0.0, 0.0)
                backoff = BACKOFF_BASE_S
                delay = interval * random.uniform(1 - JITTER, 1 + JITTER)
            except asyncio.CancelledError:
                raise
            except Exception as exc:  # noqa: BLE001 - upstream failures must not kill the loop
                log.warning("refresh failed provider=%s err=%s", p.meta.id, type(exc).__name__)
                delay = backoff
                backoff = min(backoff * 2, BACKOFF_CAP_S)
            await _sleep(delay)

    # on-demand tier --------------------------------------------------------
    def request_cell(self, provider_id: str, cell: Cell) -> None:
        """Fire-and-forget singleflight fetch; safe to call from any thread."""
        loop = self._loop
        if loop is None:
            return
        if threading.get_ident() == self._loop_thread:
            self._spawn(provider_id, cell)
        else:
            loop.call_soon_threadsafe(self._spawn, provider_id, cell)

    def _spawn(self, provider_id: str, cell: Cell) -> None:
        key = (provider_id, cell.id)
        provider = self.providers.get(provider_id)
        if provider is None or key in self._inflight:
            return
        task = asyncio.create_task(self._fetch(provider, cell), name=f"fetch:{provider_id}")
        self._inflight[key] = task

        def _done(_t: asyncio.Task, key: tuple[str, str] = key) -> None:
            self._inflight.pop(key, None)

        task.add_done_callback(_done)

    async def _fetch(self, provider: Provider, cell: Cell) -> None:
        try:
            await provider.fetch_cell(self.ctx, cell)
        except asyncio.CancelledError:
            raise
        except Exception as exc:  # noqa: BLE001
            log.warning("fetch failed provider=%s err=%s", provider.meta.id, type(exc).__name__)
        try:
            # publish even after failure: a fallback estimate may have been stored
            self._publish_layer(provider, cell.id, cell.lat, cell.lon)
        except Exception as exc:  # noqa: BLE001
            log.warning("publish failed provider=%s err=%s", provider.meta.id, type(exc).__name__)


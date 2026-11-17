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
NUDGE_MIN_GAP_S = 10.0


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
        # One refresh per provider at a time, poll or nudge (review WR-S1)
        self._running: dict[str, asyncio.Task] = {}
        self._last_nudge: dict[str, float] = {}
        # A nudge that cannot start now is kept, not dropped (review WR-S2): it runs when the
        # in-flight refresh ends, or when the min gap has passed.
        self._pending: set[str] = set()
        self._deferred: dict[str, asyncio.TimerHandle] = {}
        self._stopping = False

    # lifecycle -------------------------------------------------------------
    async def start(self) -> None:
        self._loop = asyncio.get_running_loop()
        self._loop_thread = threading.get_ident()
        self._stopping = False
        for p in self.providers.values():
            if p.meta.tier == "polled":
                t = asyncio.create_task(self._poll_loop(p), name=f"poll:{p.meta.id}")
                self._tasks.add(t)
                t.add_done_callback(self._tasks.discard)

    async def stop(self) -> None:
        self._stopping = True  # cancelled refreshes must not re-arm pending nudges
        tasks = list(self._tasks) + list(self._inflight.values()) + list(self._running.values())
        for t in tasks:
            t.cancel()
        if tasks:
            await asyncio.wait(tasks, timeout=1.0)
        for h in self._deferred.values():
            h.cancel()
        self._tasks.clear()
        self._inflight.clear()
        self._running.clear()
        self._pending.clear()
        self._deferred.clear()

    # publishing ------------------------------------------------------------
    def _publish_layer(self, provider: Provider, cell_id: str, lat: float, lon: float) -> None:
        bus = self.ctx.bus
        if bus is None:
            return
        if provider.meta.exact_location_only:
            # an exact-location layer depends on each phone's own point: tell the streams to
            # compute it per subscriber (behind the Home gate) instead of broadcasting (0, 0)
            bus.publish({"type": "touch", "provider": provider.meta.id})
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
    def _start_refresh(self, provider_id: str, coro) -> asyncio.Task:
        """Run `coro` as the provider's single in-flight refresh (caller checked it is idle)."""
        task = asyncio.create_task(coro, name=f"refresh:{provider_id}")
        self._running[provider_id] = task

        def _done(t: asyncio.Task, pid: str = provider_id) -> None:
            if self._running.get(pid) is t:  # never clear a newer refresh's registration
                del self._running[pid]
            if pid in self._pending and self._loop is not None and not self._loop.is_closed():
                # a nudge arrived mid-refresh; its stops were not in this sweep's snapshot
                self._pending.discard(pid)
                self._loop.call_soon(self._start_nudge, pid)

        task.add_done_callback(_done)
        return task

    async def _wait_idle(self, provider_id: str) -> None:
        """Wait for any in-flight refresh (e.g. a nudge) without inheriting its outcome."""
        while (t := self._running.get(provider_id)) is not None:
            await asyncio.wait({t})

    async def _poll_loop(self, p: Provider) -> None:
        backoff = BACKOFF_BASE_S
        interval = float(p.meta.interval_s or p.meta.ttl_s)
        while True:
            try:
                # never run beside a nudge: wait for it, then do the full sweep (review WR-S1)
                await self._wait_idle(p.meta.id)
                await self._start_refresh(p.meta.id, p.refresh(self.ctx))
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

    def nudge(self, provider_id: str) -> None:
        """Fire-and-forget immediate refresh (rate guarded); safe to call from any thread."""
        loop = self._loop
        if loop is None:
            return
        if threading.get_ident() == self._loop_thread:
            self._start_nudge(provider_id)
        else:
            loop.call_soon_threadsafe(self._start_nudge, provider_id)

    def _start_nudge(self, provider_id: str) -> None:
        p = self.providers.get(provider_id)
        if p is None or self._stopping:
            return
        if provider_id in self._running:
            self._pending.add(provider_id)  # re-run once the current refresh ends (WR-S2)
            return
        now = self.ctx.clock()
        last = self._last_nudge.get(provider_id)
        if last is not None and now - last < NUDGE_MIN_GAP_S:
            if provider_id not in self._deferred and self._loop is not None:
                wait = max(0.0, NUDGE_MIN_GAP_S - (now - last))
                self._deferred[provider_id] = self._loop.call_later(
                    wait, self._run_deferred, provider_id
                )
            return
        h = self._deferred.pop(provider_id, None)
        if h is not None:
            h.cancel()  # this nudge covers the deferred one
        self._pending.discard(provider_id)
        self._last_nudge[provider_id] = now
        task = self._start_refresh(provider_id, self._nudge_run(p))
        self._tasks.add(task)
        task.add_done_callback(self._tasks.discard)

    def _run_deferred(self, provider_id: str) -> None:
        self._deferred.pop(provider_id, None)
        self._start_nudge(provider_id)

    async def _nudge_run(self, p: Provider) -> None:
        try:
            await p.refresh(self.ctx)
            self._publish_layer(p, "global", 0.0, 0.0)
        except asyncio.CancelledError:
            raise
        except Exception as exc:  # noqa: BLE001
            log.warning("nudge failed provider=%s err=%s", p.meta.id, type(exc).__name__)

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


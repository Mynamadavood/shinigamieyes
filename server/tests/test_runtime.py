import asyncio
import time

import httpx
from shinigami import runtime as rt
from shinigami.geo import Cell
from shinigami.providers.base import Provider, ProviderContext, ProviderMeta
from shinigami.runtime import EventBus, Runtime
from shinigami.schema import Layer
from shinigami.store import Store


def test_bus_fanout_overflow_unsubscribe():
    bus = EventBus()
    a, b = bus.subscribe(), bus.subscribe()
    bus.publish({"n": 1})
    assert a.get_nowait() == {"n": 1} and b.get_nowait() == {"n": 1}
    for i in range(150):
        bus.publish({"n": i})
    assert a.qsize() == 100
    assert a.get_nowait() == {"n": 50}  # oldest dropped
    bus.unsubscribe(b)
    bus.publish({"n": "x"})
    assert b.qsize() == 100 and a.qsize() == 100


class FakeCellProvider(Provider):
    meta = ProviderMeta(
        id="uv_window", tier="on_demand", ttl_s=1, stale_after_s=None, attribution="x"
    )

    def __init__(self):
        self.calls = 0

    async def fetch_cell(self, ctx, cell):
        self.calls += 1
        await asyncio.sleep(0.05)

    def query(self, ctx, lat, lon, now):
        return Layer(id="uv_window", status="fresh", rev=1, as_of=now, attribution="x", items=[])


class FlakyPolled(Provider):
    meta = ProviderMeta(
        id="uv_now", tier="polled", ttl_s=300, stale_after_s=None, attribution="x", interval_s=300
    )

    def __init__(self, fails):
        self.fails = fails
        self.calls = 0

    async def refresh(self, ctx):
        self.calls += 1
        if self.calls <= self.fails:
            raise httpx.ConnectError("boom")

    def query(self, ctx, lat, lon, now):
        return Layer(id="uv_now", status="fresh", rev=1, as_of=now, attribution="x", items=[])


def make_ctx(tmp_path):
    return ProviderContext(
        settings=None, clock=time.time, store=Store(tmp_path / "r.db"), bus=EventBus()
    )


async def test_singleflight_and_publish(tmp_path):
    ctx = make_ctx(tmp_path)
    q = ctx.bus.subscribe()
    p = FakeCellProvider()
    runtime = Runtime(ctx, [p])
    await runtime.start()
    cell = Cell("-37.8,145.0", -37.8, 145.0)
    for _ in range(5):
        runtime.request_cell("uv_window", cell)
    ev = await asyncio.wait_for(q.get(), 2)
    assert p.calls == 1
    assert ev["type"] == "layer" and ev["provider"] == "uv_window" and ev["cell"] == cell.id
    assert ev["layer"]["id"] == "uv_window"
    await runtime.stop()


async def test_request_cell_from_thread(tmp_path):
    ctx = make_ctx(tmp_path)
    q = ctx.bus.subscribe()
    p = FakeCellProvider()
    runtime = Runtime(ctx, [p])
    await runtime.start()
    cell = Cell("c", -37.8, 145.0)
    await asyncio.to_thread(runtime.request_cell, "uv_window", cell)
    await asyncio.wait_for(q.get(), 2)
    assert p.calls == 1
    await runtime.stop()


async def test_polled_backoff_then_publish(tmp_path, monkeypatch):
    delays = []
    real_sleep = asyncio.sleep

    async def fake_sleep(s):
        delays.append(s)
        await real_sleep(0)

    monkeypatch.setattr(rt, "_sleep", fake_sleep)
    ctx = make_ctx(tmp_path)
    q = ctx.bus.subscribe()
    p = FlakyPolled(fails=7)
    runtime = Runtime(ctx, [p])
    await runtime.start()
    ev = await asyncio.wait_for(q.get(), 2)
    assert ev["provider"] == "uv_now" and ev["cell"] == "global"
    assert delays[:7] == [30, 60, 120, 240, 480, 960, 1800]
    await runtime.stop()


async def test_stop_is_fast(tmp_path):
    ctx = make_ctx(tmp_path)
    runtime = Runtime(ctx, [FlakyPolled(fails=0), FakeCellProvider()])
    await runtime.start()
    runtime.request_cell("uv_window", Cell("c", 0.0, 0.0))
    await asyncio.sleep(0.01)
    t0 = time.perf_counter()
    await runtime.stop()
    assert time.perf_counter() - t0 < 1.0


async def test_lifespan_wiring(settings):
    from shinigami.main import create_app

    app = create_app(settings, start_runtime=False)
    async with app.router.lifespan_context(app):
        assert app.state.ctx.runtime is None
    app2 = create_app(settings, start_runtime=True)
    async with app2.router.lifespan_context(app2):
        assert app2.state.ctx.runtime is not None


class ExactPolled(Provider):
    meta = ProviderMeta(
        id="dep_stub",
        tier="polled",
        ttl_s=300,
        stale_after_s=None,
        attribution="x",
        interval_s=300,
        exact_location_only=True,
    )

    def __init__(self, fail=False, gate=None):
        self.calls = 0
        self.queries: list[tuple[float, float]] = []
        self.fail = fail
        self.gate = gate

    async def refresh(self, ctx):
        self.calls += 1
        if self.gate is not None:
            await self.gate.wait()
        if self.fail:
            raise ValueError("secret message text")

    def query(self, ctx, lat, lon, now):
        self.queries.append((lat, lon))
        return Layer(id="dep_stub", status="fresh", rev=1, as_of=now, attribution="x", items=[])


async def test_exact_polled_publishes_touch_only(tmp_path):
    ctx = make_ctx(tmp_path)
    q = ctx.bus.subscribe()
    p = ExactPolled()
    runtime = Runtime(ctx, [p])
    await runtime.start()
    ev = await asyncio.wait_for(q.get(), 2)
    assert ev == {"type": "touch", "provider": "dep_stub"}
    assert q.empty()
    assert p.queries == []
    await runtime.stop()


async def test_nudge_rate_guard_and_unknown(tmp_path):
    ctx = make_ctx(tmp_path)
    now = {"t": 1000.0}
    ctx.clock = lambda: now["t"]
    q = ctx.bus.subscribe()
    gate = asyncio.Event()
    gate.set()
    p = ExactPolled(gate=gate)
    runtime = Runtime(ctx, [p])
    runtime._loop = asyncio.get_running_loop()
    runtime._loop_thread = __import__("threading").get_ident()
    runtime.nudge("nope")
    runtime.nudge("dep_stub")
    runtime.nudge("dep_stub")
    await asyncio.sleep(0.05)
    assert p.calls == 1
    assert q.get_nowait() == {"type": "touch", "provider": "dep_stub"}
    runtime.nudge("dep_stub")
    await asyncio.sleep(0.05)
    assert p.calls == 1
    now["t"] += rt.NUDGE_MIN_GAP_S + 1
    runtime.nudge("dep_stub")
    await asyncio.sleep(0.05)
    assert p.calls == 2
    await runtime.stop()


async def test_nudge_skips_while_refreshing(tmp_path):
    ctx = make_ctx(tmp_path)
    gate = asyncio.Event()
    p = ExactPolled(gate=gate)
    runtime = Runtime(ctx, [p])
    await runtime.start()
    await asyncio.sleep(0.05)  # poll loop refresh is now blocked on the gate
    assert p.calls == 1
    runtime.nudge("dep_stub")
    await asyncio.sleep(0.05)
    assert p.calls == 1
    await runtime.stop()


async def test_nudge_from_thread_and_failure_log(tmp_path, caplog):
    ctx = make_ctx(tmp_path)
    p = ExactPolled(fail=True)
    runtime = Runtime(ctx, [])
    runtime.providers = {"dep_stub": p}
    runtime._loop = asyncio.get_running_loop()
    runtime._loop_thread = -1  # force the thread-safe path
    caplog.set_level("DEBUG")
    runtime.nudge("dep_stub")
    await asyncio.sleep(0.1)
    msgs = [r.getMessage() for r in caplog.records if r.name == "shinigami.runtime"]
    assert msgs == ["nudge failed provider=dep_stub err=ValueError"]
    await runtime.stop()


def test_nudge_before_start_is_noop(tmp_path):
    Runtime(make_ctx(tmp_path), [ExactPolled()]).nudge("dep_stub")

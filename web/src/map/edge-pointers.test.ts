import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  EdgePointers,
  HYSTERESIS_PX,
  MAX_POINTERS,
  isOnScreen,
  rayToRect,
  screenAngle,
  type PointerMapLike,
  type Rect,
} from "./edge-pointers";

const RECT: Rect = { top: 100, left: 8, right: 392, bottom: 600 };

describe("screenAngle", () => {
  const from = { lat: -37.8, lon: 144.9 };
  it("east is 90 at bearing 0 and 0 at bearing 90", () => {
    const to = { lat: -37.8, lon: 145.0 };
    expect(Math.round(screenAngle(from, to, 0))).toBe(90);
    expect(Math.round(screenAngle(from, to, 90))).toBe(0);
  });
  it("south is 180 and is normalised to [0, 360)", () => {
    expect(Math.round(screenAngle(from, { lat: -37.9, lon: 144.9 }, 0))).toBe(180);
    const a = screenAngle(from, { lat: -37.7, lon: 144.9 }, 30);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThan(360);
    expect(Math.round(a)).toBe(330);
  });
});

describe("rayToRect", () => {
  it("hits the right edge at the centre y for 90 deg", () => {
    const cx = (RECT.left + RECT.right) / 2;
    const cy = (RECT.top + RECT.bottom) / 2;
    const r = rayToRect(cx, cy, 90, RECT);
    expect(r.edge).toBe("right");
    expect(r.x).toBe(RECT.right);
    expect(Math.round(r.y)).toBe(cy);
  });
  it("hits the top edge at 45 deg in a wide rect", () => {
    const wide: Rect = { top: 0, left: 0, right: 400, bottom: 100 };
    expect(rayToRect(200, 50, 45, wide).edge).toBe("top");
    expect(rayToRect(200, 50, 180, wide).edge).toBe("bottom");
    expect(rayToRect(200, 50, 270, wide).edge).toBe("left");
  });
});

describe("isOnScreen", () => {
  it("applies 16 px hysteresis while a pointer is shown", () => {
    const p = { x: RECT.left + 10, y: 300 };
    expect(isOnScreen(p, RECT, false)).toBe(true);
    expect(isOnScreen(p, RECT, true)).toBe(false);
    expect(isOnScreen({ x: RECT.left + HYSTERESIS_PX + 4, y: 300 }, RECT, true)).toBe(true);
    expect(isOnScreen({ x: RECT.left - 1, y: 300 }, RECT, false)).toBe(false);
  });
});

function stop(id: string, lon: number, lat: number, dist: number, name = "Flinders Street Station", mode = "train"): any {
  return {
    id: `stop:${id}`, layer: "transit_stops", group: mode, name, verb: "", target_ts: null, kind: "static",
    severity: 0, detail: { distance_m: dist, mode }, geom: { type: "Point", coordinates: [lon, lat] },
    fetched_at: 0, stale_after_s: null, computed: true,
  };
}

function setup(over: { reducedMotion?: boolean; rect?: Rect | null; hidden?: boolean; inside?: (l: [number, number]) => boolean } = {}) {
  const handlers: Record<string, Array<() => void>> = {};
  const state = { rect: over.rect === undefined ? RECT : over.rect, hidden: over.hidden ?? false };
  const map = {
    getCenter: () => ({ lng: 144.9, lat: -37.8 }),
    getBearing: () => 0,
    // on-screen when within +-0.001 degrees of the centre
    project: (l: [number, number]) => ({ x: 200 + (l[0] - 144.9) * 100000, y: 350 - (l[1] + 37.8) * 100000 }),
    getBounds: () => ({ contains: (l: [number, number]) => (over.inside ?? ((q) => Math.abs(q[0] - 144.9) < 0.002 && Math.abs(q[1] + 37.8) < 0.002))(l) }),
    easeTo: vi.fn(),
    jumpTo: vi.fn(),
    on: (ev: string, fn: () => void) => {
      (handlers[ev] ??= []).push(fn);
    },
    once: vi.fn((ev: string, fn: () => void) => {
      (handlers[`once:${ev}`] ??= []).push(fn);
    }),
  } satisfies PointerMapLike;
  const host = document.createElement("div");
  document.body.appendChild(host);
  const onArrive = vi.fn();
  const onTap = vi.fn();
  const ep = new EdgePointers({
    host,
    map,
    reducedMotion: over.reducedMotion ?? true,
    clampRect: () => state.rect,
    onArrive,
    onTap,
    hidden: () => state.hidden,
  });
  const btns = () => Array.from(host.querySelectorAll<HTMLButtonElement>("button.edge-pointer"));
  return { ep, map, host, btns, onArrive, onTap, state, handlers };
}

const ORIGIN = { lat: -37.8, lon: 144.9 };

beforeEach(() => {
  document.body.replaceChildren();
});

describe("EdgePointers", () => {
  it("shows one pointer for the off-screen stop with name, distance, glyphs and CSSOM props", () => {
    const t = setup();
    t.ep.update(
      [stop("near", 144.9, -37.8, 50, "Near Stop", "tram"), stop("far", 144.91, -37.8, 900)],
      "server",
    );
    const b = t.btns();
    expect(b).toHaveLength(1);
    expect(b[0].querySelector(".ptr-name")!.textContent).toBe("Flinders St");
    expect(b[0].querySelector(".ptr-dist")!.textContent).toBe(" · 900 m");
    const hrefs = Array.from(b[0].querySelectorAll("use")).map((u) => u.getAttribute("href"));
    expect(hrefs).toEqual(["/icons.svg#pointer", "/icons.svg#stop-train"]);
    expect(b[0].style.getPropertyValue("--x")).toMatch(/px$/);
    expect(b[0].style.getPropertyValue("--y")).toMatch(/px$/);
    const arrow = b[0].querySelector<SVGElement>(".ptr-arrow")!;
    expect(arrow.style.getPropertyValue("--rot")).toBe("90deg");
    expect(b[0].getAttribute("aria-label")).toBe("Show Flinders Street Station, 900 metres away");
    expect(b[0].classList.contains("enter")).toBe(true);
  });

  it("caps at 5 pointers, nearest first", () => {
    const t = setup();
    const stops = Array.from({ length: 8 }, (_, i) => stop(`s${i}`, 144.95, -37.8 + i * 0.0001, 1000 + i * 100, `Stop ${i}`));
    t.ep.update(stops, "server");
    const b = t.btns();
    expect(b.length).toBeLessThanOrEqual(MAX_POINTERS);
    expect(b.length).toBeGreaterThan(1);
    expect(b[0].querySelector(".ptr-name")!.textContent).toBe("Stop 0");
  });

  it("separates colliding pointers on one edge and drops one with no free slot", () => {
    const t = setup();
    t.ep.update([stop("a", 144.95, -37.8, 1000, "A"), stop("b", 144.95, -37.8001, 1100, "B")], "server");
    const ys = t.btns().map((b) => parseInt(b.style.getPropertyValue("--y"), 10));
    expect(ys).toHaveLength(2);
    expect(Math.abs(ys[0] - ys[1])).toBeGreaterThanOrEqual(48 + 4);
    // a rect only tall enough for one pointer
    const tight = setup({ rect: { top: 0, left: 0, right: 400, bottom: 150 } });
    const many = Array.from({ length: 5 }, (_, i) => stop(`t${i}`, 144.95, -37.8, 1000 + i, `T${i}`));
    tight.ep.update(many, "server");
    expect(tight.btns().length).toBeLessThan(5);
  });

  it("shows none when hidden, rect null or short, origin null", () => {
    const stops = [stop("far", 144.91, -37.8, 900)];
    const a = setup({ hidden: true });
    a.ep.update(stops, "server");
    expect(a.btns()).toHaveLength(0);
    const b = setup({ rect: null });
    b.ep.update(stops, "server");
    expect(b.btns()).toHaveLength(0);
    const c = setup({ rect: { top: 100, left: 8, right: 392, bottom: 200 } });
    c.ep.update(stops, "server");
    expect(c.btns()).toHaveLength(0);
    const d = setup();
    d.ep.update(stops, null);
    expect(d.btns()).toHaveLength(0);
  });

  it("removes pointers when the sheet opens (hidden) on recompute", () => {
    const t = setup();
    t.ep.update([stop("far", 144.91, -37.8, 900)], "server");
    expect(t.btns()).toHaveLength(1);
    t.state.hidden = true;
    t.ep.recompute();
    expect(t.btns()).toHaveLength(0);
  });

  it("tap eases to the stop and opens its card after moveend", () => {
    const t = setup({ reducedMotion: false });
    t.ep.update([stop("far", 144.91, -37.8, 900)], "server");
    t.btns()[0].click();
    expect(t.onTap).toHaveBeenCalled();
    expect(t.map.easeTo).toHaveBeenCalledWith(expect.objectContaining({ center: [144.91, -37.8], duration: 600 }));
    expect(t.map.jumpTo).not.toHaveBeenCalled();
    expect(t.onArrive).not.toHaveBeenCalled();
    t.map.once.mock.calls[0][1]();
    expect(t.onArrive).toHaveBeenCalledWith("stop:far");
  });

  it("tap jumps under reduced motion", () => {
    const t = setup({ reducedMotion: true });
    t.ep.update([stop("far", 144.91, -37.8, 900)], "server");
    t.btns()[0].click();
    expect(t.map.jumpTo).toHaveBeenCalledWith(expect.objectContaining({ center: [144.91, -37.8] }));
    expect(t.map.easeTo).not.toHaveBeenCalled();
  });

  it("uses live haversine for a GPS origin", () => {
    const t = setup();
    t.ep.update([stop("far", 144.91, -37.8, 5)], ORIGIN);
    const txt = t.btns()[0].querySelector(".ptr-dist")!.textContent!;
    expect(txt).not.toBe(" · 5 m");
    expect(txt).toMatch(/^ · (8\d\d|9\d\d) m$/);
  });

  it("fades out with a leave class when not reduced, then removes", () => {
    vi.useFakeTimers();
    const t = setup({ reducedMotion: false });
    t.ep.update([stop("far", 144.91, -37.8, 900)], "server");
    t.ep.update([], "server");
    expect(t.btns()[0].classList.contains("leave")).toBe(true);
    vi.advanceTimersByTime(130);
    expect(t.btns()).toHaveLength(0);
    vi.useRealTimers();
  });

  it("destroy removes the container", () => {
    const t = setup();
    t.ep.update([stop("far", 144.91, -37.8, 900)], "server");
    t.ep.destroy();
    expect(t.host.querySelector(".edge-pointers")).toBeNull();
  });
});

describe("pitched direction and ray origin (WR-W5)", () => {
  // a 60 degree pitch squeezes the forward axis: north is drawn at half scale, and the map
  // centre sits at y 300 (bottom padding), not at the clamp rect centre (y 350).
  // South of the centre, the far points are behind the camera and project mirrored.
  function pitched() {
    const map = {
      getCenter: () => ({ lng: 144.9, lat: -37.8 }),
      getBearing: () => 0,
      project: (l: [number, number]) => {
        const dx = (l[0] - 144.9) * 100000;
        const dy = -(l[1] + 37.8) * 100000 * 0.5;
        if (l[1] < -37.85) return { x: 200 - dx, y: 300 - Math.abs(dy) };
        return { x: 200 + dx, y: 300 + dy };
      },
      getBounds: () => ({ contains: () => false }),
      easeTo: vi.fn(),
      jumpTo: vi.fn(),
      on: () => {},
      once: vi.fn(),
    } satisfies PointerMapLike;
    const host = document.createElement("div");
    document.body.appendChild(host);
    const ep = new EdgePointers({ host, map, reducedMotion: true, clampRect: () => RECT, onArrive: vi.fn(), hidden: () => false });
    const rot = () => host.querySelector<SVGElement>(".ptr-arrow")!.style.getPropertyValue("--rot");
    const btn = () => host.querySelector<HTMLButtonElement>("button.edge-pointer")!;
    return { ep, rot, btn };
  }

  it("points along the projected direction, not the geographic bearing, in front of the camera", () => {
    const t = pitched();
    t.ep.update([stop("ne", 144.91, -37.79, 1200)], "server");
    const geo = Math.round(screenAngle({ lat: -37.8, lon: 144.9 }, { lat: -37.79, lon: 144.91 }, 0));
    expect(geo).toBeLessThan(45);
    // projected: dx 1000, dy -500 -> atan2(1000, 500) = 63.4 deg
    expect(t.rot()).toBe("63deg");
  });

  it("falls back to the geographic bearing for a point behind the camera", () => {
    const t = pitched();
    t.ep.update([stop("se", 144.95, -37.9, 9000)], "server");
    const geo = Math.round(screenAngle({ lat: -37.8, lon: 144.9 }, { lat: -37.9, lon: 144.95 }, 0));
    expect(t.rot()).toBe(`${geo}deg`);
  });

  it("starts the ray at the projected map centre", () => {
    const t = pitched();
    t.ep.update([stop("e", 144.95, -37.8, 4000)], "server");
    expect(t.rot()).toBe("90deg");
    // right edge at the centre's screen y (300), chip centred on it (48 px hit height)
    expect(t.btn().style.getPropertyValue("--y")).toBe("276px");
  });
});

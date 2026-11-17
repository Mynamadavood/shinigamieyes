import { haversineM } from "../location";
import { modeWord, shortStopName } from "../transit";
import type { Item } from "../types";
import { fmtDistance, spokenDistance } from "./camera-card";
import type { TagOrigin } from "./tags";

export const MAX_POINTERS = 5;
export const HYSTERESIS_PX = 16;
export const SLIDE_PX = 36;
export const GAP_PX = 4;
export const EASE_MS = 600;
/** at most this many map.project calls per recompute for the on-screen test (T-03-08-03) */
const MAX_PROJECTIONS = 6;
/** a projected direction further than this from the geographic one is a behind-camera flip */
const MAX_PROJ_DEV_DEG = 90;
const MIN_RECT_H = 144;
const FADE_MS = 120;
const HIT_H = 48;
const FALLBACK_W = 140;
const NS = "http://www.w3.org/2000/svg";

export interface Rect {
  top: number;
  left: number;
  right: number;
  bottom: number;
}

type Edge = "top" | "right" | "bottom" | "left";

export interface PointerMapLike {
  getCenter(): { lng: number; lat: number };
  getBearing(): number;
  project(l: [number, number]): { x: number; y: number };
  getBounds(): { contains(l: [number, number]): boolean };
  easeTo(o: Record<string, unknown>): void;
  jumpTo(o: Record<string, unknown>): void;
  on(ev: string, fn: () => void): unknown;
  once(ev: string, fn: () => void): unknown;
}

export interface EdgePointersDeps {
  host: HTMLElement;
  map: PointerMapLike;
  reducedMotion: boolean;
  clampRect(): Rect | null;
  onArrive(stopId: string): void;
  hidden(): boolean;
  /** called on a tap before the map moves (turns follow off like a user pan) */
  onTap?(): void;
  /** bottom padding so the stop lands in the visible map area */
  padding?(): { top: number; left: number; right: number; bottom: number };
  /** rectangles a pointer must keep clear of (the recenter button) */
  avoid?(): Rect[];
}

/** Geographic bearing from `from` to `to`, minus the map bearing, in [0, 360). 0 = top of screen. */
export function screenAngle(
  from: { lat: number; lon: number },
  to: { lat: number; lon: number },
  mapBearingDeg: number,
): number {
  const rad = Math.PI / 180;
  const p1 = from.lat * rad;
  const p2 = to.lat * rad;
  const dl = (to.lon - from.lon) * rad;
  const y = Math.sin(dl) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  const brg = (Math.atan2(y, x) / rad + 360) % 360;
  return (((brg - mapBearingDeg) % 360) + 360) % 360;
}

/** Smallest absolute difference between two angles in degrees, in [0, 180]. */
export function angleDiff(a: number, b: number): number {
  const d = (((a - b) % 360) + 360) % 360;
  return d > 180 ? 360 - d : d;
}

/**
 * Screen direction (0 = up, clockwise) from (cx, cy) to a projected point, or null when the
 * projection is unusable: not finite, on the origin, or flipped (a point behind the camera
 * projects mirrored, so it differs from the geographic direction by more than 90 degrees).
 */
export function projectedAngle(
  cx: number,
  cy: number,
  p: { x: number; y: number } | undefined,
  geoAngle: number,
): number | null {
  if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return null;
  const dx = p.x - cx;
  const dy = p.y - cy;
  if (Math.hypot(dx, dy) < 1) return null;
  const a = ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360;
  return angleDiff(a, geoAngle) < MAX_PROJ_DEV_DEG ? a : null;
}

/** Where a ray from (cx, cy) at angleDeg (0 = up, clockwise) meets the rectangle. */
export function rayToRect(
  cx: number,
  cy: number,
  angleDeg: number,
  rect: Rect,
): { x: number; y: number; edge: Edge } {
  const a = (angleDeg * Math.PI) / 180;
  const dx = Math.sin(a);
  const dy = -Math.cos(a);
  const eps = 1e-9;
  const tx = Math.abs(dx) < eps ? Infinity : ((dx > 0 ? rect.right : rect.left) - cx) / dx;
  const ty = Math.abs(dy) < eps ? Infinity : ((dy > 0 ? rect.bottom : rect.top) - cy) / dy;
  if (tx < ty) {
    return { x: dx > 0 ? rect.right : rect.left, y: cy + dy * tx, edge: dx > 0 ? "right" : "left" };
  }
  return { x: cx + dx * ty, y: dy > 0 ? rect.bottom : rect.top, edge: dy > 0 ? "bottom" : "top" };
}

/**
 * On-screen test with hysteresis. A pointer appears as soon as the point leaves the rect and is
 * removed only once the point is HYSTERESIS_PX inside it (`pointerShown` true).
 */
export function isOnScreen(p: { x: number; y: number }, rect: Rect, pointerShown: boolean): boolean {
  const m = pointerShown ? HYSTERESIS_PX : 0;
  return p.x >= rect.left + m && p.x <= rect.right - m && p.y >= rect.top + m && p.y <= rect.bottom - m;
}

function pointOf(item: Item): [number, number] | null {
  const g = item.geom as { type?: unknown; coordinates?: unknown } | null;
  if (!g || g.type !== "Point" || !Array.isArray(g.coordinates)) return null;
  const [lon, lat] = g.coordinates as unknown[];
  if (typeof lon !== "number" || typeof lat !== "number" || !Number.isFinite(lon) || !Number.isFinite(lat)) {
    return null;
  }
  return [lon, lat];
}

function overlaps(a: Rect, b: Rect, gap: number): boolean {
  return a.left < b.right + gap && a.right + gap > b.left && a.top < b.bottom + gap && a.bottom + gap > b.top;
}

interface Stop {
  item: Item;
  lngLat: [number, number];
  dist: number;
}

interface Shown {
  el: HTMLElement;
  distEl: HTMLElement;
  arrow: SVGElement;
  w: number;
  leaving: boolean;
}

function svgIcon(cls: string, href: string): SVGElement {
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("class", cls);
  svg.setAttribute("aria-hidden", "true");
  const use = document.createElementNS(NS, "use");
  use.setAttribute("href", href);
  svg.appendChild(use);
  return svg;
}

/** Edge arrow chips for stops that are off-screen (D-14). Stops only, never cameras or vehicles. */
export class EdgePointers {
  private readonly root: HTMLElement;
  private readonly shown = new Map<string, Shown>();
  private stops: Stop[] = [];
  private origin: TagOrigin = null;
  private raf = 0;
  private destroyed = false;
  /** layout reads cached for map-move frames; refreshed by every other recompute (WR-W9) */
  private layout: { rect: Rect | null; avoid: Rect[]; hidden: boolean } | null = null;
  private readonly onResize = () => this.recompute();

  constructor(private readonly deps: EdgePointersDeps) {
    this.root = document.createElement("div");
    this.root.className = "edge-pointers";
    deps.host.appendChild(this.root);
    deps.map.on("move", () => {
      if (this.destroyed || this.raf) return;
      this.raf = requestAnimationFrame(() => {
        this.raf = 0;
        // a move frame reuses the cached layout: no forced style/layout on top of the map frame
        this.run(false);
      });
    });
    deps.map.on("moveend", () => this.recompute());
    window.addEventListener("resize", this.onResize);
  }

  update(stops: Item[], origin: TagOrigin): void {
    this.origin = origin;
    const next: Stop[] = [];
    for (const item of stops) {
      if (item.layer !== "transit_stops") continue;
      if (item.detail && (item.detail["summary"] === true || item.detail["none"] === true)) continue;
      const lngLat = pointOf(item);
      if (!lngLat) continue;
      let dist: number;
      if (origin === "server") dist = Number(item.detail?.["distance_m"]);
      else if (origin) dist = haversineM(origin.lat, origin.lon, lngLat[1], lngLat[0]);
      else dist = NaN;
      if (!Number.isFinite(dist)) continue;
      next.push({ item, lngLat, dist });
    }
    next.sort((a, b) => a.dist - b.dist);
    this.stops = next;
    this.recompute();
  }

  /** Recompute with fresh layout reads (clamp rect, avoid rects, hidden). */
  recompute(): void {
    this.run(true);
  }

  private run(fresh: boolean): void {
    if (this.destroyed) return;
    if (fresh || !this.layout) {
      this.layout = { rect: this.deps.clampRect(), avoid: this.deps.avoid?.() ?? [], hidden: this.deps.hidden() };
    }
    const { rect, avoid, hidden } = this.layout;
    if (!this.origin || this.stops.length === 0 || hidden || !rect || rect.bottom - rect.top < MIN_RECT_H) {
      this.removeAll();
      return;
    }
    const { map } = this.deps;
    const bounds = map.getBounds();
    const centre = map.getCenter();
    const bearing = map.getBearing();
    let budget = MAX_PROJECTIONS;
    const projected = new Map<string, { x: number; y: number }>();
    const off: Stop[] = [];
    for (const s of this.stops) {
      const wasShown = this.shown.has(s.item.id) && !this.shown.get(s.item.id)!.leaving;
      if (!bounds.contains(s.lngLat)) {
        off.push(s);
        continue;
      }
      if (budget <= 0) {
        // out of projection budget this frame: keep the previous state
        if (wasShown) off.push(s);
        continue;
      }
      budget -= 1;
      const p = map.project(s.lngLat);
      projected.set(s.item.id, p);
      if (!isOnScreen(p, rect, wasShown)) off.push(s);
    }
    const chosen = off.slice(0, MAX_POINTERS);
    const placed: Rect[] = [];
    const keep = new Set<string>();
    // the ray starts at the screen point of the map centre (the padded viewport centre), the same
    // point the geographic bearing is measured from, kept inside the clamp rect (WR-W5)
    const pc = map.project([centre.lng, centre.lat]);
    const clamp = (v: number, lo: number, hi: number, dflt: number) =>
      Number.isFinite(v) ? Math.min(Math.max(v, lo), hi) : dflt;
    const cx = clamp(pc.x, rect.left, rect.right, (rect.left + rect.right) / 2);
    const cy = clamp(pc.y, rect.top, rect.bottom, (rect.top + rect.bottom) / 2);
    for (const s of chosen) {
      const entry = this.ensure(s);
      const geo = screenAngle({ lat: centre.lat, lon: centre.lng }, { lat: s.lngLat[1], lon: s.lngLat[0] }, bearing);
      // under pitch the screen direction is not the geographic bearing (perspective squeezes the
      // forward axis), so use the projected point; one projection per pointer (at most
      // MAX_POINTERS), reusing the on-screen test's. Behind the camera, fall back to the bearing.
      let p = projected.get(s.item.id);
      if (!p) p = map.project(s.lngLat);
      const angle = projectedAngle(cx, cy, p, geo) ?? geo;
      const hit = rayToRect(cx, cy, angle, rect);
      const pos = this.place(hit, entry.w, rect, placed, avoid);
      if (!pos) continue;
      placed.push({ left: pos.x, top: pos.y, right: pos.x + entry.w, bottom: pos.y + HIT_H });
      keep.add(s.item.id);
      entry.el.style.setProperty("--x", `${Math.round(pos.x)}px`);
      entry.el.style.setProperty("--y", `${Math.round(pos.y)}px`);
      entry.arrow.style.setProperty("--rot", `${Math.round(angle)}deg`);
      const txt = fmtDistance(s.dist);
      const want = ` · ${txt}`;
      if (entry.distEl.textContent !== want) entry.distEl.textContent = want;
      const label = `Show ${s.item.name}, ${spokenDistance(s.dist)} away`;
      if (entry.el.getAttribute("aria-label") !== label) entry.el.setAttribute("aria-label", label);
      this.reveal(entry);
    }
    for (const [id, e] of this.shown) {
      if (!keep.has(id)) this.drop(id, e);
    }
  }

  destroy(): void {
    this.destroyed = true;
    if (this.raf) cancelAnimationFrame(this.raf);
    window.removeEventListener("resize", this.onResize);
    this.root.remove();
    this.shown.clear();
  }

  private place(
    hit: { x: number; y: number; edge: Edge },
    w: number,
    rect: Rect,
    placed: Rect[],
    avoid: Rect[],
  ): { x: number; y: number } | null {
    const clampX = (x: number) => Math.min(Math.max(x, rect.left), Math.max(rect.left, rect.right - w));
    const clampY = (y: number) => Math.min(Math.max(y, rect.top), Math.max(rect.top, rect.bottom - HIT_H));
    const sideEdge = hit.edge === "left" || hit.edge === "right";
    let base: { x: number; y: number };
    if (hit.edge === "left") base = { x: rect.left, y: clampY(hit.y - HIT_H / 2) };
    else if (hit.edge === "right") base = { x: Math.max(rect.left, rect.right - w), y: clampY(hit.y - HIT_H / 2) };
    else if (hit.edge === "top") base = { x: clampX(hit.x - w / 2), y: rect.top };
    else base = { x: clampX(hit.x - w / 2), y: Math.max(rect.top, rect.bottom - HIT_H) };

    const free = (p: { x: number; y: number }) => {
      const r = { left: p.x, top: p.y, right: p.x + w, bottom: p.y + HIT_H };
      return !placed.some((o) => overlaps(r, o, GAP_PX)) && !avoid.some((o) => overlaps(r, o, GAP_PX));
    };
    // forward steps first (down on side edges, right on top and bottom), then reverse
    const at = (k: number) => (sideEdge ? { x: base.x, y: base.y + k * SLIDE_PX } : { x: base.x + k * SLIDE_PX, y: base.y });
    const inside = (p: { x: number; y: number }) =>
      p.x >= rect.left && p.y >= rect.top && p.x + w <= Math.max(rect.right, rect.left + w) && p.y + HIT_H <= Math.max(rect.bottom, rect.top + HIT_H);
    for (let k = 0; k < 64; k++) {
      const p = at(k);
      if (!inside(p)) break;
      if (free(p)) return p;
    }
    for (let k = -1; k > -64; k--) {
      const p = at(k);
      if (!inside(p)) break;
      if (free(p)) return p;
    }
    return null;
  }

  private ensure(s: Stop): Shown {
    const id = s.item.id;
    const existing = this.shown.get(id);
    if (existing) {
      if (existing.leaving) {
        existing.leaving = false;
        existing.el.classList.remove("leave");
      }
      return existing;
    }
    const el = document.createElement("button");
    el.type = "button";
    el.className = "edge-pointer";
    const chip = document.createElement("span");
    chip.className = "ptr-chip";
    const arrow = svgIcon("ptr-arrow", "/icons.svg#pointer");
    const mode = svgIcon("ptr-mode", `/icons.svg#stop-${modeWord(String(s.item.detail?.["mode"] ?? s.item.group))}`);
    const name = document.createElement("span");
    name.className = "ptr-name";
    name.textContent = shortStopName(s.item.name);
    const distEl = document.createElement("span");
    distEl.className = "ptr-dist";
    distEl.textContent = ` · ${fmtDistance(s.dist)}`;
    chip.append(arrow, mode, name, distEl);
    el.appendChild(chip);
    el.addEventListener("click", () => this.tap(id));
    this.root.appendChild(el);
    const measured = el.offsetWidth;
    const entry: Shown = { el, distEl, arrow, w: measured > 0 ? Math.max(48, measured) : FALLBACK_W, leaving: false };
    this.shown.set(id, entry);
    return entry;
  }

  private reveal(e: Shown): void {
    if (e.el.classList.contains("enter")) return;
    if (this.deps.reducedMotion) {
      e.el.classList.add("enter");
      return;
    }
    // force a style flush so the opacity transition runs from 0
    void e.el.offsetWidth;
    e.el.classList.add("enter");
  }

  private drop(id: string, e: Shown): void {
    if (this.deps.reducedMotion) {
      e.el.remove();
      this.shown.delete(id);
      return;
    }
    if (e.leaving) return;
    e.leaving = true;
    e.el.classList.remove("enter");
    e.el.classList.add("leave");
    setTimeout(() => {
      if (!e.leaving) return;
      e.el.remove();
      if (this.shown.get(id) === e) this.shown.delete(id);
    }, FADE_MS);
  }

  private removeAll(): void {
    for (const [id, e] of this.shown) this.drop(id, e);
  }

  private tap(id: string): void {
    const s = this.stops.find((x) => x.item.id === id);
    if (!s) return;
    const { map } = this.deps;
    this.deps.onTap?.();
    const padding = this.deps.padding?.();
    const opts: Record<string, unknown> = { center: [s.lngLat[0], s.lngLat[1]], ...(padding ? { padding } : {}) };
    map.once("moveend", () => {
      if (!this.destroyed) this.deps.onArrive(id);
    });
    if (this.deps.reducedMotion) map.jumpTo(opts);
    else map.easeTo({ ...opts, duration: EASE_MS });
  }
}

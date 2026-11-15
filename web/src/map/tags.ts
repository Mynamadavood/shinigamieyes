import { nowMs } from "../clock";
import { haversineM } from "../location";
import type { Item } from "../types";
import type { Card } from "./card";
import { cameraCardContent, fmtDistance, spokenDistance } from "./camera-card";
import { modeName, modeWord, shortStopName, walkMinText, walkSecondsFor } from "../transit";
import { stopCardContent, stopDisruptions, type TransitCardContext } from "./transit-card";
import type { CardContent } from "./card";

export const MAX_FULL = 20;
export const MAX_TOTAL = 60;
export const NEAR_M = 30;
export const RED_CAP = 3;
export const EXPAND_ZOOM = 17.5;
/** labelled tags allowed before the zoom-in expansion (D-11: only the nearest get labels) */
export const BASE_FULL = 8;
export const CLUSTER_PX = 96;
export const CLUSTER_MAX = 6;

/** CSS max-width of the label chip, used when the real width is not measurable */
export const LABEL_MAX_W = 144;
/** keep labels this far inside the viewport edge (same margin as the card) */
export const LABEL_EDGE = 16;

/** Which side of the icon the label chip goes: left only when right would clip and left fits. */
export function labelSide(x: number, labelW: number, viewportW: number, iconW = 32): "right" | "left" {
  const w = labelW > 0 ? labelW : LABEL_MAX_W;
  const rightEnd = x + iconW / 2 + w;
  const leftStart = x - iconW / 2 - w;
  return rightEnd > viewportW - LABEL_EDGE && leftStart >= LABEL_EDGE ? "left" : "right";
}

export type TagIcon =
  | "cctv"
  | "speed-cam"
  | "redlight-cam"
  | "stop-train"
  | "stop-tram"
  | "stop-bus"
  | "veh-tram"
  | "veh-bus";

export interface TagCand {
  id: string;
  x: number;
  y: number;
  dist: number;
  label: string;
  icon: TagIcon;
  /** label priority: stop 0, vehicle 1, camera 2 */
  prio: 0 | 1 | 2;
}

/** Stop tags are 40px tall, everything else 32px (collision test). */
const STOP_H = 40;

/** Priority first, then within 30 m first (ascending), then the rest by ascending distance. */
export function rankTags(c: TagCand[]): TagCand[] {
  return [...c].sort(
    (a, b) =>
      a.prio - b.prio ||
      (a.dist <= NEAR_M ? 0 : 1) - (b.dist <= NEAR_M ? 0 : 1) ||
      a.dist - b.dist,
  );
}

export function assignTags(
  ranked: TagCand[],
  zoom: number,
  w = 176,
  h = 32,
): { full: Set<string>; red: Set<string>; rendered: TagCand[] } {
  const red = new Set<string>();
  for (const c of ranked) {
    if (red.size >= RED_CAP) break;
    if (c.prio === 2 && c.dist <= NEAR_M) red.add(c.id);
  }

  const cap = zoom >= EXPAND_ZOOM ? MAX_FULL : BASE_FULL;
  const full = new Set<string>();
  const boxes: TagCand[] = [];
  // stops are always labelled, never demoted, and keep their boxes for collision
  for (const c of ranked) {
    if (c.prio !== 0) continue;
    full.add(c.id);
    boxes.push(c);
  }
  for (const c of ranked) {
    if (c.prio === 0) continue;
    // within-30 m red cameras (up to RED_CAP) keep their label even when the cap is used up
    if (full.size >= cap && !red.has(c.id)) continue;
    // a lower-ranked label that would overlap a kept one is demoted to a compact icon
    if (
      boxes.some(
        (b) =>
          Math.abs(b.x - c.x) < w &&
          Math.abs(b.y - c.y) < (b.prio === 0 || c.prio === 0 ? STOP_H : h),
      )
    ) {
      continue;
    }
    full.add(c.id);
    boxes.push(c);
  }

  // dense compact clusters: at most CLUSTER_MAX within CLUSTER_PX of each other, nearest first
  const kept: TagCand[] = [];
  const keptCompact: TagCand[] = [];
  for (const c of ranked) {
    if (full.has(c.id)) {
      kept.push(c);
      continue;
    }
    const near = keptCompact.filter((k) => Math.hypot(k.x - c.x, k.y - c.y) <= CLUSTER_PX).length;
    if (near >= CLUSTER_MAX) continue;
    keptCompact.push(c);
    kept.push(c);
  }
  return { full, red, rendered: kept.slice(0, MAX_TOTAL) };
}

const NS = "http://www.w3.org/2000/svg";
const DEBOUNCE_MS = 100;

export interface MarkerLike {
  setLngLat(l: [number, number]): MarkerLike;
  addTo(map: never): MarkerLike;
  remove(): MarkerLike;
}

export interface TagMapLike {
  project(l: [number, number]): { x: number; y: number };
  getZoom(): number;
  on(ev: string, fn: () => void): unknown;
}

export interface TagLayerDeps {
  map: TagMapLike;
  card: Card;
  createMarker(el: HTMLElement): MarkerLike;
  viewportWidth?(): number;
}

interface Entry {
  item: Item;
  el: HTMLElement;
  marker: MarkerLike;
  lngLat: [number, number];
  dist: number;
  walkS: number;
  added: boolean;
  metaEl: HTMLElement | null;
}

interface KindDesc {
  prio: 0 | 1 | 2;
  icon(item: Item): TagIcon;
  spoken(item: Item, dist: number, walkS: number): string;
  cardContent(
    item: Item,
    dist: number,
    walkS: number,
    ctx: TransitCardContext | null,
    nowMs: number,
  ): CardContent;
}

function stopMode(item: Item): "train" | "tram" | "bus" {
  const m = item.detail?.["mode"];
  return modeWord(typeof m === "string" ? m : item.group);
}

const CAMERA_DESC: KindDesc = {
  prio: 2,
  icon: (item) => iconFor(item.group),
  spoken: (item, dist) => `${spokenType(item.group)}, ${spokenDistance(dist)} away`,
  cardContent: (item, dist) => cameraCardContent(item, dist),
};

const STOP_DESC: KindDesc = {
  prio: 0,
  icon: (item) => `stop-${stopMode(item)}` as TagIcon,
  spoken: (item, dist, walkS) => {
    const mode = stopMode(item);
    const noun = mode === "train" ? "station" : "stop";
    const mins = Math.max(1, Math.ceil(walkS / 60));
    return `${modeName(mode)} ${noun}, ${item.name}, ${spokenDistance(dist)} away, ${mins} ${mins === 1 ? "minute" : "minutes"} walk`;
  },
  cardContent: (item, dist, walkS, ctx, nowMs) => stopCardContent(item, dist, walkS, ctx, nowMs),
};

function descFor(item: Item): KindDesc {
  return item.layer === "transit_stops" ? STOP_DESC : CAMERA_DESC;
}

function stopMeta(dist: number, walkS: number): string {
  return `${fmtDistance(dist)} · ${walkMinText(walkS)}`;
}

interface Located {
  item: Item;
  lngLat: [number, number];
}

function iconFor(group: string): TagIcon {
  return group === "speed" ? "speed-cam" : group === "redlight" ? "redlight-cam" : "cctv";
}

function spokenType(group: string): string {
  if (group === "guard") return "Guard post";
  return group === "speed" ? "Speed camera" : group === "redlight" ? "Red-light camera" : "CCTV camera";
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

/** A point the phone knows, "server" (saved place: use detail.distance_m) or null (hide all). */
export type TagOrigin = { lat: number; lon: number } | "server" | null;

/** Floating icon + label tags for positioned items; re-ranks on profile/view change and moveend only. */
export class TagLayer {
  private readonly entries = new Map<string, Entry>();
  private located: Located[] = [];
  private origin: TagOrigin = null;
  private selectedId: string | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private raf = 0;
  private groupMarked = false;
  private cardCtx: TransitCardContext | null = null;
  private readonly metas = new WeakMap<HTMLElement, HTMLElement | null>();

  constructor(private readonly deps: TagLayerDeps) {
    deps.map.on("moveend", () => {
      if (this.timer !== null) clearTimeout(this.timer);
      this.timer = setTimeout(() => {
        this.timer = null;
        this.reconcile();
      }, DEBOUNCE_MS);
    });
    deps.map.on("move", () => {
      if (!deps.card.isOpen() || this.raf) return;
      this.raf = requestAnimationFrame(() => {
        this.raf = 0;
        deps.card.update();
      });
    });
  }

  /** Positioned (non-summary) camera items; replaces the previous set. */
  update(items: Item[]): void {
    const next: Located[] = [];
    for (const item of items) {
      if (item.detail && (item.detail["summary"] === true || item.detail["none"] === true)) continue;
      const lngLat = pointOf(item);
      if (lngLat) next.push({ item, lngLat });
    }
    this.located = next;
    this.reconcile();
  }

  /**
   * Where distances are measured from. gps/search: a point the client knows. "server": a saved
   * place whose coordinates the phone never has, so distances come from the server's
   * detail.distance_m. null hides all tags.
   */
  setOrigin(o: TagOrigin): void {
    this.origin = o;
    this.reconcile();
  }

  private makeEl(item: Item): HTMLElement {
    const el = document.createElement("div");
    el.className = "map-tag";
    el.setAttribute("role", "button");
    el.setAttribute("tabindex", "0");
    const icon = document.createElement("div");
    icon.className = "tag-icon";
    const svg = document.createElementNS(NS, "svg");
    const use = document.createElementNS(NS, "use");
    use.setAttribute("href", `/icons.svg#${descFor(item).icon(item)}`);
    svg.appendChild(use);
    icon.appendChild(svg);
    const chip = document.createElement("div");
    chip.className = "tag-label";
    let metaEl: HTMLElement | null = null;
    if (descFor(item).prio === 0) {
      el.classList.add("stop");
      const nameEl = document.createElement("span");
      nameEl.className = "stop-name";
      nameEl.textContent = shortStopName(item.name);
      metaEl = document.createElement("span");
      metaEl.className = "stop-meta";
      chip.append(nameEl, metaEl);
    } else {
      chip.textContent = item.name;
    }
    const tick = document.createElement("div");
    tick.className = "tag-tick";
    el.append(icon, chip, tick);
    const id = item.id;
    this.metas.set(el, metaEl);
    el.addEventListener("click", () => this.select(id));
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        this.select(id);
      }
    });
    return el;
  }

  private reconcile(): void {
    const { map } = this.deps;
    const o = this.origin;
    if (!o || this.located.length === 0) {
      this.clearAll();
      return;
    }
    const byId = new Map<string, Located>();
    const cands: TagCand[] = [];
    const walks = new Map<string, number>();
    for (const l of this.located) {
      byId.set(l.item.id, l);
      let dist: number;
      let walkS: number;
      if (o === "server") {
        dist = Number(l.item.detail?.["distance_m"]);
        if (!Number.isFinite(dist)) continue;
        const ws = Number(l.item.detail?.["walk_s"]);
        walkS = Number.isFinite(ws) ? ws : walkSecondsFor(dist);
      } else {
        dist = haversineM(o.lat, o.lon, l.lngLat[1], l.lngLat[0]);
        walkS = walkSecondsFor(dist);
      }
      walks.set(l.item.id, walkS);
      const desc = descFor(l.item);
      const p = map.project(l.lngLat);
      cands.push({
        id: l.item.id,
        x: p.x,
        y: p.y,
        dist,
        label: l.item.name,
        icon: desc.icon(l.item),
        prio: desc.prio,
      });
    }
    const { full, red, rendered } = assignTags(rankTags(cands), map.getZoom());
    const keep = new Set<string>();
    for (const c of rendered) {
      const l = byId.get(c.id);
      if (!l) continue;
      keep.add(c.id);
      const walkS = walks.get(c.id) ?? 0;
      let e = this.entries.get(c.id);
      if (!e) {
        const el = this.makeEl(l.item);
        const marker = this.deps.createMarker(el).setLngLat(l.lngLat);
        e = {
          item: l.item, el, marker, lngLat: l.lngLat, dist: c.dist, walkS, added: false,
          metaEl: this.metas.get(el) ?? null,
        };
        this.entries.set(c.id, e);
      }
      e.item = l.item;
      e.dist = c.dist;
      e.walkS = walkS;
      const desc = descFor(l.item);
      if (!e.added) {
        e.marker.addTo(map as never);
        e.added = true;
        this.markGroup(e.el);
      }
      const isFull = full.has(c.id);
      e.el.classList.toggle("full", isFull);
      e.el.classList.toggle("compact", !isFull);
      e.el.classList.toggle("near", red.has(c.id));
      if (isFull) {
        const chip = e.el.querySelector<HTMLElement>(".tag-label");
        const vw = this.deps.viewportWidth ? this.deps.viewportWidth() : window.innerWidth;
        e.el.classList.toggle("flip", labelSide(c.x, chip?.offsetWidth ?? 0, vw, desc.prio === 0 ? STOP_H : 32) === "left");
      } else {
        e.el.classList.remove("flip");
      }
      if (e.metaEl) {
        const meta = stopMeta(c.dist, walkS);
        if (e.metaEl.textContent !== meta) e.metaEl.textContent = meta;
      }
      this.applyBadge(e);
    }
    for (const [id, e] of this.entries) {
      if (keep.has(id)) continue;
      if (id === this.selectedId) this.deps.card.close();
      e.marker.remove();
      this.entries.delete(id);
    }
  }

  /** Warning badge and aria suffix for a stop tag from the card context disruptions (D-16, D-17). */
  private applyBadge(e: Entry): void {
    const desc = descFor(e.item);
    let label = desc.spoken(e.item, e.dist, e.walkS);
    let warn: 0 | 1 | 3 = 0;
    if (e.item.layer === "transit_stops") {
      const list = stopDisruptions(e.item, this.cardCtx);
      if (list.length > 0) warn = list.some((x) => x.severity === 3) ? 3 : 1;
    }
    const icon = e.el.querySelector<HTMLElement>(".tag-icon");
    const cur = e.el.querySelector<HTMLElement>(".tag-warn");
    if (warn === 0) {
      cur?.remove();
    } else {
      label += warn === 3 ? ", service stopped" : ", disruption";
      const cls = `tag-warn ${warn === 3 ? "stop" : "info"}`;
      if (cur) {
        cur.className = cls;
      } else if (icon) {
        const badge = document.createElement("span");
        badge.className = cls;
        const svg = document.createElementNS(NS, "svg");
        svg.setAttribute("aria-hidden", "true");
        const use = document.createElementNS(NS, "use");
        use.setAttribute("href", "/icons.svg#warn");
        svg.appendChild(use);
        badge.appendChild(svg);
        icon.appendChild(badge);
      }
    }
    e.el.setAttribute("aria-label", label);
  }

  private markGroup(el: HTMLElement): void {
    if (this.groupMarked) return;
    const parent = el.parentElement;
    if (!parent) return;
    parent.setAttribute("role", "group");
    parent.setAttribute("aria-label", "Map tags");
    this.groupMarked = true;
  }

  private clearAll(): void {
    // the Card is shared with the building, YOU and pin cards: close it only when a tag owns it
    if (this.selectedId !== null) {
      this.deps.card.close();
      this.selectedId = null;
    }
    for (const e of this.entries.values()) e.marker.remove();
    this.entries.clear();
  }

  private select(id: string): void {
    const e = this.entries.get(id);
    if (!e) return;
    const { card } = this.deps;
    const desc = descFor(e.item);
    card.open(e.el, desc.cardContent(e.item, e.dist, e.walkS, this.cardCtx, Date.now()), {
      near: desc.prio === 2 && e.dist <= NEAR_M,
      onClose: () => {
        e.el.classList.remove("selected");
        if (this.selectedId === id) this.selectedId = null;
      },
    });
    this.selectedId = id;
    e.el.classList.add("selected");
  }

  /** Open the card for a rendered tag; false when that id has no tag. */
  openById(id: string): boolean {
    if (!this.entries.has(id)) return false;
    this.select(id);
    return true;
  }

  setCardContext(ctx: TransitCardContext | null): void {
    const prev = this.cardCtx;
    this.cardCtx = ctx;
    if (prev?.disruptions !== ctx?.disruptions || prev?.departures !== ctx?.departures) {
      for (const e of this.entries.values()) if (e.item.layer === "transit_stops") this.applyBadge(e);
    }
    const id = this.selectedId;
    if (id === null || !this.deps.card.isOpen()) return;
    const e = this.entries.get(id);
    if (!e || e.item.layer !== "transit_stops") return;
    const desc = descFor(e.item);
    this.deps.card.replace(desc.cardContent(e.item, e.dist, e.walkS, ctx, nowMs()));
  }

  destroy(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    if (this.raf) cancelAnimationFrame(this.raf);
    this.clearAll();
  }
}

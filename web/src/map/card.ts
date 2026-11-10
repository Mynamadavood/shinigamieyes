import { Leader, type LRect } from "./leader";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface CardContent {
  title: string;
  primary?: string;
  /** optional second Body line (e.g. road, suburb) */
  extra?: string;
  secondary: Array<[string, string]>;
  caveats: string[];
  action?: { label: string; onClick(): void };
}

export interface CardOpts {
  near?: boolean;
  onClose?(): void;
}

const EDGE = 16;

export type Side = "right" | "left" | "above" | "below";

const ORDER: Side[] = ["right", "left", "above", "below"];

function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/**
 * Pure card placement (UI-SPEC "Floating Info Card"): right, left, above, below of the tag.
 * Each side that fits is scored by how many `avoid` rects it would cover; lowest wins, ties go
 * to `prefer`, then to the order right, left, above, below. Nothing fits: clamped above.
 */
export function placeCard(
  tag: Rect,
  card: { w: number; h: number },
  viewport: { w: number; h: number },
  safe: { top: number; bottom: number },
  gap = 16,
  avoid: Rect[] = [],
  prefer?: Side,
): { x: number; y: number; side: Side } {
  const minY = safe.top;
  const maxY = Math.max(minY, viewport.h - safe.bottom - card.h);
  const clampY = (y: number) => Math.min(Math.max(y, minY), maxY);
  const cy = clampY(tag.y + tag.h / 2 - card.h / 2);
  const ax = Math.min(
    Math.max(tag.x + tag.w / 2 - card.w / 2, EDGE),
    Math.max(EDGE, viewport.w - EDGE - card.w),
  );

  const cands: Array<{ x: number; y: number; side: Side }> = [];
  const rx = tag.x + tag.w + gap;
  if (rx + card.w <= viewport.w - EDGE) cands.push({ x: rx, y: cy, side: "right" });
  const lx = tag.x - gap - card.w;
  if (lx >= EDGE) cands.push({ x: lx, y: cy, side: "left" });
  if (tag.y - gap - card.h >= safe.top) cands.push({ x: ax, y: tag.y - gap - card.h, side: "above" });
  const by = tag.y + tag.h + gap;
  if (by + card.h <= viewport.h - safe.bottom) cands.push({ x: ax, y: by, side: "below" });
  if (cands.length === 0) return { x: ax, y: clampY(tag.y - gap - card.h), side: "above" };

  const score = (c: { x: number; y: number }) =>
    avoid.filter((r) => overlaps({ x: c.x, y: c.y, w: card.w, h: card.h }, r)).length;
  let best = cands[0];
  let bestScore = score(best);
  for (const c of cands.slice(1)) {
    const sc = score(c);
    const better =
      sc < bestScore || (sc === bestScore && c.side === prefer && best.side !== prefer);
    if (better) {
      best = c;
      bestScore = sc;
    }
  }
  return best;
}

function row(cls: string, text: string): HTMLElement {
  const el = document.createElement("div");
  el.className = cls;
  el.textContent = text;
  return el;
}

/** Floating framed card (role dialog, not modal). All content via textContent. */
export class Card {
  private readonly root: HTMLElement;
  private readonly leader: Leader;
  private anchor: HTMLElement | null = null;
  private opts: CardOpts = {};
  private openState = false;
  private side: Side | undefined;

  constructor(
    parent: HTMLElement = document.body,
    private readonly safe: () => { top: number; bottom: number } = () => ({ top: 64, bottom: 144 }),
  ) {
    this.root = document.createElement("div");
    this.root.className = "card is-hidden";
    this.root.setAttribute("role", "dialog");
    this.root.tabIndex = -1;
    parent.appendChild(this.root);
    this.leader = new Leader(parent);
    document.addEventListener("keydown", this.onKey);
    document.addEventListener("pointerdown", this.onPointer, true);
  }

  private readonly onKey = (e: KeyboardEvent): void => {
    if (this.openState && e.key === "Escape") this.close();
  };

  private readonly onPointer = (e: Event): void => {
    if (!this.openState) return;
    const t = e.target;
    if (!(t instanceof Element)) return;
    if (this.root.contains(t) || t.closest(".map-tag")) return;
    this.close();
  };

  isOpen(): boolean {
    return this.openState;
  }

  open(anchor: HTMLElement, content: CardContent, opts: CardOpts = {}): void {
    if (this.openState) {
      const prev = this.opts.onClose;
      this.opts = {};
      prev?.();
    }
    if (this.anchor !== anchor) this.side = undefined;
    this.anchor = anchor;
    this.opts = opts;
    const near = opts.near === true;
    this.root.replaceChildren();
    this.root.className = near ? "card near" : "card";
    this.root.setAttribute("aria-label", content.title);

    this.root.appendChild(row("card-title", content.title));
    if (content.primary) this.root.appendChild(row("card-primary", content.primary));
    if (content.extra) this.root.appendChild(row("card-primary card-extra", content.extra));
    for (const [k, v] of content.secondary) {
      const r = document.createElement("div");
      r.className = "card-row";
      const key = document.createElement("span");
      key.className = "card-key";
      key.textContent = `${k}: `;
      const val = document.createElement("span");
      val.className = "card-val";
      val.textContent = v;
      r.append(key, val);
      this.root.appendChild(r);
    }
    for (const c of content.caveats) this.root.appendChild(row("card-caveat", c));
    if (content.action) {
      const { label, onClick } = content.action;
      const b = document.createElement("button");
      b.type = "button";
      b.className = "card-action";
      b.textContent = label;
      b.addEventListener("click", onClick);
      this.root.appendChild(b);
    }

    this.openState = true;
    this.place();
    this.root.focus({ preventScroll: true });
  }

  /** Recompute placement and leader; cheap, intended to run in rAF on map move. */
  update(): void {
    if (this.openState) this.place();
  }

  private place(): void {
    const a = this.anchor;
    if (!a) return;
    const icon = a.querySelector<HTMLElement>(".tag-icon") ?? a;
    const r = icon.getBoundingClientRect();
    const tag: LRect = { x: r.left, y: r.top, w: r.width, h: r.height };
    const cr = this.root.getBoundingClientRect();
    const w = cr.width || 224;
    const h = cr.height || 96;
    const avoid: Rect[] = [];
    for (const t of document.querySelectorAll<HTMLElement>(".map-tag")) {
      if (t === a || a.contains(t) || t.contains(a)) continue;
      const rects = [t.querySelector<HTMLElement>(".tag-icon")];
      if (t.classList.contains("full")) rects.push(t.querySelector<HTMLElement>(".tag-label"));
      for (const el of rects) {
        if (!el) continue;
        const b = el.getBoundingClientRect();
        if (b.width > 0 && b.height > 0) avoid.push({ x: b.left, y: b.top, w: b.width, h: b.height });
      }
    }
    const p = placeCard(
      tag,
      { w, h },
      { w: window.innerWidth, h: window.innerHeight },
      this.safe(),
      16,
      avoid,
      this.side,
    );
    this.side = p.side;
    this.root.style.left = `${Math.round(p.x)}px`;
    this.root.style.top = `${Math.round(p.y)}px`;
    this.root.classList.remove("is-hidden");
    this.leader.show(tag, { x: p.x, y: p.y, w, h }, this.opts.near === true);
  }

  close(): void {
    if (!this.openState) return;
    this.openState = false;
    this.root.classList.add("is-hidden");
    this.leader.hide();
    const anchor = this.anchor;
    const cb = this.opts.onClose;
    this.anchor = null;
    this.side = undefined;
    this.opts = {};
    cb?.();
    if (anchor && anchor.isConnected) anchor.focus({ preventScroll: true });
  }

  destroy(): void {
    document.removeEventListener("keydown", this.onKey);
    document.removeEventListener("pointerdown", this.onPointer, true);
    this.root.remove();
    this.leader.destroy();
  }
}

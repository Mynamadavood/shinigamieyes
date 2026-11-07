export type Snap = "peek" | "half" | "full";
export const FLICK_V = 0.5;
const TAP_SLOP_PX = 6;
const ORDER: Snap[] = ["peek", "half", "full"];

/** Velocity positive = dragging up (sheet growing). */
export function snapTarget(heightPx: number, velocityPxPerMs: number, points: Record<Snap, number>): Snap {
  if (Math.abs(velocityPxPerMs) > FLICK_V) {
    if (velocityPxPerMs > 0) {
      for (const s of ORDER) if (points[s] > heightPx) return s;
      return "full";
    }
    for (const s of [...ORDER].reverse()) if (points[s] < heightPx) return s;
    return "peek";
  }
  let best: Snap = "peek";
  let bd = Infinity;
  for (const s of ORDER) {
    const d = Math.abs(points[s] - heightPx);
    if (d < bd) {
      bd = d;
      best = s;
    }
  }
  return best;
}

function reducedMotion(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

const nowT = (): number => (typeof performance !== "undefined" ? performance.now() : Date.now());

interface DragState {
  startY: number;
  startH: number;
  lastY: number;
  lastT: number;
  v: number;
  moved: boolean;
  viaHandle: boolean;
}

export class Drawer {
  private current: Snap = "peek";
  private handle: HTMLElement;
  private heightPx = 0;
  private drag: DragState | null = null;
  private onSnap?: (s: Snap) => void;

  constructor(private root: HTMLElement, opts: { onSnap?(s: Snap): void } = {}) {
    this.onSnap = opts.onSnap;
    this.handle = root.querySelector(".drawer-handle") as HTMLElement;
    root.addEventListener("pointerdown", (e) => this.down(e as PointerEvent));
    root.addEventListener("pointermove", (e) => this.move(e as PointerEvent));
    root.addEventListener("pointerup", (e) => this.up(e as PointerEvent));
    root.addEventListener("pointercancel", () => this.cancel());
    window.addEventListener("resize", () => this.apply(this.current, false));
    this.apply("peek", false);
  }

  state(): Snap {
    return this.current;
  }
  collapse(): void {
    this.snap("peek");
  }
  snap(s: Snap): void {
    this.apply(s, true);
    this.onSnap?.(s);
  }

  private points(): Record<Snap, number> {
    const probe = document.createElement("div");
    probe.style.setProperty("position", "absolute");
    probe.style.setProperty("visibility", "hidden");
    probe.style.setProperty("padding-bottom", "env(safe-area-inset-bottom)");
    probe.style.setProperty("padding-top", "env(safe-area-inset-top)");
    document.body.append(probe);
    const cs = getComputedStyle(probe);
    const sb = parseFloat(cs.paddingBottom) || 0;
    const st = parseFloat(cs.paddingTop) || 0;
    probe.remove();
    const peekCss = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--drawer-peek"));
    const peek = (Number.isFinite(peekCss) ? peekCss : 144) + sb;
    const bannerEl = document.querySelector(".banner-slot") as HTMLElement | null;
    const banner = bannerEl ? bannerEl.offsetHeight : 0;
    const full = Math.max(peek, window.innerHeight - (st + 48 + banner + 16));
    const half = Math.min(full, Math.max(peek, window.innerHeight * 0.5));
    return { peek, half, full };
  }

  private apply(s: Snap, animate: boolean): void {
    this.current = s;
    this.heightPx = this.points()[s];
    this.root.classList.toggle("snapping", animate && !reducedMotion());
    this.root.classList.toggle("open", s !== "peek");
    this.root.classList.remove("dragging");
    this.root.style.setProperty("--drawer-h", `${this.heightPx}px`);
    this.handle.setAttribute("aria-expanded", s === "peek" ? "false" : "true");
    this.handle.setAttribute("aria-label", s === "peek" ? "Expand next up" : "Collapse next up");
  }

  private down(e: PointerEvent): void {
    const t = e.target as Node;
    const viaHandle = t === this.handle || this.handle.contains(t);
    if (!viaHandle && this.current !== "peek") return;
    this.drag = {
      startY: e.clientY,
      startH: this.heightPx,
      lastY: e.clientY,
      lastT: nowT(),
      v: 0,
      moved: false,
      viaHandle,
    };
    try {
      this.handle.setPointerCapture?.(e.pointerId);
    } catch {
      // synthetic pointer: capture is best-effort
    }
  }

  private move(e: PointerEvent): void {
    const d = this.drag;
    if (!d) return;
    const dy = d.startY - e.clientY;
    if (!d.moved && Math.abs(dy) < TAP_SLOP_PX) return;
    d.moved = true;
    const t = nowT();
    const dt = t - d.lastT;
    if (dt > 0) d.v = (d.lastY - e.clientY) / dt;
    d.lastY = e.clientY;
    d.lastT = t;
    const pts = this.points();
    this.heightPx = Math.min(pts.full, Math.max(pts.peek, d.startH + dy));
    this.root.classList.remove("snapping");
    this.root.classList.add("dragging");
    this.root.style.setProperty("--drawer-h", `${this.heightPx}px`);
  }

  private up(_e: PointerEvent): void {
    const d = this.drag;
    this.drag = null;
    if (!d) return;
    if (!d.moved) {
      if (d.viaHandle) this.snap(this.current === "peek" ? "half" : "peek");
      return;
    }
    this.snap(snapTarget(this.heightPx, d.v, this.points()));
  }

  private cancel(): void {
    if (this.drag) {
      this.drag = null;
      this.apply(this.current, true);
    }
  }
}

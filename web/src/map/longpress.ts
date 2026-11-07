export const LONGPRESS_MS = 500;
export const MOVE_TOLERANCE_PX = 10;

export interface LongPressOpts {
  onStart(x: number, y: number): void;
  onCancel(): void;
  onFire(x: number, y: number): void;
  setTimer(fn: () => void, ms: number): unknown;
  clearTimer(h: unknown): void;
}

interface Pt {
  x: number;
  y: number;
}

/** Pure long-press state machine: one finger held still for 500 ms on empty map (D-07). */
export function createLongPress(opts: LongPressOpts) {
  let timer: unknown = null;
  let origin: Pt | null = null;

  function cancel(): void {
    if (origin === null) return;
    if (timer !== null) opts.clearTimer(timer);
    timer = null;
    origin = null;
    opts.onCancel();
  }

  return {
    touchStart(touches: Pt[], onUi: boolean): void {
      if (touches.length > 1) {
        cancel();
        return;
      }
      if (onUi || touches.length !== 1 || origin !== null) return;
      const p = { x: touches[0].x, y: touches[0].y };
      origin = p;
      opts.onStart(p.x, p.y);
      timer = opts.setTimer(() => {
        timer = null;
        if (origin === null) return;
        const o = origin;
        origin = null;
        opts.onFire(o.x, o.y);
      }, LONGPRESS_MS);
    },
    touchMove(touches: Pt[]): void {
      if (origin === null) return;
      if (touches.length !== 1) {
        cancel();
        return;
      }
      const dx = touches[0].x - origin.x;
      const dy = touches[0].y - origin.y;
      if (Math.hypot(dx, dy) > MOVE_TOLERANCE_PX) cancel();
    },
    touchEnd(): void {
      cancel();
    },
    mapGesture(): void {
      cancel();
    },
  };
}

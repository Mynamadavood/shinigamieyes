import type { RowVM } from "../model";
import type { Profile } from "../types";

const MAX_CORNER = 2;
const ARIA_REFRESH_MS = 60_000;

/** Max 2 rows, timed rows first (soonest), then value-only rows. */
export function cornerRows(rows: RowVM[]): RowVM[] {
  const timed = rows.filter((r) => r.targetMs !== null).sort((a, b) => (a.targetMs as number) - (b.targetMs as number));
  const valued = rows.filter((r) => r.targetMs === null);
  return [...timed, ...valued].slice(0, MAX_CORNER);
}

interface ReadoutEls {
  root: HTMLElement;
  name: HTMLElement;
  count: HTMLElement;
  ariaAt: number;
}

export class Readouts {
  private els = new Map<string, ReadoutEls>();

  constructor(
    private left: HTMLElement,
    // right column is filled by the camera count readout (02-07)
    readonly right: HTMLElement,
  ) {}

  update(rows: RowVM[], _profile: Profile | null, now: number): void {
    const want = cornerRows(rows);
    const ids = new Set(want.map((r) => r.id));
    for (const [id, e] of this.els) {
      if (!ids.has(id)) {
        e.root.remove();
        this.els.delete(id);
      }
    }
    for (const r of want) {
      let e = this.els.get(r.id);
      if (!e) {
        const root = document.createElement("div");
        root.className = "readout";
        const name = document.createElement("span");
        name.className = "readout-name";
        const count = document.createElement("span");
        count.className = "readout-countdown";
        root.append(name, count);
        e = { root, name, count, ariaAt: -Infinity };
        this.els.set(r.id, e);
      }
      if (e.name.textContent !== r.name) e.name.textContent = r.name;
      if (e.count.textContent !== r.countdownText) e.count.textContent = r.countdownText;
      e.root.classList.toggle("urgent", r.redCountdown);
      if (now - e.ariaAt >= ARIA_REFRESH_MS) {
        e.root.setAttribute("aria-label", `${r.name}, ${r.countdownText}`);
        e.ariaAt = now;
      }
    }
    // keep DOM order matching row order without recreating nodes
    want.forEach((r, i) => {
      const e = this.els.get(r.id) as ReadoutEls;
      if (this.left.children[i] !== e.root) this.left.insertBefore(e.root, this.left.children[i] ?? null);
    });
  }
}

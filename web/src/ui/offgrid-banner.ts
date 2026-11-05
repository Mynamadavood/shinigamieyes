import "../styles/banner.css";
import type { Connectivity } from "../offgrid";

const FADE_MS = 200;

export function syncAgeText(syncMs: number | null, nowMs: number): string {
  if (syncMs === null) return " · never synced";
  const s = Math.max(0, Math.floor((nowMs - syncMs) / 1000));
  if (s < 60) return " · last sync just now";
  if (s < 3600) return ` · last sync ${Math.floor(s / 60)}m ago`;
  if (s < 86400) return ` · last sync ${Math.floor(s / 3600)}h ago`;
  return ` · last sync ${Math.floor(s / 86400)}d ago`;
}

export class OffgridBanner {
  private root: HTMLElement;
  private age: HTMLElement;
  private fade: ReturnType<typeof setTimeout> | undefined;

  constructor(
    slot: HTMLElement,
    private conn: Connectivity,
    private clock: () => number = Date.now,
  ) {
    this.root = document.createElement("div");
    this.root.className = "offgrid-banner";
    this.root.setAttribute("role", "status");
    this.root.setAttribute("aria-live", "polite");
    this.root.hidden = true;
    const label = document.createElement("span");
    label.className = "og-label";
    label.textContent = "OFF-GRID";
    this.age = document.createElement("span");
    this.age.className = "og-age";
    this.root.append(label, this.age);
    slot.classList.add("has-banner");
    slot.append(this.root);
    conn.subscribe(() => this.sync());
    this.sync();
  }

  /** Called every tick: keeps the minute-granular age text current. */
  refresh(): void {
    if (this.conn.state() === "offgrid") {
      this.age.textContent = syncAgeText(this.conn.lastSyncMs(), this.clock());
    }
  }

  isVisible(): boolean {
    return !this.root.hidden;
  }

  private sync(): void {
    if (this.fade !== undefined) clearTimeout(this.fade);
    if (this.conn.state() === "offgrid") {
      this.root.hidden = false;
      this.root.classList.remove("clearing");
      this.refresh();
    } else if (!this.root.hidden) {
      this.root.classList.add("clearing");
      this.fade = setTimeout(() => {
        this.root.hidden = true;
        this.root.classList.remove("clearing");
      }, FADE_MS);
    }
  }
}

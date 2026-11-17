import "../styles/location.css";
import { nowMs } from "../clock";
import { fmtCountdown } from "../format";
import { startTicker } from "../ticker";
import { shortStopName } from "../transit";
import type { Item, Layer } from "../types";

export const PTV_LICENCE =
  "Source: Licensed from Public Transport Victoria under a Creative Commons Attribution 4.0 International Licence.";

export const MAX_SHEET_ROWS = 6;
export const NO_DISRUPTIONS = "No current disruptions on your routes.";
const MAX_ROUTES = 3;
const MAX_TITLE = 160;

export interface DisruptionRowVM {
  id: string;
  routes: string;
  title: string;
  meta: string;
  endTargetMs: number | null;
  red: boolean;
}

function strs(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.length > 0) : [];
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** Disruption items of a layer: those with a detail object and not a summary marker. */
export function disruptionItems(layer: Layer | undefined): Item[] {
  if (!layer) return [];
  return layer.items.filter((i) => !!i.detail && i.detail["summary"] !== true);
}

function isRed(i: Item): boolean {
  return i.severity >= 3 || i.detail?.["service_stopped"] === true;
}

function routesText(d: Record<string, unknown>): string {
  let names = strs(d["route_labels"]);
  if (names.length === 0) names = strs(d["stop_names"]).map(shortStopName);
  if (names.length === 0) return "Your routes";
  const head = names.slice(0, MAX_ROUTES).join(", ");
  return names.length > MAX_ROUTES ? `${head} +${names.length - MAX_ROUTES}` : head;
}

function ageText(updatedTs: number | null, nowMillis: number): string {
  if (updatedTs === null) return "";
  const age = Math.max(0, nowMillis / 1000 - updatedTs);
  if (age < 60) return "just now";
  if (age < 3600) return `${Math.floor(age / 60)}m ago`;
  if (age < 86400) return `${Math.floor(age / 3600)}h ago`;
  return `${Math.floor(age / 86400)}d ago`;
}

function trim(s: string): string {
  return s.length > MAX_TITLE ? `${s.slice(0, MAX_TITLE - 1)}…` : s;
}

/** Service-stopping first, then soonest known end, then most recently updated; max 6. Ended items are dropped. */
export function disruptionRows(layer: Layer | undefined, nowMillis: number): DisruptionRowVM[] {
  const live = disruptionItems(layer).filter((i) => {
    const toTs = num(i.detail?.["to_ts"]) ?? i.target_ts;
    return toTs === null || toTs * 1000 > nowMillis;
  });
  const keyed = live.map((i) => {
    const d = i.detail as Record<string, unknown>;
    const toTs = num(d["to_ts"]) ?? i.target_ts;
    const upd = num(d["updated_ts"]);
    const status = d["status"] === "Planned" ? "Planned" : "Current";
    const age = ageText(upd, nowMillis);
    const vm: DisruptionRowVM = {
      id: i.id,
      routes: routesText(d),
      title: trim(typeof d["title"] === "string" && d["title"] ? (d["title"] as string) : i.name),
      meta: age ? `${status} · updated ${age}` : status,
      endTargetMs: toTs !== null ? toTs * 1000 : null,
      red: isRed(i),
    };
    return { vm, end: vm.endTargetMs, upd: upd ?? 0 };
  });
  keyed.sort((a, b) => {
    if (a.vm.red !== b.vm.red) return a.vm.red ? -1 : 1;
    const ae = a.end ?? Infinity;
    const be = b.end ?? Infinity;
    if (ae !== be) return ae - be;
    return b.upd - a.upd;
  });
  return keyed.slice(0, MAX_SHEET_ROWS).map((k) => k.vm);
}

function warnGlyph(): SVGElement {
  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("class", "dis-glyph");
  const use = document.createElementNS(NS, "use");
  use.setAttribute("href", "/icons.svg#warn");
  svg.append(use);
  return svg;
}

export class DisruptionSheet {
  private backdrop = document.createElement("div");
  private sheet = document.createElement("div");
  private title = document.createElement("h2");
  private list = document.createElement("div");
  private foot = document.createElement("p");
  private closeBtn = document.createElement("button");
  private returnFocus: HTMLElement | null = null;
  private stopTicker: (() => void) | null = null;
  private countdowns: Array<{ el: HTMLElement; target: number }> = [];
  /** the layer the open sheet shows; update() follows new frames while open (WR-W10) */
  private layer: Layer | undefined = undefined;

  constructor(
    host: HTMLElement,
    _opts: { reducedMotion: boolean },
  ) {
    this.backdrop.className = "sheet-backdrop";
    this.backdrop.hidden = true;
    this.sheet.className = "sheet";
    this.sheet.setAttribute("role", "dialog");
    this.sheet.setAttribute("aria-modal", "true");
    this.sheet.setAttribute("aria-label", "Disruptions on your routes");
    this.title.className = "sheet-title";
    this.title.id = "disruption-sheet-title";
    this.title.tabIndex = -1;
    this.title.textContent = "DISRUPTIONS · YOUR ROUTES";
    this.list.className = "dis-list";
    this.foot.className = "dis-foot";
    this.foot.textContent = PTV_LICENCE;
    this.closeBtn.type = "button";
    this.closeBtn.className = "sheet-row dis-close";
    this.closeBtn.textContent = "Close";
    this.closeBtn.addEventListener("click", () => this.close());
    this.sheet.append(this.title, this.list, this.foot, this.closeBtn);
    this.backdrop.append(this.sheet);
    host.append(this.backdrop);
    this.backdrop.addEventListener("click", (e) => {
      if (e.target === this.backdrop) this.close();
    });
    this.backdrop.addEventListener("keydown", (e) => this.onKey(e));
  }

  isOpen(): boolean {
    return !this.backdrop.hidden;
  }

  open(layer: Layer | undefined, returnFocus?: HTMLElement): void {
    if (!this.backdrop.hidden) return;
    this.returnFocus = returnFocus ?? (document.activeElement as HTMLElement | null);
    this.layer = layer;
    this.renderRows(disruptionRows(layer, nowMs()));
    this.backdrop.hidden = false;
    this.title.focus();
    this.stopTicker = startTicker((now) => this.tick(now));
  }

  /** Follow a new disruptions layer while open (a cleared or added disruption shows straight away). */
  update(layer: Layer | undefined): void {
    if (this.backdrop.hidden || layer === this.layer) return;
    this.layer = layer;
    this.renderRows(disruptionRows(layer, nowMs()));
  }

  close(): void {
    if (this.backdrop.hidden) return;
    this.stopTicker?.();
    this.stopTicker = null;
    this.backdrop.hidden = true;
    this.countdowns = [];
    this.layer = undefined;
    this.returnFocus?.focus();
    this.returnFocus = null;
  }

  private renderRows(rows: DisruptionRowVM[]): void {
    this.countdowns = [];
    const now = nowMs();
    if (rows.length === 0) {
      const empty = document.createElement("p");
      empty.className = "dis-empty";
      empty.textContent = NO_DISRUPTIONS;
      this.list.replaceChildren(empty);
      return;
    }
    this.list.replaceChildren(
      ...rows.map((r) => {
        const row = document.createElement("div");
        row.className = r.red ? "dis-row red" : "dis-row";
        const l1 = document.createElement("div");
        l1.className = "dis-line1";
        const routes = document.createElement("span");
        routes.className = "dis-routes";
        routes.append(warnGlyph(), document.createTextNode(r.routes));
        l1.append(routes);
        if (r.red) {
          const chip = document.createElement("span");
          chip.className = "no-service";
          chip.textContent = "NO SERVICE";
          l1.append(chip);
        }
        const l2 = document.createElement("div");
        l2.className = "dis-title";
        l2.textContent = r.title;
        const l3 = document.createElement("div");
        l3.className = "dis-meta";
        const meta = document.createElement("span");
        meta.textContent = r.meta;
        l3.append(meta);
        if (r.endTargetMs !== null) {
          const end = document.createElement("span");
          end.className = "dis-end";
          const lab = document.createElement("span");
          lab.textContent = "ends in ";
          const cd = document.createElement("span");
          cd.className = "dis-countdown";
          cd.textContent = fmtCountdown((r.endTargetMs - now) / 1000);
          end.append(lab, cd);
          l3.append(end);
          this.countdowns.push({ el: cd, target: r.endTargetMs });
        }
        row.append(l1, l2, l3);
        return row;
      }),
    );
  }

  private tick(now: number): void {
    // a disruption whose end has passed leaves the sheet instead of sitting at 00:00 (WR-W10)
    if (this.countdowns.some((c) => c.target <= now)) {
      this.renderRows(disruptionRows(this.layer, now));
      return;
    }
    for (const c of this.countdowns) {
      const t = fmtCountdown((c.target - now) / 1000);
      if (c.el.textContent !== t) c.el.textContent = t;
    }
  }

  private focusables(): HTMLElement[] {
    return [this.title, this.closeBtn];
  }

  private onKey(e: KeyboardEvent): void {
    if (e.key === "Escape") {
      e.preventDefault();
      this.close();
      return;
    }
    if (e.key !== "Tab") return;
    const f = this.focusables();
    const first = f[0]!;
    const last = f[f.length - 1]!;
    const cur = document.activeElement;
    if (e.shiftKey && cur === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && cur === last) {
      e.preventDefault();
      first.focus();
    }
  }
}

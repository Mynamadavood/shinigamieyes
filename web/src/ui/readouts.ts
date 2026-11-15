import type { RowVM } from "../model";
import type { Profile } from "../types";
import { disruptionItems } from "./disruption-sheet";

const MAX_CORNER = 2;
const ARIA_REFRESH_MS = 60_000;

/** Max 2 rows, timed rows first (soonest), then value-only rows. */
export function cornerRows(rows: RowVM[]): RowVM[] {
  rows = rows.filter((r) => r.transit !== true); // transit rows never take a corner
  const timed = rows.filter((r) => r.targetMs !== null).sort((a, b) => (a.targetMs as number) - (b.targetMs as number));
  const valued = rows.filter((r) => r.targetMs === null);
  return [...timed, ...valued].slice(0, MAX_CORNER);
}

export function cameraCountText(profile: Profile | null): { num: string | null; rest: string } {
  if (profile && profile.location.source === "pin" && !profile.layers["cameras_cctv"]) {
    return { num: null, rest: "Cameras · not shown for saved places" };
  }
  const layer = profile?.layers["cameras_cctv"];
  const summary = layer?.items.find((i) => i.detail?.["summary"] === true);
  if (!layer || layer.status === "pending" || !summary) {
    return { num: null, rest: "Cameras · not loaded yet" };
  }
  const n = Number(summary.detail?.["count"] ?? 0);
  const radius = Number(summary.detail?.["radius_m"] ?? 150);
  if (n === 0) return { num: "0", rest: ` mapped cameras · ${radius} m · not exhaustive` };
  return { num: String(n), rest: ` ${n === 1 ? "camera" : "cameras"} · ${radius} m · mapped, not exhaustive` };
}

export function disruptionReadout(profile: Profile | null): {
  visible: boolean;
  n: number;
  red: boolean;
  text: { num: string; rest: string };
} {
  const layer = profile?.layers["transit_disruptions"];
  const items = layer && layer.status !== "pending" ? disruptionItems(layer) : [];
  const n = items.length;
  const red = items.some((i) => i.severity >= 3 || i.detail?.["service_stopped"] === true);
  return {
    visible: n >= 1,
    n,
    red,
    text: { num: String(n), rest: n === 1 ? " disruption · your routes" : " disruptions · your routes" },
  };
}

interface ReadoutEls {
  root: HTMLElement;
  name: HTMLElement;
  count: HTMLElement;
  ariaAt: number;
}

export class Readouts {
  private els = new Map<string, ReadoutEls>();
  private camRoot: HTMLElement | null = null;
  private camNum: HTMLElement | null = null;
  private camRest: HTMLElement | null = null;
  private disRoot: HTMLButtonElement | null = null;
  private disNum: HTMLElement | null = null;
  private disRest: HTMLElement | null = null;

  constructor(
    private left: HTMLElement,
    // right column is filled by the camera count readout (02-07)
    readonly right: HTMLElement,
    private opts: { onDisruptionsTap?(): void } = {},
  ) {}

  /** The disruption readout button, once built (the sheet returns focus to it). */
  get disruptionsEl(): HTMLElement | null {
    return this.disRoot;
  }

  update(rows: RowVM[], profile: Profile | null, now: number): void {
    this.updateCameras(profile);
    this.updateDisruptions(profile);
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

  private updateCameras(profile: Profile | null): void {
    if (!this.camRoot) {
      const root = document.createElement("div");
      root.className = "readout readout-cameras";
      const num = document.createElement("span");
      num.className = "count-num";
      const rest = document.createElement("span");
      rest.className = "count-rest";
      root.append(num, rest);
      this.right.append(root);
      this.camRoot = root;
      this.camNum = num;
      this.camRest = rest;
    }
    const t = cameraCountText(profile);
    const num = t.num ?? "";
    if (this.camNum && this.camNum.textContent !== num) this.camNum.textContent = num;
    if (this.camRest && this.camRest.textContent !== t.rest) this.camRest.textContent = t.rest;
    const label = `${num}${t.rest}`;
    if (this.camRoot && this.camRoot.getAttribute("aria-label") !== label) this.camRoot.setAttribute("aria-label", label);
  }

  private updateDisruptions(profile: Profile | null): void {
    if (!this.disRoot) {
      const root = document.createElement("button");
      root.type = "button";
      root.className = "readout readout-disruptions";
      root.hidden = true;
      const NS = "http://www.w3.org/2000/svg";
      const svg = document.createElementNS(NS, "svg");
      svg.setAttribute("aria-hidden", "true");
      svg.setAttribute("class", "dis-glyph");
      const use = document.createElementNS(NS, "use");
      use.setAttribute("href", "/icons.svg#warn");
      svg.append(use);
      const num = document.createElement("span");
      num.className = "count-num";
      const rest = document.createElement("span");
      rest.className = "count-rest";
      const text = document.createElement("span");
      text.className = "dis-text";
      text.append(num, rest);
      root.append(svg, text);
      root.addEventListener("click", () => this.opts.onDisruptionsTap?.());
      this.right.append(root);
      this.disRoot = root;
      this.disNum = num;
      this.disRest = rest;
    }
    const r = disruptionReadout(profile);
    this.disRoot.hidden = !r.visible;
    this.disRoot.classList.toggle("red", r.visible && r.red);
    if (!r.visible) return;
    if (this.disNum && this.disNum.textContent !== r.text.num) this.disNum.textContent = r.text.num;
    if (this.disRest && this.disRest.textContent !== r.text.rest) this.disRest.textContent = r.text.rest;
    const label = `${r.n} ${r.n === 1 ? "disruption" : "disruptions"} on your routes, show list${r.red ? ", service stopped on at least one" : ""}`;
    if (this.disRoot.getAttribute("aria-label") !== label) this.disRoot.setAttribute("aria-label", label);
  }
}

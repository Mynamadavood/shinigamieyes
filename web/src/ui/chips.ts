import { isStale } from "../freshness";
import "../styles/chips.css";
import type { Profile } from "../types";
import type { GroupId } from "../layers";
import { LAYER_GROUPS } from "../layers";

/** HUD-07: one banded chip per slow-changing condition. level 0..3 comes from the item severity. */
export interface ChipVM {
  id: string;
  name: string;
  value: string;
  level: number;
  stale: boolean;
  link: string | null;
}

const ORDER = ["weather", "uv_now", "fire_danger", "pollen"];
const SHORT: Record<string, string> = {
  Weather: "WX",
  "UV index now": "UV",
  "Fire danger": "FIRE",
  "Grass pollen": "POLLEN",
  "Thunderstorm asthma": "ASTHMA",
};

export function chipsFor(profile: Profile | null, nowMs: number): ChipVM[] {
  if (!profile) return [];
  const out: ChipVM[] = [];
  for (const id of ORDER) {
    const layer = profile.layers[id];
    if (!layer) continue;
    for (const item of layer.items) {
      const d = item.detail;
      if (!d || d.chip !== true || typeof d.display !== "string") continue;
      out.push({
        id: item.id,
        name: SHORT[item.name] ?? item.name,
        value: d.display,
        level: Math.max(0, Math.min(3, item.severity)),
        stale: isStale(item, layer.status, nowMs),
        link: typeof d.link === "string" && d.link.startsWith("https://") ? d.link : null,
      });
    }
  }
  return out;
}

interface ChipEls {
  root: HTMLElement;
  name: HTMLElement;
  value: HTMLElement;
  level: number;
}

export class Chips {
  private els = new Map<string, ChipEls>();

  constructor(private host: HTMLElement) {
    host.setAttribute("role", "list");
    host.setAttribute("aria-label", "Conditions");
  }

  update(chips: ChipVM[]): void {
    const ids = new Set(chips.map((c) => c.id));
    for (const [id, e] of this.els) {
      if (!ids.has(id)) {
        e.root.remove();
        this.els.delete(id);
      }
    }
    chips.forEach((c, i) => {
      let e = this.els.get(c.id);
      if (!e) {
        const root = document.createElement(c.link ? "a" : "div");
        if (c.link) {
          const a = root as HTMLAnchorElement;
          a.href = c.link;
          a.target = "_blank";
          a.rel = "noopener noreferrer";
        }
        root.className = "chip";
        root.setAttribute("role", "listitem");
        const name = document.createElement("span");
        name.className = "chip-name";
        const value = document.createElement("span");
        value.className = "chip-value";
        root.append(name, value);
        e = { root, name, value, level: c.level };
        this.els.set(c.id, e);
      } else if (c.level > e.level) {
        // escalate only on crossing up into a higher band; never on a mere value change
        e.root.classList.remove("rise");
        void e.root.offsetWidth; // restart the one-shot animation
        e.root.classList.add("rise");
      }
      e.level = c.level;
      if (e.name.textContent !== c.name) e.name.textContent = c.name;
      if (e.value.textContent !== c.value) e.value.textContent = c.value;
      for (let l = 0; l <= 3; l++) e.root.classList.toggle(`lvl-${l}`, l === c.level);
      e.root.classList.toggle("stale", c.stale);
      const label = `${c.name} ${c.value}${c.stale ? ", out of date" : ""}${c.link ? ", open rain radar" : ""}`;
      if (e.root.getAttribute("aria-label") !== label) e.root.setAttribute("aria-label", label);
      if (this.host.children[i] !== e.root) this.host.insertBefore(e.root, this.host.children[i] ?? null);
    });
    this.host.hidden = chips.length === 0;
  }
}

/** HUD-08 toggle row: one pressed/unpressed button per layer group. */
export class LayerToggles {
  private buttons = new Map<GroupId, HTMLButtonElement>();

  constructor(host: HTMLElement, hidden: Set<GroupId>, onToggle: (id: GroupId) => void) {
    host.setAttribute("role", "group");
    host.setAttribute("aria-label", "Layers");
    const title = document.createElement("span");
    title.className = "toggles-title";
    title.textContent = "LAYERS";
    host.append(title);
    for (const g of LAYER_GROUPS) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "layer-toggle";
      b.textContent = g.label;
      b.addEventListener("click", () => onToggle(g.id));
      host.append(b);
      this.buttons.set(g.id, b);
    }
    this.set(hidden);
  }

  set(hidden: Set<GroupId>): void {
    for (const [id, b] of this.buttons) b.setAttribute("aria-pressed", String(!hidden.has(id)));
  }
}

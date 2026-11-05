import "../styles/location.css";
import type { LocationState, PlaceRef } from "../location";
import { type GeoResult, searchAddress } from "../location-search";

export const GPS_OFF_COPY =
  "Location is off. Pick a place below or enable it in Settings > Privacy > Location Services.";

export interface SheetHandlers {
  onGps(): void;
  onPlace(p: PlaceRef): void;
  onSearch(r: { lat: number; lon: number; label: string }): void;
}

export const SEARCH_COPY = {
  placeholder: "Search address",
  searching: "Searching...",
  empty: "No match. Try a street and suburb.",
  error: "Search failed. Check your connection and try again.",
};
const MIN_QUERY = 3;
const DOUBLE_SUBMIT_MS = 400;

export class LocationSheet {
  readonly searchHost: HTMLElement;
  private backdrop = document.createElement("div");
  private sheet = document.createElement("div");
  private message = document.createElement("p");
  private rows = document.createElement("div");
  private places: PlaceRef[] = [];
  private active: LocationState | null = null;
  private returnFocus: HTMLElement | null = null;

  constructor(
    host: HTMLElement,
    private handlers: SheetHandlers,
  ) {
    this.backdrop.className = "sheet-backdrop";
    this.backdrop.hidden = true;
    this.sheet.className = "sheet";
    this.sheet.setAttribute("role", "dialog");
    this.sheet.setAttribute("aria-modal", "true");
    this.sheet.setAttribute("aria-labelledby", "sheet-title");
    const title = document.createElement("h2");
    title.id = "sheet-title";
    title.className = "sheet-title";
    title.textContent = "SET LOCATION";
    this.message.className = "sheet-message";
    this.message.hidden = true;
    this.searchHost = document.createElement("div");
    this.searchHost.className = "sheet-search";
    this.buildSearch();
    this.sheet.append(title, this.message, this.rows, this.searchHost);
    this.backdrop.append(this.sheet);
    host.append(this.backdrop);

    this.backdrop.addEventListener("click", (e) => {
      if (e.target === this.backdrop) this.close();
    });
    this.backdrop.addEventListener("keydown", (e) => this.onKey(e));
    this.renderRows();
  }

  private input = document.createElement("input");
  private results = document.createElement("div");
  private lastSubmit = -Infinity;

  private buildSearch(): void {
    const i = this.input;
    i.type = "search";
    i.className = "search-input";
    i.placeholder = SEARCH_COPY.placeholder;
    i.setAttribute("aria-label", SEARCH_COPY.placeholder);
    i.autocomplete = "off";
    i.setAttribute("enterkeyhint", "search");
    i.setAttribute("autocapitalize", "off");
    i.spellcheck = false;
    this.results.className = "search-results";
    this.results.setAttribute("aria-live", "polite");
    i.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        void this.submit();
      }
    });
    this.searchHost.append(i, this.results);
  }

  private note(text: string): void {
    const p = document.createElement("p");
    p.className = "search-note";
    p.textContent = text;
    this.results.replaceChildren(p);
  }

  private async submit(): Promise<void> {
    const q = this.input.value.trim();
    const t = Date.now();
    if (q.length < MIN_QUERY || t - this.lastSubmit < DOUBLE_SUBMIT_MS) return;
    this.lastSubmit = t;
    this.note(SEARCH_COPY.searching);
    let found: GeoResult[];
    try {
      found = await searchAddress(q);
    } catch {
      this.note(SEARCH_COPY.error);
      return;
    }
    if (found.length === 0) {
      this.note(SEARCH_COPY.empty);
      return;
    }
    this.results.replaceChildren(
      ...found.slice(0, 5).map((r) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "search-row";
        const l = document.createElement("span");
        l.textContent = r.label;
        b.append(l);
        if (r.suburb) {
          const sub = document.createElement("span");
          sub.className = "search-suburb";
          sub.textContent = r.suburb;
          b.append(sub);
        }
        b.addEventListener("click", () => {
          this.handlers.onSearch({ lat: r.lat, lon: r.lon, label: r.label });
          this.close();
        });
        return b;
      }),
    );
  }

  isOpen(): boolean {
    return !this.backdrop.hidden;
  }

  open(message?: string): void {
    if (!this.backdrop.hidden) return;
    this.returnFocus = document.activeElement as HTMLElement | null;
    this.message.textContent = message ?? "";
    this.message.hidden = !message;
    this.backdrop.hidden = false;
    this.focusables()[0]?.focus();
  }

  close(): void {
    if (this.backdrop.hidden) return;
    this.backdrop.hidden = true;
    this.returnFocus?.focus();
    this.returnFocus = null;
  }

  setPlaces(list: PlaceRef[]): void {
    this.places = list;
    this.renderRows();
  }

  setActive(s: LocationState): void {
    this.active = s;
    this.renderRows();
  }

  private row(label: string, active: boolean, onTap: () => void): HTMLButtonElement {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "sheet-row";
    const t = document.createElement("span");
    t.textContent = label;
    const dot = document.createElement("span");
    dot.className = "sheet-dot";
    dot.textContent = active ? "●" : "";
    if (active) b.setAttribute("aria-current", "true");
    b.append(t, dot);
    b.addEventListener("click", () => {
      onTap();
      this.close();
    });
    return b;
  }

  private renderRows(): void {
    const s = this.active;
    const rows: HTMLElement[] = [
      this.row("Use GPS", s?.mode === "gps", () => this.handlers.onGps()),
    ];
    for (const p of this.places) {
      rows.push(
        this.row(p.label, s?.mode === "pin" && s.pin?.id === p.id, () => this.handlers.onPlace(p)),
      );
    }
    this.rows.replaceChildren(...rows);
  }

  private focusables(): HTMLElement[] {
    return Array.from(this.sheet.querySelectorAll<HTMLElement>("button, input, [tabindex]")).filter(
      (e) => !e.hasAttribute("disabled"),
    );
  }

  private onKey(e: KeyboardEvent): void {
    if (e.key === "Escape") {
      e.preventDefault();
      this.close();
      return;
    }
    if (e.key !== "Tab") return;
    const f = this.focusables();
    if (f.length === 0) return;
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

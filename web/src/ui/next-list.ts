import type { RowVM } from "../model";

interface RowEls {
  root: HTMLElement;
  name: HTMLElement;
  count: HTMLElement;
  kind: HTMLElement;
  fresh: HTMLElement;
  labelMinute: number;
  targetMs: number | null;
}

function span(cls: string): HTMLElement {
  const s = document.createElement("span");
  s.className = cls;
  return s;
}

export type ListState = "loading" | "empty" | "no-data-offline" | "ready";

const EXPIRE_MS = 1200;
const EXPIRE_REDUCED_MS = 300;

function reducedMotion(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export class NextList {
  private rows = new Map<string, RowEls>();
  private stateEl: HTMLElement | null = null;
  private lastState: ListState | null = null;

  constructor(private host: HTMLElement) {
    host.setAttribute("role", "list");
  }

  private create(): RowEls {
    const root = document.createElement("div");
    root.className = "row entering";
    root.setAttribute("role", "listitem");
    const l1 = document.createElement("div");
    l1.className = "row-line";
    const l2 = document.createElement("div");
    l2.className = "row-line";
    const name = span("row-name");
    const count = span("row-count");
    const kind = span("row-kind");
    const fresh = span("row-fresh");
    l1.append(name, count);
    l2.append(kind, fresh);
    root.append(l1, l2);
    return { root, name, count, kind, fresh, labelMinute: -1, targetMs: null };
  }

  private clearState(): void {
    if (this.stateEl) {
      this.stateEl.remove();
      this.stateEl = null;
    }
  }

  private clearRows(): void {
    for (const r of this.rows.values()) r.root.remove();
    this.rows.clear();
  }

  private block(heading: string, body: string): void {
    const el = document.createElement("div");
    el.className = "list-state";
    const h = document.createElement("div");
    h.className = "list-state-head";
    h.textContent = heading;
    const b = document.createElement("div");
    b.className = "list-state-body";
    b.textContent = body;
    el.append(h, b);
    this.host.append(el);
    this.stateEl = el;
  }

  setState(state: ListState): void {
    if (state === this.lastState) return;
    this.lastState = state;
    if (state === "ready") {
      this.clearState();
      return;
    }
    this.clearState();
    this.clearRows();
    if (state === "loading") {
      const el = document.createElement("div");
      el.className = "list-state-rows";
      for (let i = 0; i < 3; i++) {
        const row = this.create();
        row.root.classList.add("placeholder");
        row.root.classList.remove("entering");
        row.name.textContent = "--";
        row.count.textContent = "--";
        row.kind.textContent = "loading";
        el.append(row.root);
      }
      this.host.append(el);
      this.stateEl = el;
    } else if (state === "empty") {
      this.block("Nothing on the radar", "No items for this spot yet. Pick another place or check back soon.");
    } else {
      this.block("No data yet", "Connect to your tailnet to load your first profile.");
    }
  }

  private expire(r: RowEls): void {
    r.root.classList.add("expiring");
    const ms = reducedMotion() ? EXPIRE_REDUCED_MS : EXPIRE_MS;
    setTimeout(() => r.root.remove(), ms);
  }

  update(rows: RowVM[], nowMs: number): void {
    if (rows.length > 0) {
      this.clearState();
      this.lastState = "ready";
    }
    const seen = new Set<string>();
    const minute = Math.floor(nowMs / 60000);
    let cursor: Element | null = this.host.firstElementChild;
    for (const vm of rows) {
      seen.add(vm.id);
      let r = this.rows.get(vm.id);
      if (!r) {
        r = this.create();
        this.rows.set(vm.id, r);
      }
      r.targetMs = vm.targetMs;
      if (r.name.textContent !== vm.name) r.name.textContent = vm.name;
      if (r.count.textContent !== vm.countdownText) r.count.textContent = vm.countdownText;
      if (r.kind.textContent !== vm.kindTag) r.kind.textContent = vm.kindTag;
      if (r.fresh.textContent !== vm.ageTag) r.fresh.textContent = vm.ageTag;
      r.root.classList.toggle("first", vm.isFirst);
      r.root.classList.toggle("stale", vm.stale);
      r.root.classList.toggle("urgent", vm.urgent);
      r.root.classList.toggle("red-countdown", vm.redCountdown);
      if (r.labelMinute !== minute) {
        r.root.setAttribute("aria-label", `${vm.name}, ${vm.countdownText}, ${vm.ageTag}`);
        r.labelMinute = minute;
      }
      while (cursor && cursor !== r.root && cursor.classList.contains("expiring")) cursor = cursor.nextElementSibling;
      if (cursor === r.root) {
        cursor = cursor.nextElementSibling;
      } else {
        this.host.insertBefore(r.root, cursor);
      }
    }
    for (const [id, r] of this.rows) {
      if (seen.has(id)) continue;
      this.rows.delete(id);
      if (r.targetMs !== null && r.targetMs <= nowMs) this.expire(r);
      else r.root.remove();
    }
  }
}

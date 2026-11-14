import type { RowVM } from "../model";

interface RowEls {
  root: HTMLElement;
  name: HTMLElement;
  count: HTMLElement;
  kind: HTMLElement;
  fresh: HTMLElement;
  live: HTMLElement;
  note: Text;
  leave: HTMLElement;
  leaveWords: Text;
  leaveVal: HTMLElement;
  chip: HTMLElement;
  vm: RowVM | null;
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

  constructor(private host: HTMLElement, private opts: { onRowTap?(row: RowVM): void } = {}) {
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
    const live = span("row-live");
    const note = document.createTextNode("");
    const leave = span("row-leave");
    const leaveWords = document.createTextNode("");
    const leaveVal = span("leave-val");
    const chip = span("leave-chip");
    leave.append(leaveWords, leaveVal, chip);
    l1.append(name, count);
    l2.append(kind, leave, fresh);
    root.append(l1, l2);
    const els: RowEls = { root, name, count, kind, fresh, live, note, leave, leaveWords, leaveVal, chip, vm: null, labelMinute: -1, targetMs: null };
    const tap = (): void => {
      const vm = els.vm;
      if (vm && vm.transit && !vm.none && vm.stopId != null && this.opts.onRowTap) this.opts.onRowTap(vm);
    };
    root.addEventListener("click", tap);
    root.addEventListener("keydown", (e) => {
      if ((e.key === "Enter" || e.key === " ") && root.getAttribute("role") === "button") {
        e.preventDefault();
        tap();
      }
    });
    return els;
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

  private label(vm: RowVM): string {
    if (vm.transit && vm.leaveText !== undefined) {
      const leave = vm.leaveText.startsWith("leave in") ? vm.leaveText.split(" · ")[0] : vm.leaveText.toLowerCase();
      return `${vm.name}, departs in ${vm.countdownText}, ${vm.live ? "live" : "scheduled"}, ${leave}`;
    }
    return `${vm.name}, ${vm.countdownText}, ${vm.ageTag}`;
  }

  private updateDeparture(r: RowEls, vm: RowVM): void {
    const kindText = vm.live ? "LIVE" : "SCHED";
    if (r.live.textContent !== kindText) r.live.textContent = kindText;
    r.live.classList.toggle("sched", !vm.live);
    const note = vm.note ? ` ${vm.note}` : "";
    if (r.live.parentNode !== r.kind) {
      r.kind.textContent = "";
      const mode = vm.kindTag.split(" · ")[0];
      r.kind.append(document.createTextNode(`${mode} · `), r.live, r.note);
    }
    const mode = vm.kindTag.split(" · ")[0];
    const head = r.kind.firstChild as Text;
    if (head.data !== `${mode} · `) head.data = `${mode} · `;
    if (r.note.data !== note) r.note.data = note;
    const text = vm.leaveText ?? "";
    r.leave.hidden = false;
    let words = "";
    let val = "";
    let chip = "";
    if (vm.leaveNowRed) chip = "LEAVE NOW";
    else if (text.startsWith("leave in ")) {
      words = "leave in ";
      val = text.slice(9);
    } else words = text;
    if (r.leaveWords.data !== words) r.leaveWords.data = words;
    if (r.leaveVal.textContent !== val) r.leaveVal.textContent = val;
    if (r.chip.textContent !== chip) r.chip.textContent = chip;
    r.chip.hidden = chip === "";
    const fresh = vm.stale ? vm.ageTag : "";
    if (r.fresh.textContent !== fresh) r.fresh.textContent = fresh;
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
      r.vm = vm;
      const departure = vm.transit === true && vm.leaveText !== undefined;
      if (departure) {
        this.updateDeparture(r, vm);
      } else {
        if (r.kind.textContent !== vm.kindTag) r.kind.textContent = vm.kindTag;
        if (r.fresh.textContent !== vm.ageTag) r.fresh.textContent = vm.ageTag;
        r.leave.hidden = true;
      }
      const tappable = vm.transit === true && !vm.none && vm.stopId != null;
      if (tappable && r.root.getAttribute("role") !== "button") {
        r.root.setAttribute("role", "button");
        r.root.tabIndex = 0;
      } else if (!tappable && r.root.getAttribute("role") === "button") {
        r.root.setAttribute("role", "listitem");
        r.root.removeAttribute("tabindex");
      }
      r.root.classList.toggle("leave-now", vm.leaveNowRed === true);
      r.root.classList.toggle("missed", vm.missed === true);
      r.root.classList.toggle("sched", vm.transit === true && vm.live === false);
      r.root.classList.toggle("first", vm.isFirst);
      r.root.classList.toggle("stale", vm.stale);
      r.root.classList.toggle("urgent", vm.urgent);
      r.root.classList.toggle("red-countdown", vm.redCountdown);
      r.root.classList.toggle("transit", vm.transit === true);
      r.root.classList.toggle("none", vm.none === true);
      if (r.labelMinute !== minute) {
        r.root.setAttribute("aria-label", this.label(vm));
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

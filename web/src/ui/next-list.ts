import type { RowVM } from "../model";

interface RowEls {
  root: HTMLElement;
  name: HTMLElement;
  count: HTMLElement;
  kind: HTMLElement;
  fresh: HTMLElement;
  labelMinute: number;
}

function span(cls: string): HTMLElement {
  const s = document.createElement("span");
  s.className = cls;
  return s;
}

export class NextList {
  private rows = new Map<string, RowEls>();

  constructor(private host: HTMLElement) {
    host.setAttribute("role", "list");
  }

  private create(): RowEls {
    const root = document.createElement("div");
    root.className = "row";
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
    return { root, name, count, kind, fresh, labelMinute: -1 };
  }

  update(rows: RowVM[], nowMs: number): void {
    const seen = new Set<string>();
    const minute = Math.floor(nowMs / 60000);
    rows.forEach((vm, idx) => {
      seen.add(vm.id);
      let r = this.rows.get(vm.id);
      if (!r) {
        r = this.create();
        this.rows.set(vm.id, r);
      }
      if (r.name.textContent !== vm.name) r.name.textContent = vm.name;
      if (r.count.textContent !== vm.countdownText) r.count.textContent = vm.countdownText;
      if (r.kind.textContent !== vm.kindTag) r.kind.textContent = vm.kindTag;
      r.root.classList.toggle("first", vm.isFirst);
      if (r.labelMinute !== minute) {
        r.root.setAttribute("aria-label", `${vm.name}, ${vm.countdownText}`);
        r.labelMinute = minute;
      }
      if (this.host.children[idx] !== r.root) {
        this.host.insertBefore(r.root, this.host.children[idx] ?? null);
      }
    });
    for (const [id, r] of this.rows) {
      if (!seen.has(id)) {
        r.root.remove();
        this.rows.delete(id);
      }
    }
  }
}

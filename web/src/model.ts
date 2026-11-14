import { fmtCountdown } from "./format";
import { ageTag, isStale } from "./freshness";
import type { Item, Layer, Profile } from "./types";

export type RowVM = {
  id: string;
  name: string;
  kindTag: string;
  countdownText: string;
  targetMs: number | null;
  display: string | null;
  isFirst: boolean;
  item: Item;
  ageTag: string;
  stale: boolean;
  urgent: boolean;
  redCountdown: boolean;
  transit?: boolean;
  none?: boolean;
  stopId?: number | null;
  live?: boolean | null;
  leaveText?: string;
  missed?: boolean;
  leaveNow?: boolean;
  leaveNowRed?: boolean;
  note?: string;
};

const URGENT_MS = 900_000;
export const LEAVE_NOW_MS = 60_000;
export const CATCH_GRACE_MS = 30_000;
export const ROWS_PER_STOP = 2;
export const MAX_DEP_ROWS = 6;

function kindTag(layer: string): string {
  if (layer === "uv_now" || layer === "uv_window") return "uv";
  return layer;
}

export function selectVisible(profile: Profile | null, nowMs: number): RowVM[] {
  if (!profile) return [];
  const best = new Map<string, Item>();
  const status = new Map<string, Layer["status"]>();
  for (const layer of Object.values(profile.layers)) {
    if (layer.id.startsWith("transit_")) continue; // transitRows() owns these
    for (const item of layer.items) {
      if (item.geom) continue; // positioned items live on the map (D-14)
      if (item.detail && item.detail.summary === true) continue;
      if (item.target_ts !== null && item.target_ts * 1000 <= nowMs) continue;
      const key = `${item.layer}|${item.group}`;
      const cur = best.get(key);
      if (!cur || (item.target_ts ?? Infinity) < (cur.target_ts ?? Infinity)) {
        best.set(key, item);
        status.set(key, layer.status);
      }
    }
  }
  const rows: RowVM[] = [...best.entries()].map(([key, item]) => {
    const stale = isStale(item, status.get(key) ?? "fresh", nowMs);
    const targetMs = item.target_ts === null ? null : item.target_ts * 1000;
    const disp = item.detail && typeof item.detail.display === "string" ? item.detail.display : null;
    return {
      id: item.id,
      name: item.name,
      kindTag: kindTag(item.layer),
      countdownText: targetMs === null ? (disp ?? "") : fmtCountdown((targetMs - nowMs) / 1000),
      targetMs,
      display: disp,
      isFirst: false,
      item,
      ageTag: ageTag(item, nowMs),
      stale,
      urgent: !stale && targetMs !== null && targetMs - nowMs > 0 && targetMs - nowMs < URGENT_MS,
      redCountdown: false,
    };
  });
  rows.sort((x, y) => (x.targetMs ?? Infinity) - (y.targetMs ?? Infinity));
  const soonestUrgent = rows.find((r) => r.urgent);
  if (soonestUrgent) soonestUrgent.redCountdown = true;
  const first = rows.find((r) => r.targetMs !== null);
  if (first) first.isFirst = true;
  const tRows = transitRows(profile, nowMs);
  if (tRows.some((r) => r.leaveNowRed)) for (const r of rows) r.redCountdown = false;
  return tRows.length ? [...rows, ...tRows] : rows;
}

export type TransitStatus = "loading" | "PTV key not set" | "unavailable" | "no services listed";

function isSummary(i: Item): boolean {
  return !!i.detail && i.detail.summary === true;
}

/** Status text for the single Departures row, or null when no stops exist. */
export function transitStatusText(profile: Profile): TransitStatus | null {
  const stops = profile.layers["transit_stops"];
  if (!stops) return null;
  if (!stops.items.some((i) => i.geom && !isSummary(i))) return null;
  const summary = stops.items.find(isSummary);
  if (summary && summary.detail && summary.detail.ptv === "no_key") return "PTV key not set";
  const deps = profile.layers["transit_departures"];
  if (!deps || deps.status === "pending") return "loading";
  if (deps.status === "error") return "unavailable";
  return "no services listed";
}

/** Transit drawer rows: none-nearby rows and the departures status row. Never urgent, never red. */
export function transitRows(profile: Profile, nowMs: number): RowVM[] {
  const stops = profile.layers["transit_stops"];
  if (!stops) return [];
  const out: RowVM[] = [];
  const base = (id: string, name: string, tag: string, item: Item, extra: Partial<RowVM>): RowVM => ({
    id, name, kindTag: tag, countdownText: "--", targetMs: null, display: null, isFirst: false, item,
    ageTag: ageTag(item, nowMs), stale: false, urgent: false, redCountdown: false, transit: true, ...extra,
  });
  for (const item of stops.items) {
    if (!item.detail || item.detail.none !== true) continue;
    const mode = String(item.detail.mode ?? "");
    out.push(base(`transit:${item.id}`, item.name, `${mode} · none nearby`, item, { none: true, stopId: null }));
  }
  const depRows = departureRows(profile, nowMs);
  out.push(...depRows);
  const text = depRows.length ? null : transitStatusText(profile);
  if (text) {
    const item = stops.items.find((i) => i.geom && !isSummary(i)) ?? stops.items[0];
    out.push(base("transit:status", "Departures", text, item, { stopId: null }));
  }
  return out;
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function noteFor(d: Record<string, unknown>, live: boolean): string {
  const parts: string[] = [];
  const plat = str(d.platform);
  if (plat) parts.push(d.at_platform === true ? `at plat ${plat}` : `plat ${plat}`);
  const delay = typeof d.delay_s === "number" ? d.delay_s : null;
  if (live && delay !== null) {
    if (delay >= 60) parts.push(`delayed ${Math.round(delay / 60)} min`);
    else if (delay <= -60) parts.push(`${Math.round(-delay / 60)} min early`);
  }
  return parts.join(" · ");
}

/** One catchable departure row per stop and direction group (D-06, D-08, D-09, D-10). */
function departureRows(profile: Profile, nowMs: number): RowVM[] {
  const layer = profile.layers["transit_departures"];
  if (!layer) return [];
  const groups = new Map<string, Item[]>();
  for (const item of layer.items) {
    if (isSummary(item) || item.target_ts === null || !item.detail) continue;
    if (item.target_ts * 1000 <= nowMs - 120_000) continue;
    const arr = groups.get(item.group);
    if (arr) arr.push(item);
    else groups.set(item.group, [item]);
  }
  const leaveOf = (it: Item): number =>
    (it.target_ts as number) * 1000 - Number((it.detail as Record<string, unknown>).walk_s ?? 0) * 1000 - nowMs;
  type Cand = { vm: RowVM; leaveIn: number };
  const cands: Cand[] = [];
  for (const [group, items] of groups) {
    const live = items
      .filter((i) => (i.detail as Record<string, unknown>).cancelled !== true)
      .sort((a, b) => (a.target_ts as number) - (b.target_ts as number));
    if (!live.length) continue;
    let pick = live.find((i) => leaveOf(i) > -CATCH_GRACE_MS);
    const missed = !pick;
    if (!pick) pick = live[0];
    const d = pick.detail as Record<string, unknown>;
    const leaveIn = leaveOf(pick);
    const targetMs = (pick.target_ts as number) * 1000;
    const stale = isStale(pick, layer.status, nowMs);
    const age = ageTag(pick, nowMs);
    const isLive = d.live === true;
    let leaveText = missed ? "too late to catch" : `leave in ${fmtCountdown(Math.max(0, leaveIn) / 1000)}`;
    if (stale) leaveText += ` · ${age}`;
    const vm: RowVM = {
      id: `transit:${group}`, name: pick.name, kindTag: `${str(d.mode)} · ${isLive ? "LIVE" : "SCHED"}`,
      countdownText: fmtCountdown((targetMs - nowMs) / 1000), targetMs, display: null, isFirst: false, item: pick,
      ageTag: age, stale, urgent: false, redCountdown: false, transit: true,
      stopId: typeof d.stop_id === "number" ? d.stop_id : null,
      live: isLive, leaveText, missed, leaveNow: false, leaveNowRed: false, note: noteFor(d, isLive),
    };
    cands.push({ vm, leaveIn });
  }
  const rank = (a: Cand, b: Cand): number =>
    Number(a.vm.missed) - Number(b.vm.missed) || (a.vm.targetMs as number) - (b.vm.targetMs as number);
  cands.sort(rank);
  const perStop = new Map<number | null | undefined, number>();
  const kept: Cand[] = [];
  for (const c of cands) {
    const n = perStop.get(c.vm.stopId) ?? 0;
    if (n >= ROWS_PER_STOP) continue;
    perStop.set(c.vm.stopId, n + 1);
    kept.push(c);
    if (kept.length >= MAX_DEP_ROWS) break;
  }
  const inWindow = kept.filter((c) => !c.vm.missed && !c.vm.stale && c.leaveIn <= LEAVE_NOW_MS && c.leaveIn > -CATCH_GRACE_MS);
  inWindow.forEach((c, i) => {
    c.vm.leaveNow = true;
    c.vm.leaveNowRed = i === 0;
    c.vm.leaveText = i === 0 ? "LEAVE NOW" : "leave now";
  });
  return kept.map((c) => c.vm);
}

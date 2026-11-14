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
};

const URGENT_MS = 900_000;

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
  const hasDepartures = (profile.layers["transit_departures"]?.items ?? []).some((i) => !isSummary(i));
  const text = hasDepartures ? null : transitStatusText(profile);
  if (text) {
    const item = stops.items.find((i) => i.geom && !isSummary(i)) ?? stops.items[0];
    out.push(base("transit:status", "Departures", text, item, { stopId: null }));
  }
  return out;
}

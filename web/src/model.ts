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
    for (const item of layer.items) {
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
  return rows;
}

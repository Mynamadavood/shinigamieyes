import { fmtCountdown } from "./format";
import type { Item, Profile } from "./types";

export type RowVM = {
  id: string;
  name: string;
  kindTag: string;
  countdownText: string;
  targetMs: number | null;
  display: string | null;
  isFirst: boolean;
  item: Item;
};

function kindTag(layer: string): string {
  if (layer === "uv_now" || layer === "uv_window") return "uv";
  return layer;
}

export function selectVisible(profile: Profile | null, nowMs: number): RowVM[] {
  if (!profile) return [];
  const best = new Map<string, Item>();
  for (const layer of Object.values(profile.layers)) {
    for (const item of layer.items) {
      if (item.target_ts !== null && item.target_ts * 1000 <= nowMs) continue;
      const key = `${item.layer}|${item.group}`;
      const cur = best.get(key);
      if (!cur || (item.target_ts ?? Infinity) < (cur.target_ts ?? Infinity)) best.set(key, item);
    }
  }
  const rows: RowVM[] = [...best.values()].map((item) => {
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
    };
  });
  rows.sort((x, y) => (x.targetMs ?? Infinity) - (y.targetMs ?? Infinity));
  const first = rows.find((r) => r.targetMs !== null);
  if (first) first.isFirst = true;
  return rows;
}

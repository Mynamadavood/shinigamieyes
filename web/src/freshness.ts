import type { Item, Layer } from "./types";

function ageSeconds(item: Item, nowMs: number): number {
  return nowMs / 1000 - item.fetched_at;
}

export function ageTag(item: Item, nowMs: number): string {
  if (item.computed) return "computed";
  const age = ageSeconds(item, nowMs);
  if (age < 60) return "just now";
  if (age < 3600) return `${Math.floor(age / 60)}m old`;
  if (age < 86400) return `${Math.floor(age / 3600)}h old`;
  return `${Math.floor(age / 86400)}d old`;
}

export function isStale(item: Item, layerStatus: Layer["status"], nowMs: number): boolean {
  if (layerStatus === "stale") return true;
  if (item.stale_after_s === null) return false;
  return ageSeconds(item, nowMs) > item.stale_after_s;
}

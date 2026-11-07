export const MAX_FULL = 20;
export const MAX_TOTAL = 60;
export const NEAR_M = 30;
export const RED_CAP = 3;
export const EXPAND_ZOOM = 17.5;
/** labelled tags allowed before the zoom-in expansion (D-11: only the nearest get labels) */
export const BASE_FULL = 8;
export const CLUSTER_PX = 96;
export const CLUSTER_MAX = 6;

export type TagIcon = "cctv" | "speed-cam" | "redlight-cam";

export interface TagCand {
  id: string;
  x: number;
  y: number;
  dist: number;
  label: string;
  icon: TagIcon;
}

/** Within 30 m first (ascending), then the rest by ascending distance. */
export function rankTags(c: TagCand[]): TagCand[] {
  return [...c].sort(
    (a, b) => (a.dist <= NEAR_M ? 0 : 1) - (b.dist <= NEAR_M ? 0 : 1) || a.dist - b.dist,
  );
}

export function assignTags(
  ranked: TagCand[],
  zoom: number,
  w = 176,
  h = 32,
): { full: Set<string>; red: Set<string>; rendered: TagCand[] } {
  const red = new Set<string>();
  for (const c of ranked) {
    if (red.size >= RED_CAP) break;
    if (c.dist <= NEAR_M) red.add(c.id);
  }

  const cap = zoom >= EXPAND_ZOOM ? MAX_FULL : BASE_FULL;
  const full = new Set<string>();
  const boxes: TagCand[] = [];
  for (const c of ranked) {
    if (full.size >= cap) break;
    // a lower-ranked label that would overlap a kept one is demoted to a compact icon
    if (boxes.some((b) => Math.abs(b.x - c.x) < w && Math.abs(b.y - c.y) < h)) continue;
    full.add(c.id);
    boxes.push(c);
  }

  // dense compact clusters: at most CLUSTER_MAX within CLUSTER_PX of each other, nearest first
  const kept: TagCand[] = [];
  const keptCompact: TagCand[] = [];
  for (const c of ranked) {
    if (full.has(c.id)) {
      kept.push(c);
      continue;
    }
    const near = keptCompact.filter((k) => Math.hypot(k.x - c.x, k.y - c.y) <= CLUSTER_PX).length;
    if (near >= CLUSTER_MAX) continue;
    keptCompact.push(c);
    kept.push(c);
  }
  return { full, red, rendered: kept.slice(0, MAX_TOTAL) };
}

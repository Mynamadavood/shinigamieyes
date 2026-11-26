import type { Layer, Profile } from "./types";

/** HUD-08: user-facing layer groups. A group owns every profile layer id with one of its prefixes. */
export const LAYER_GROUPS = [
  { id: "transit", label: "Transit", prefixes: ["transit_"] },
  { id: "cameras", label: "Cameras", prefixes: ["cameras_"] },
  { id: "weather", label: "Weather", prefixes: ["weather"] },
  { id: "uv", label: "UV", prefixes: ["uv_"] },
  { id: "fire", label: "Fire", prefixes: ["fire_"] },
  { id: "pollen", label: "Pollen", prefixes: ["pollen"] },
  { id: "sun", label: "Sun", prefixes: ["sun"] },
] as const;

export type GroupId = (typeof LAYER_GROUPS)[number]["id"];
const KEY = "shinigami.hiddenLayers";
const IDS = new Set<string>(LAYER_GROUPS.map((g) => g.id));

/** Hidden groups from this device; empty when storage is blocked or holds junk. */
export function loadHidden(): Set<GroupId> {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return new Set((Array.isArray(raw) ? raw : []).filter((x): x is GroupId => IDS.has(x)));
  } catch {
    return new Set();
  }
}

export function saveHidden(hidden: Set<GroupId>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify([...hidden]));
  } catch {
    /* private mode: the choice lasts for this session only */
  }
}

/** The profile without the layers of hidden groups. Same object when nothing is hidden. */
export function hideLayers(p: Profile | null, hidden: Set<GroupId>): Profile | null {
  if (!p || hidden.size === 0) return p;
  const prefixes = LAYER_GROUPS.filter((g) => hidden.has(g.id)).flatMap((g) => [...g.prefixes]);
  const layers: Record<string, Layer> = {};
  for (const [id, l] of Object.entries(p.layers)) {
    if (!prefixes.some((pre) => id.startsWith(pre))) layers[id] = l;
  }
  return { ...p, layers };
}

import type { Item, Layer } from "../types";
import { modeTitle, modeWord, walkMinText } from "../transit";
import { fmtDistance } from "./camera-card";
import type { CardContent } from "./card";

const MAX_TEXT = 80;

export interface TransitCardContext {
  departures?: Layer;
  disruptions?: Layer;
  ptvState: string | null;
}

/** Stop card header. Departure sections are added by a later plan. */
export function stopCardContent(
  item: Item,
  distanceM: number,
  walkS: number,
  _ctx: TransitCardContext | null,
  _nowMs: number,
): CardContent {
  const rawMode = item.detail?.["mode"];
  const mode = modeWord(typeof rawMode === "string" ? rawMode : item.group);
  const name = item.name.trim().slice(0, MAX_TEXT);
  return {
    title: modeTitle(mode),
    primary: name,
    extra: `${fmtDistance(distanceM)} · ${walkMinText(walkS)} walk`,
    secondary: [],
    caveats: ["Source: PTV"],
  };
}

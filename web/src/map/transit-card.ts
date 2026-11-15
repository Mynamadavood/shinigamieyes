import { ageTag } from "../freshness";
import type { Item, Layer } from "../types";
import { modeTitle, modeWord, walkMinText } from "../transit";
import { fmtDistance } from "./camera-card";
import type { CardContent, CardLine, CardSection } from "./card";

const MAX_TEXT = 80;
const MAX_ALERT_TEXT = 120;
export const MAX_CARD_ALERTS = 2;
export const MAX_CARD_LINES = 8;
export const PER_GROUP = 2;
const STALE_S = 120;
const GRACE_MS = 30_000;
const DEPARTED_MS = 15_000;

export interface TransitCardContext {
  departures?: Layer;
  disruptions?: Layer;
  ptvState: string | null;
}

const clip = (t: string): string => t.slice(0, MAX_TEXT);

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "";
}

function noteFor(d: Record<string, unknown>, train: boolean): string {
  const parts: string[] = [];
  const plat = str(d["platform"]);
  if (train && plat) parts.push(d["at_platform"] === true ? `at plat ${plat}` : `plat ${plat}`);
  const delay = typeof d["delay_s"] === "number" ? d["delay_s"] : null;
  if (d["live"] === true && delay !== null) {
    if (delay >= 60) parts.push(`delayed ${Math.round(delay / 60)} min`);
    else if (delay <= -60) parts.push(`${Math.round(-delay / 60)} min early`);
  }
  return parts.join(" · ");
}

function headFor(d: Record<string, unknown>): string {
  const dest = str(d["destination"]);
  const to = dest ? `to ${dest}` : "";
  if (str(d["mode"]) === "train") {
    const rn = str(d["route_name"]);
    return clip(rn ? `${rn} line ${to}`.trim() : to);
  }
  const num = str(d["route_number"]);
  return clip(`${num} ${to}`.trim());
}

function nums(v: unknown): number[] {
  return Array.isArray(v) ? v.filter((x): x is number => typeof x === "number") : [];
}

function realDisruptions(ctx: TransitCardContext | null): Item[] {
  const layer = ctx?.disruptions;
  if (!layer) return [];
  return layer.items.filter((it) => it.detail && it.detail["summary"] !== true && it.detail["none"] !== true);
}

function hits(dis: Item, routeId: unknown, stopId: unknown, ids: number[]): boolean {
  const d = dis.detail ?? {};
  if (typeof routeId === "number" && nums(d["route_ids"]).includes(routeId)) return true;
  if (typeof stopId === "number" && nums(d["stop_ids"]).includes(stopId)) return true;
  return typeof d["disruption_id"] === "number" && ids.includes(d["disruption_id"]);
}

/** Disruptions that apply to a stop or to a route among its departures; service-stopping first, then soonest end. */
export function stopDisruptions(stopItem: Item, ctx: TransitCardContext | null): Item[] {
  const dis = realDisruptions(ctx);
  if (dis.length === 0) return [];
  const stopId = stopItem.detail?.["stop_id"];
  const routes = new Set<number>();
  for (const it of ctx?.departures?.items ?? []) {
    const d = it.detail ?? {};
    if (d["stop_id"] === stopId && typeof d["route_id"] === "number") routes.add(d["route_id"]);
  }
  const matched = dis.filter((x) => {
    const d = x.detail ?? {};
    if (typeof stopId === "number" && nums(d["stop_ids"]).includes(stopId)) return true;
    return nums(d["route_ids"]).some((r) => routes.has(r));
  });
  const end = (x: Item): number => (x.target_ts === null ? Infinity : x.target_ts);
  return matched.sort(
    (a, b) => Number(b.severity === 3) - Number(a.severity === 3) || end(a) - end(b),
  );
}

function alertSection(list: Item[]): CardSection[] {
  if (list.length === 0) return [];
  const lines: CardLine[] = [];
  for (const x of list.slice(0, MAX_CARD_ALERTS)) {
    const stop = x.severity === 3;
    const title = str(x.detail?.["title"]) || x.name.trim();
    lines.push({
      cls: ["card-alert", ...(stop ? ["stop"] : [])],
      warn: stop ? 3 : 1,
      text: title.slice(0, MAX_ALERT_TEXT),
    });
    if (x.target_ts !== null) {
      lines.push({
        cls: ["card-alert-end", ...(stop ? ["stop"] : [])],
        text: "ends in",
        countTargetMs: x.target_ts * 1000,
      });
    }
  }
  if (list.length > MAX_CARD_ALERTS) {
    lines.push({ cls: ["dep-more"], text: `+${list.length - MAX_CARD_ALERTS} more · see disruptions` });
  }
  return [{ cls: "card-alerts", lines }];
}

function warnFor(it: Item, dis: Item[], stopId: unknown): 0 | 1 | 3 {
  const d = it.detail ?? {};
  const ids = nums(d["disruption_ids"]);
  let warn: 0 | 1 | 3 = 0;
  for (const x of dis) {
    if (!hits(x, d["route_id"], stopId, ids)) continue;
    const w: 1 | 3 = x.severity === 3 ? 3 : 1;
    if (w > warn) warn = w;
  }
  return warn;
}

function line(it: Item, walkS: number, nowMs: number, warn: 0 | 1 | 3 = 0): CardLine {
  const d = it.detail ?? {};
  const target = (it.target_ts ?? 0) * 1000;
  if (d["cancelled"] === true) {
    const c: CardLine = { cls: ["cancelled"], countTargetMs: target, chip: "CANCELLED" };
    if (warn) c.warn = warn;
    return c;
  }
  const live = d["live"] === true;
  const missed = target - walkS * 1000 - nowMs < -GRACE_MS;
  const note = missed ? "too late" : noteFor(d, str(d["mode"]) === "train");
  const out: CardLine = {
    cls: [live ? "live" : "sched", ...(missed ? ["missed"] : [])],
    countTargetMs: target,
    mark: { text: live ? "LIVE" : "SCHED", cls: live ? "live" : "sched" },
  };
  if (note) out.note = clip(note);
  if (warn) out.warn = warn;
  return out;
}

const stateSection = (text: string): CardSection[] => [{ lines: [{ cls: ["dep-state"], text }] }];

/** Departure sections for one stop card: groups, or a state line. */
export function depLines(
  item: Item,
  ctx: TransitCardContext | null,
  nowMs: number,
  walkS: number = Number(item.detail?.["walk_s"] ?? 0) || 0,
): CardSection[] {
  if (ctx?.ptvState === "no_key") return stateSection("Departures · PTV key not set");
  const layer = ctx?.departures;
  if (!layer || layer.status === "pending") return stateSection("Departures · loading");
  const stopId = item.detail?.["stop_id"];
  const mine = layer.items.filter(
    (it) =>
      it.detail?.["stop_id"] === stopId &&
      it.target_ts !== null &&
      it.target_ts * 1000 > nowMs - DEPARTED_MS,
  );
  if (mine.length === 0) {
    return stateSection(layer.status === "error" ? "Departures · unavailable" : "No services listed");
  }
  const groups = new Map<string, Item[]>();
  for (const it of mine) {
    const d = it.detail ?? {};
    const key = `${str(d["route_id"])}:${str(d["direction_id"])}`;
    const g = groups.get(key);
    if (g) g.push(it);
    else groups.set(key, [it]);
  }
  const ordered = [...groups.values()]
    .map((g) => g.sort((a, b) => (a.target_ts ?? 0) - (b.target_ts ?? 0)))
    .sort((a, b) => (a[0].target_ts ?? 0) - (b[0].target_ts ?? 0));
  const newest = mine.reduce((a, b) => (b.fetched_at > a.fetched_at ? b : a));
  const stale =
    layer.status === "stale" || layer.status === "error" || nowMs / 1000 - newest.fetched_at > STALE_S;

  const dis = realDisruptions(ctx);
  const out: CardSection[] = [];
  let used = 0;
  let hidden = 0;
  for (const g of ordered) {
    const room = Math.min(PER_GROUP, MAX_CARD_LINES - used);
    if (room <= 0) {
      hidden += 1;
      continue;
    }
    const lines = g.slice(0, room).map((it) => line(it, walkS, nowMs, warnFor(it, dis, stopId)));
    used += lines.length;
    const sec: CardSection = { head: headFor(g[0].detail ?? {}), lines };
    if (stale) sec.cls = "stale";
    out.push(sec);
  }
  if (hidden > 0) out.push({ lines: [{ cls: ["dep-more"], text: `+${hidden} more routes` }] });
  if (stale) out.push({ lines: [{ cls: ["dep-state"], text: `Departures ${ageTag(newest, nowMs)}` }] });
  return out;
}

/** Stop card: static header plus departure sections. */
export function stopCardContent(
  item: Item,
  distanceM: number,
  walkS: number,
  ctx: TransitCardContext | null,
  nowMs: number,
): CardContent {
  const rawMode = item.detail?.["mode"];
  const mode = modeWord(typeof rawMode === "string" ? rawMode : item.group);
  const name = item.name.trim().slice(0, MAX_TEXT);
  return {
    title: modeTitle(mode),
    primary: name,
    extra: `${fmtDistance(distanceM)} · ${walkMinText(walkS)} walk`,
    secondary: [],
    sections: [...depLines(item, ctx, nowMs, walkS), ...alertSection(stopDisruptions(item, ctx))],
    caveats: ["Source: PTV"],
  };
}

import { get, set } from "idb-keyval";
import type { Profile } from "./types";

const PROFILE_KEY = "profile:last";
const SYNC_KEY = "sync:last";

// IndexedDB is the offline store (iOS evicts SW caches); failures must never break rendering.

/** A cached profile and the request params key it was fetched for (null for legacy records). */
export interface CachedProfile {
  profile: Profile;
  key: string | null;
}

interface Record2 {
  v: 2;
  key: string;
  profile: Profile;
}

const isRecord2 = (r: unknown): r is Record2 =>
  !!r && typeof r === "object" && (r as { v?: unknown }).v === 2 && "profile" in r;

/** `key` is the params key the profile was fetched for, so boot can check it matches (WR-W4). */
export async function saveProfile(p: Profile, key = ""): Promise<void> {
  try {
    const rec: Record2 = { v: 2, key, profile: p };
    await set(PROFILE_KEY, rec);
  } catch {
    /* private mode / eviction */
  }
}

export async function loadCachedProfile(): Promise<CachedProfile | null> {
  try {
    const raw = (await get(PROFILE_KEY)) as unknown;
    if (!raw || typeof raw !== "object") return null;
    if (isRecord2(raw)) return { profile: raw.profile, key: typeof raw.key === "string" ? raw.key : null };
    // pre-WR-W4 record: a bare profile with no params key
    if ("layers" in raw) return { profile: raw as Profile, key: null };
    return null;
  } catch {
    return null;
  }
}

export async function loadProfile(): Promise<Profile | null> {
  return (await loadCachedProfile())?.profile ?? null;
}

export async function saveLastSync(ms: number): Promise<void> {
  try {
    await set(SYNC_KEY, ms);
  } catch {
    /* ignore */
  }
}

export async function loadLastSync(): Promise<number | null> {
  try {
    return ((await get(SYNC_KEY)) as number | undefined) ?? null;
  } catch {
    return null;
  }
}

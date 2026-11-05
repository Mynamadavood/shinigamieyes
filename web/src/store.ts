import { get, set } from "idb-keyval";
import type { Profile } from "./types";

const PROFILE_KEY = "profile:last";
const SYNC_KEY = "sync:last";

// IndexedDB is the offline store (iOS evicts SW caches); failures must never break rendering.

export async function saveProfile(p: Profile): Promise<void> {
  try {
    await set(PROFILE_KEY, p);
  } catch {
    /* private mode / eviction */
  }
}

export async function loadProfile(): Promise<Profile | null> {
  try {
    return ((await get(PROFILE_KEY)) as Profile | undefined) ?? null;
  } catch {
    return null;
  }
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

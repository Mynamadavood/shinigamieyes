import { measureOffset } from "./clock";
import type { Profile } from "./types";

export async function fetchProfile(
  params: URLSearchParams | null,
  opts: { timeoutMs?: number } = {},
): Promise<{ profile: Profile; offsetMs: number }> {
  const timeoutMs = opts.timeoutMs ?? 4000;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const qs = params && params.toString() ? `?${params.toString()}` : "";
    const tSend = Date.now();
    const res = await fetch(`/api/profile${qs}`, { signal: ctl.signal });
    const tRecv = Date.now();
    if (!res.ok) throw new Error(`profile HTTP ${res.status}`);
    const profile = (await res.json()) as Profile;
    return { profile, offsetMs: measureOffset(profile.server_time, tSend, tRecv) };
  } finally {
    clearTimeout(timer);
  }
}

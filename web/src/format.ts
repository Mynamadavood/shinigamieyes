export function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** Adaptive countdown per D-04: mm:ss < 1h, Hh Mm < 1d, Dd Hh beyond. */
export function fmtCountdown(sec: number): string {
  const s = Math.max(0, Math.floor(Number.isFinite(sec) ? sec : 0));
  if (s < 3600) return `${pad2(Math.floor(s / 60))}:${pad2(s % 60)}`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
  return `${Math.floor(s / 86400)}d ${Math.floor((s % 86400) / 3600)}h`;
}

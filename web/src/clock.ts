let offsetMs = 0;

/** Server-minus-client offset using the RTT midpoint. */
export function measureOffset(serverTimeS: number, tSendMs: number, tRecvMs: number): number {
  return serverTimeS * 1000 - (tSendMs + tRecvMs) / 2;
}
export function setOffset(ms: number): void {
  offsetMs = ms;
}
export function getOffset(): number {
  return offsetMs;
}
export function nowMs(): number {
  return Date.now() + offsetMs;
}

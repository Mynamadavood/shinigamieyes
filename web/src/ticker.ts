import { nowMs } from "./clock";

/** Boundary-aligned 1 Hz ticker; also ticks on foregrounding. Returns stop(). */
export function startTicker(onTick: (nowMs: number) => void): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const schedule = () => {
    timer = setTimeout(() => {
      onTick(nowMs());
      schedule();
    }, 1000 - (nowMs() % 1000) + 5);
  };
  const immediate = () => onTick(nowMs());
  const onVisible = () => {
    if (!document.hidden) immediate();
  };

  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("pageshow", immediate);
  window.addEventListener("focus", immediate);
  immediate();
  schedule();

  return () => {
    if (timer !== undefined) clearTimeout(timer);
    document.removeEventListener("visibilitychange", onVisible);
    window.removeEventListener("pageshow", immediate);
    window.removeEventListener("focus", immediate);
  };
}

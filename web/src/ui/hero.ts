import { createEyesSvg } from "./hero-art";
import "../styles/hero.css";

export const HERO_MS = 1500;
export const HERO_REDUCED_MS = 700;
export const FADE_MS = 200;

/** Cold open only: never on back/forward, bfcache restore, or a second call in one page lifetime. */
export function shouldPlayHero(navType: string | undefined, persisted: boolean, alreadyPlayed: boolean): boolean {
  return navType !== "back_forward" && !persisted && !alreadyPlayed;
}

export interface HeroHandle {
  skip(): void;
  /** End within `ms` from now (fade included); never lengthens the hero. */
  shortenTo(ms: number): void;
  done: Promise<void>;
}

export function mountHero(
  root: HTMLElement,
  slots: { titleBar: HTMLElement; titleText: HTMLElement },
  opts: { reducedMotion: boolean; now?: () => number },
): HeroHandle {
  const now = opts.now ?? Date.now;
  const total = opts.reducedMotion ? HERO_REDUCED_MS : HERO_MS;
  const started = now();

  const hero = document.createElement("div");
  hero.className = opts.reducedMotion ? "hero reduced" : "hero";
  hero.setAttribute("role", "presentation");
  const band = document.createElement("div");
  band.className = "hero-band";
  band.append(createEyesSvg());
  const skipBtn = document.createElement("button");
  skipBtn.type = "button";
  skipBtn.className = "hero-skip";
  skipBtn.setAttribute("aria-label", "Skip intro");
  hero.append(band, skipBtn);

  const previousTitle = slots.titleText.textContent;
  slots.titleText.textContent = "EYES";
  const hidden: Element[] = [];
  for (const c of Array.from(root.children)) {
    if (!c.hasAttribute("aria-hidden")) {
      c.setAttribute("aria-hidden", "true");
      hidden.push(c);
    }
  }
  root.append(hero);
  skipBtn.focus();

  let resolveDone: () => void = () => {};
  const done = new Promise<void>((r) => {
    resolveDone = r;
  });
  let finished = false;
  let fading = false;
  let fadeTimer: ReturnType<typeof setTimeout> | undefined;
  let endTimer: ReturnType<typeof setTimeout> | undefined;
  const closeBox = slots.titleBar.querySelector(".close-box");

  function finish(): void {
    if (finished) return;
    finished = true;
    clearTimeout(fadeTimer);
    clearTimeout(endTimer);
    closeBox?.removeEventListener("click", skip);
    hero.remove();
    slots.titleText.textContent = previousTitle;
    for (const c of hidden) c.removeAttribute("aria-hidden");
    root.removeAttribute("aria-hidden");
    resolveDone();
  }

  function startFade(): void {
    if (finished || fading) return;
    fading = true;
    hero.classList.add("fading");
  }

  function skip(): void {
    if (finished || fading) return;
    if (opts.reducedMotion) {
      finish();
      return;
    }
    startFade();
    clearTimeout(fadeTimer);
    clearTimeout(endTimer);
    const remaining = Math.max(0, total - (now() - started));
    endTimer = setTimeout(finish, Math.min(FADE_MS, remaining));
  }

  function shortenTo(ms: number): void {
    if (finished || fading) return;
    const elapsed = now() - started;
    if (elapsed + ms >= total) return;
    clearTimeout(fadeTimer);
    clearTimeout(endTimer);
    if (!opts.reducedMotion) fadeTimer = setTimeout(startFade, Math.max(0, ms - FADE_MS));
    endTimer = setTimeout(finish, ms);
  }

  skipBtn.addEventListener("click", skip);
  closeBox?.addEventListener("click", skip);

  fadeTimer = setTimeout(startFade, total - FADE_MS);
  endTimer = setTimeout(finish, total); // hard cap
  return { skip, shortenTo, done };
}

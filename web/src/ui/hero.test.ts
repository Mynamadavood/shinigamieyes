import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FADE_MS, HERO_MS, HERO_REDUCED_MS, mountHero, shouldPlayHero } from "./hero";
import { mountShell } from "./shell";

let root: HTMLElement;
let slots: ReturnType<typeof mountShell>;
beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = '<div id="app" aria-hidden="true"></div>';
  root = document.getElementById("app")!;
  slots = mountShell(root);
});
afterEach(() => {
  vi.useRealTimers();
});

const hero = () => root.querySelector(".hero");
const mount = (reducedMotion = false) => mountHero(root, slots, { reducedMotion });

describe("constants", () => {
  it("match the UI-SPEC caps", () => {
    expect(HERO_MS).toBe(1500);
    expect(HERO_REDUCED_MS).toBe(700);
    expect(FADE_MS).toBe(200);
  });
});

describe("shouldPlayHero", () => {
  it("plays only on a cold open", () => {
    expect(shouldPlayHero("navigate", false, false)).toBe(true);
    expect(shouldPlayHero(undefined, false, false)).toBe(true);
    expect(shouldPlayHero("back_forward", false, false)).toBe(false);
    expect(shouldPlayHero("navigate", true, false)).toBe(false);
    expect(shouldPlayHero("navigate", false, true)).toBe(false);
  });
});

describe("mountHero timeline", () => {
  it("shows EYES immediately and ends at 1500 ms", async () => {
    const h = mount();
    expect(hero()).not.toBeNull();
    expect(slots.titleText.textContent).toBe("EYES");
    expect(root.firstElementChild?.getAttribute("aria-hidden")).toBe("true");
    vi.advanceTimersByTime(1299);
    expect(hero()!.classList.contains("fading")).toBe(false);
    vi.advanceTimersByTime(1);
    expect(hero()!.classList.contains("fading")).toBe(true);
    vi.advanceTimersByTime(199);
    expect(hero()).not.toBeNull();
    vi.advanceTimersByTime(1);
    expect(hero()).toBeNull();
    expect(slots.titleText.textContent).toBe("SHINIGAMI EYES");
    await expect(h.done).resolves.toBeUndefined();
    expect(root.hasAttribute("aria-hidden")).toBe(false);
    expect(slots.mapHost.hasAttribute("aria-hidden")).toBe(false);
  });

  it("skip() at 400 ms fades at once and removes 200 ms later", () => {
    const h = mount();
    vi.advanceTimersByTime(400);
    h.skip();
    expect(hero()!.classList.contains("fading")).toBe(true);
    vi.advanceTimersByTime(199);
    expect(hero()).not.toBeNull();
    vi.advanceTimersByTime(1);
    expect(hero()).toBeNull();
  });

  it("a late skip never extends past 1500 ms", () => {
    const h = mount();
    vi.advanceTimersByTime(1400);
    h.skip();
    vi.advanceTimersByTime(100);
    expect(hero()).toBeNull();
  });

  it("reduced motion is static for 700 ms and skip removes immediately", () => {
    mount(true);
    expect(hero()!.classList.contains("reduced")).toBe(true);
    vi.advanceTimersByTime(699);
    expect(hero()).not.toBeNull();
    vi.advanceTimersByTime(1);
    expect(hero()).toBeNull();

    const h = mount(true);
    h.skip();
    expect(hero()).toBeNull();
  });

  it("has exactly one focusable element and skips from it or the close box", () => {
    mount();
    const focusable = hero()!.querySelectorAll("button, a, input, select, textarea, [tabindex]");
    expect(focusable.length).toBe(1);
    const btn = hero()!.querySelector("button.hero-skip") as HTMLButtonElement;
    expect(btn.getAttribute("aria-label")).toBe("Skip intro");
    btn.click();
    expect(hero()!.classList.contains("fading")).toBe(true);
    vi.advanceTimersByTime(200);
    expect(hero()).toBeNull();

    mount();
    (slots.titleBar.querySelector(".close-box") as HTMLElement).click();
    expect(hero()!.classList.contains("fading")).toBe(true);
  });

  it("shortenTo(600) at 250 ms fades at 650 ms and ends at 850 ms (WR-W1)", () => {
    const h = mount();
    vi.advanceTimersByTime(250);
    h.shortenTo(600);
    vi.advanceTimersByTime(399);
    expect(hero()!.classList.contains("fading")).toBe(false);
    vi.advanceTimersByTime(1);
    expect(hero()!.classList.contains("fading")).toBe(true);
    vi.advanceTimersByTime(199);
    expect(hero()).not.toBeNull();
    vi.advanceTimersByTime(1);
    expect(hero()).toBeNull();
  });

  it("shortenTo never lengthens the hero; reduced motion ends without a fade", () => {
    const h = mount();
    vi.advanceTimersByTime(1000);
    h.shortenTo(600);
    vi.advanceTimersByTime(500);
    expect(hero()).toBeNull();

    const r = mount(true);
    vi.advanceTimersByTime(100);
    r.shortenTo(300);
    vi.advanceTimersByTime(299);
    expect(hero()!.classList.contains("fading")).toBe(false);
    vi.advanceTimersByTime(1);
    expect(hero()).toBeNull();
  });

  it("uses no inline styles", () => {
    mount();
    expect(hero()!.querySelector("[style]")).toBeNull();
  });
});

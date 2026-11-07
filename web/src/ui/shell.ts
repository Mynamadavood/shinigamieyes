import "../styles/hud.css";

export interface ShellSlots {
  mapHost: HTMLElement;
  hud: HTMLElement;
  titleBar: HTMLElement;
  titleText: HTMLElement;
  bannerSlot: HTMLElement;
  locationSlot: HTMLElement;
  readoutsLeft: HTMLElement;
  readoutsRight: HTMLElement;
  controls: HTMLElement;
  drawer: HTMLElement;
  listHost: HTMLElement;
  footer: HTMLElement;
}

function el(tag: string, cls: string, text?: string): HTMLElement {
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

export function mountShell(root: HTMLElement): ShellSlots {
  const mapHost = el("div", "map-host");

  const titleBar = el("header", "title-bar");
  const titleText = el("span", "title-text", "SHINIGAMI EYES");
  const close = el("span", "close-box", "×");
  close.setAttribute("aria-hidden", "true");
  titleBar.append(titleText, close);

  const bannerSlot = el("div", "banner-slot");
  const locationSlot = el("div", "location-strip");
  const readoutsLeft = el("div", "readouts-col readouts-left");
  const readoutsRight = el("div", "readouts-col readouts-right");
  const readouts = el("div", "readouts");
  readouts.append(readoutsLeft, readoutsRight);

  const hud = el("div", "hud");
  hud.append(titleBar, bannerSlot, locationSlot, readouts);

  const controls = el("div", "map-controls");

  const drawer = el("section", "drawer");
  drawer.setAttribute("role", "region");
  drawer.setAttribute("aria-label", "Next up");
  const handle = el("button", "drawer-handle");
  handle.setAttribute("type", "button");
  const listHost = el("div", "next-list");
  const footer = el("footer", "footer");
  const body = el("div", "drawer-body");
  body.append(listHost, footer);
  drawer.append(handle, body);

  root.replaceChildren(mapHost, hud, controls, drawer);
  return {
    mapHost, hud, titleBar, titleText, bannerSlot, locationSlot,
    readoutsLeft, readoutsRight, controls, drawer, listHost, footer,
  };
}

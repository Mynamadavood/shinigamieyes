export interface ShellSlots {
  titleBar: HTMLElement;
  bannerSlot: HTMLElement;
  locationSlot: HTMLElement;
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
  const titleBar = el("header", "title-bar");
  titleBar.append(el("span", "title-text", "SHINIGAMI EYES"));
  const close = el("span", "close-box", "×");
  close.setAttribute("aria-hidden", "true");
  titleBar.append(close);

  const bannerSlot = el("div", "banner-slot");
  const locationSlot = el("div", "location-strip");
  const header = el("h2", "section-header", "NEXT");
  const listHost = el("section", "next-list");
  const footer = el("footer", "footer");

  root.replaceChildren(titleBar, bannerSlot, locationSlot, header, listHost, footer);
  return { titleBar, bannerSlot, locationSlot, listHost, footer };
}

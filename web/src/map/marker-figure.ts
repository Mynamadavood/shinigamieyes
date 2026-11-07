const NS = "http://www.w3.org/2000/svg";

function svgEl(name: string, attrs: Record<string, string>): SVGElement {
  const el = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

function wrapper(cls: string): HTMLElement {
  const el = document.createElement("div");
  el.className = `marker-hit ${cls}`;
  return el;
}

/** Original faceless suited-figure silhouette (D-17). Not a likeness of any character. */
export function createFigureElement(): HTMLElement {
  const root = wrapper("marker-figure-wrap");
  const svg = svgEl("svg", {
    viewBox: "0 0 32 32",
    class: "marker-figure",
    role: "img",
    "aria-label": "Your position",
  });
  // head
  svg.appendChild(svgEl("circle", { cx: "16", cy: "6", r: "4" }));
  // jacket: shoulders to hip, V lapel notch cut out of the top
  svg.appendChild(svgEl("path", { d: "M8 12 L13 11 L16 16 L19 11 L24 12 L25 22 L7 22 Z" }));
  // trapezoid legs
  svg.appendChild(svgEl("path", { d: "M9 22 L23 22 L21 31 L17 31 L16 25 L15 31 L11 31 Z" }));
  // short tie notch (background colour)
  svg.appendChild(svgEl("path", { d: "M15.2 16 L16.8 16 L17.2 20 L16 21.5 L14.8 20 Z", class: "marker-tie" }));
  root.appendChild(svg);
  return root;
}

/** Update the accessible name with the latest accuracy. */
export function setFigureAccuracy(el: HTMLElement, metres: number): void {
  el.querySelector("svg")?.setAttribute("aria-label", `Your position, accuracy ${Math.round(metres)} metres`);
}

/** Blue pin for a search result or dropped pin. */
export function createPinElement(): HTMLElement {
  const root = wrapper("marker-pin");
  const svg = svgEl("svg", { viewBox: "0 0 32 32", role: "img", "aria-label": "Pin" });
  svg.appendChild(svgEl("path", { d: "M16 31 L7 17 A10 10 0 1 1 25 17 Z", class: "pin-body" }));
  svg.appendChild(svgEl("circle", { cx: "16", cy: "11", r: "3", class: "pin-hole" }));
  root.appendChild(svg);
  return root;
}

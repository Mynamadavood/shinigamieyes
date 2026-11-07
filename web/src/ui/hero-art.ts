const NS = "http://www.w3.org/2000/svg";

function s(tag: string, attrs: Record<string, string>, cls?: string): SVGElement {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (cls) e.setAttribute("class", cls);
  return e;
}

/** One original anime-style eye, drawn for the left side; the right one is a mirrored copy. */
function eye(id: string): SVGElement {
  const g = s("g", {}, "eye");
  const clip = s("clipPath", { id });
  clip.append(s("path", { d: "M30 76 C55 46 105 42 144 70 C118 88 62 92 30 76 Z" }));
  const body = s("path", { d: "M30 76 C55 46 105 42 144 70 C118 88 62 92 30 76 Z" }, "eye-body");
  const irisRest = s("circle", { cx: "90", cy: "68", r: "22" }, "iris iris-rest");
  const irisLit = s("circle", { cx: "90", cy: "68", r: "22" }, "iris iris-lit");
  const irisGroup = s("g", { "clip-path": `url(#${id})` });
  irisGroup.append(irisRest, irisLit, s("circle", { cx: "90", cy: "68", r: "9" }, "pupil"));
  irisGroup.append(s("rect", { x: "98", y: "58", width: "4", height: "4" }, "notch"));
  const lid = s("path", { d: "M30 76 C55 46 105 42 144 70" }, "lid");
  const lash = s("path", { d: "M30 76 L16 86 M62 88 L58 98" }, "lash");
  g.append(clip, body, irisGroup, lid, lash);
  return g;
}

function brow(): SVGElement {
  const g = s("g", {}, "brow-set");
  g.append(s("path", { d: "M24 46 C60 20 112 18 154 44 L148 55 C110 36 62 36 30 60 Z" }, "brow"));
  g.append(
    s("path", { d: "M10 14 L26 62" }, "strand"),
    s("path", { d: "M20 10 L34 54" }, "strand"),
    s("path", { d: "M2 30 L18 72" }, "strand"),
  );
  return g;
}

/** Two original red eyes, flat colours only, built without innerHTML. */
export function createEyesSvg(): SVGSVGElement {
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 360 128");
  svg.setAttribute("preserveAspectRatio", "xMidYMid slice");
  svg.setAttribute("class", "hero-art");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");

  const left = s("g", {}, "side side-left");
  left.append(brow(), eye("hero-clip-l"));
  const right = s("g", { transform: "translate(360 0) scale(-1 1)" }, "side side-right");
  right.append(brow(), eye("hero-clip-r"));

  svg.append(
    left,
    right,
    s("rect", { x: "0", y: "0", width: "360", height: "128" }, "flood"),
    s("rect", { x: "0", y: "0", width: "360", height: "128" }, "reveal"),
  );
  return svg;
}

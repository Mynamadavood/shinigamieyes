const NS = "http://www.w3.org/2000/svg";

export interface LRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface LeaderPoints {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** From the tag icon box edge to the nearest card edge midpoint (pure). */
export function leaderPoints(tag: LRect, card: LRect): LeaderPoints {
  const tcx = tag.x + tag.w / 2;
  const tcy = tag.y + tag.h / 2;
  const ccx = card.x + card.w / 2;
  const ccy = card.y + card.h / 2;
  let x2: number;
  let y2: number;
  if (card.x >= tag.x + tag.w) {
    x2 = card.x;
    y2 = ccy;
  } else if (card.x + card.w <= tag.x) {
    x2 = card.x + card.w;
    y2 = ccy;
  } else if (card.y + card.h <= tag.y) {
    x2 = ccx;
    y2 = card.y + card.h;
  } else {
    x2 = ccx;
    y2 = card.y;
  }
  // start on the tag box edge facing the card end point
  let x1 = tcx;
  let y1 = tcy;
  const dx = x2 - tcx;
  const dy = y2 - tcy;
  if (Math.abs(dx) * tag.h >= Math.abs(dy) * tag.w) {
    x1 = tcx + Math.sign(dx) * (tag.w / 2);
  } else {
    y1 = tcy + Math.sign(dy) * (tag.h / 2);
  }
  return { x1, y1, x2, y2 };
}

/** One inline SVG overlay holding a 1px line and a 4px square dot at the tag end. */
export class Leader {
  private readonly svg: SVGSVGElement;
  private readonly line: SVGLineElement;
  private readonly dot: SVGRectElement;

  constructor(parent: HTMLElement) {
    this.svg = document.createElementNS(NS, "svg");
    this.svg.setAttribute("class", "leader is-hidden");
    this.svg.setAttribute("aria-hidden", "true");
    this.line = document.createElementNS(NS, "line");
    this.dot = document.createElementNS(NS, "rect");
    this.dot.setAttribute("width", "4");
    this.dot.setAttribute("height", "4");
    this.svg.append(this.line, this.dot);
    parent.appendChild(this.svg);
  }

  show(tag: LRect, card: LRect, near: boolean): void {
    this.svg.classList.toggle("near", near);
    this.svg.classList.remove("is-hidden");
    this.update(tag, card);
  }

  update(tag: LRect, card: LRect): void {
    const p = leaderPoints(tag, card);
    this.line.setAttribute("x1", String(p.x1));
    this.line.setAttribute("y1", String(p.y1));
    this.line.setAttribute("x2", String(p.x2));
    this.line.setAttribute("y2", String(p.y2));
    this.dot.setAttribute("x", String(p.x1 - 2));
    this.dot.setAttribute("y", String(p.y1 - 2));
  }

  hide(): void {
    this.svg.classList.add("is-hidden");
  }

  destroy(): void {
    this.svg.remove();
  }
}

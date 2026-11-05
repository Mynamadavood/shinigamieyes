import "../styles/location.css";

export interface StripText {
  source: string;
  label: string;
}

export class LocationStrip {
  readonly pinButton: HTMLButtonElement;
  private src = document.createElement("span");
  private lbl = document.createElement("span");

  constructor(slot: HTMLElement, onPin: () => void) {
    this.src.className = "loc-source";
    this.lbl.className = "loc-label";
    this.pinButton = document.createElement("button");
    this.pinButton.type = "button";
    this.pinButton.className = "pin-btn";
    this.pinButton.textContent = "PIN";
    this.pinButton.setAttribute("aria-label", "Set location");
    this.pinButton.addEventListener("click", onPin);
    slot.replaceChildren(this.src, this.lbl, this.pinButton);
  }

  set(t: StripText): void {
    this.src.textContent = t.source;
    this.lbl.textContent = t.label;
  }
}

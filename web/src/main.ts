import { registerSW } from "virtual:pwa-register";
import "@fontsource/silkscreen/400.css";
import "@fontsource/silkscreen/700.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/700.css";
import "./styles/tokens.css";
import "./styles/app.css";
import { nowMs, setOffset } from "./clock";
import { pad2 } from "./format";
import { selectVisible } from "./model";
import { fetchProfile } from "./net";
import { startTicker } from "./ticker";
import type { Profile } from "./types";
import { NextList } from "./ui/next-list";
import { mountShell } from "./ui/shell";

registerSW({ immediate: true });

const slots = mountShell(document.getElementById("app")!);
const list = new NextList(slots.listHost);
let profile: Profile | null = null;

function renderLocation(p: Profile): void {
  const src = document.createElement("span");
  src.className = "loc-source";
  src.textContent = p.location.source.toUpperCase();
  const lbl = document.createElement("span");
  lbl.className = "loc-label";
  lbl.textContent = p.location.label ?? "";
  slots.locationSlot.replaceChildren(src, lbl);
}

function renderFooter(now: number): void {
  const d = new Date(now);
  slots.footer.textContent = `server ${pad2(d.getHours())}:${pad2(d.getMinutes())} · v0.1.0`;
}

startTicker((now) => {
  list.update(selectVisible(profile, now), now);
  renderFooter(now);
});

fetchProfile(null)
  .then(({ profile: p, offsetMs }) => {
    setOffset(offsetMs);
    profile = p;
    renderLocation(p);
    const now = nowMs();
    list.update(selectVisible(profile, now), now);
  })
  .catch(() => {
    // OFF-GRID handling arrives in 01-08
  });

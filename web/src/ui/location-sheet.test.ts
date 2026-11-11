import { beforeEach, describe, expect, it, vi } from "vitest";
import { stripText } from "../app";
import type { Profile } from "../types";
import { GPS_OFF_COPY, LocationSheet } from "./location-sheet";
import { LocationStrip } from "./location-strip";

const PLACES = [
  { id: "home", label: "Home" },
  { id: "monash", label: "Monash Clayton" },
  { id: "cbd", label: "Melbourne CBD" },
  { id: "gym", label: "Hammers Gym Nunawading" },
];

function setup() {
  document.body.replaceChildren();
  const slot = document.createElement("div");
  const host = document.createElement("div");
  document.body.append(slot, host);
  const onGps = vi.fn();
  const onPlace = vi.fn();
  const onSearch = vi.fn();
  const sheet = new LocationSheet(host, { onGps, onPlace, onSearch });
  sheet.setPlaces(PLACES);
  const strip = new LocationStrip(slot, () => sheet.open());
  return { slot, host, sheet, strip, onGps, onPlace, onSearch };
}

const rows = (host: HTMLElement) =>
  Array.from(host.querySelectorAll<HTMLButtonElement>(".sheet-row"));

describe("LocationStrip", () => {
  beforeEach(() => document.body.replaceChildren());
  it("has an accessible PIN button and renders text via textContent", () => {
    const { strip, slot } = setup();
    expect(strip.pinButton.getAttribute("aria-label")).toBe("Set location");
    expect(strip.pinButton.textContent).toBe("PIN");
    strip.set({ source: "PIN", label: "<b>x</b>" });
    expect(slot.querySelector(".loc-label")!.textContent).toBe("<b>x</b>");
    expect(slot.querySelector("b")).toBeNull();
  });
  it("PIN opens the sheet", () => {
    const { strip, sheet } = setup();
    strip.pinButton.click();
    expect(sheet.isOpen()).toBe(true);
  });
});

describe("LocationSheet", () => {
  it("lists Use GPS then places in server order under SET LOCATION", () => {
    const { host } = setup();
    expect(host.querySelector("#sheet-title")!.textContent).toBe("SET LOCATION");
    expect(rows(host).map((r) => r.firstChild!.textContent)).toEqual([
      "Use GPS",
      ...PLACES.map((p) => p.label),
    ]);
    const d = host.querySelector(".sheet")!;
    expect(d.getAttribute("role")).toBe("dialog");
    expect(d.getAttribute("aria-modal")).toBe("true");
  });
  it("marks the active row with a dot", () => {
    const { host, sheet } = setup();
    sheet.setActive({ mode: "gps", gps: "live" });
    expect(rows(host)[0]!.textContent).toContain("●");
    sheet.setActive({ mode: "pin", gps: "off", pin: { id: "monash", label: "Monash Clayton" } });
    expect(rows(host)[0]!.textContent).not.toContain("●");
    expect(rows(host)[2]!.textContent).toContain("●");
    expect(rows(host).filter((r) => r.textContent!.includes("●"))).toHaveLength(1);
  });
  it("tapping a place calls onPlace and closes", () => {
    const { host, sheet, onPlace } = setup();
    sheet.open();
    rows(host)[2]!.click();
    expect(onPlace).toHaveBeenCalledWith(PLACES[1]);
    expect(sheet.isOpen()).toBe(false);
  });
  it("Use GPS calls onGps", () => {
    const { host, sheet, onGps } = setup();
    sheet.open();
    rows(host)[0]!.click();
    expect(onGps).toHaveBeenCalledTimes(1);
  });
  it("closes on backdrop tap and Escape", () => {
    const { host, sheet } = setup();
    sheet.open();
    host.querySelector<HTMLElement>(".sheet-backdrop")!.click();
    expect(sheet.isOpen()).toBe(false);
    sheet.open();
    rows(host)[0]!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(sheet.isOpen()).toBe(false);
  });
  it("moves focus in on open and back to the PIN button on close", () => {
    const { strip, sheet, host } = setup();
    strip.pinButton.focus();
    strip.pinButton.click();
    expect(host.contains(document.activeElement)).toBe(true);
    sheet.close();
    expect(document.activeElement).toBe(strip.pinButton);
  });
  it("traps Tab inside the sheet", () => {
    const { host, sheet } = setup();
    sheet.open();
    const last = host.querySelector<HTMLInputElement>(".search-input")!;
    last.focus();
    last.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }),
    );
    expect(document.activeElement).toBe(rows(host)[0]);
  });
  it("shows the GPS-denied copy and hosts the search input", () => {
    const { host, sheet } = setup();
    sheet.open(GPS_OFF_COPY);
    expect(host.querySelector(".sheet-message")!.textContent).toBe(
      "Location is off. Pick a place below or enable it in Settings > Privacy > Location Services.",
    );
    expect(sheet.searchHost.querySelector("input")).not.toBeNull();
    sheet.close();
    sheet.open();
    expect((host.querySelector(".sheet-message") as HTMLElement).hidden).toBe(true);
  });
});

describe("stripText", () => {
  const prof = (lat: number, label: string, source: "gps" | "default" = "gps"): Profile => ({
    server_time: 0,
    rev: 1,
    location: { source, lat, lon: 144.9631, label },
    layers: {},
  });
  it("covers each location state", () => {
    expect(stripText({ mode: "gps", gps: "locating" }, null)).toEqual({
      source: "GPS",
      label: "locating...",
    });
    expect(stripText({ mode: "gps", gps: "off" }, null).source).toBe("GPS off");
    expect(
      stripText({ mode: "pin", gps: "off", pin: { id: "monash", label: "Monash Clayton" } }, null),
    ).toEqual({ source: "PIN", label: "Monash Clayton" });
    expect(
      stripText({ mode: "search", gps: "off", search: { lat: 1, lon: 2, label: "Smith St" } }, null),
    ).toEqual({ source: "PIN", label: "Smith St" });
  });
  it("shows the profile label when it matches the fix, else previous location", () => {
    const fix = { lat: -37.8136, lon: 144.9631, ts: 0 };
    const s = { mode: "gps" as const, gps: "live" as const, lastAccepted: fix };
    expect(stripText(s, prof(-37.8136, "near Melbourne CBD")).label).toBe("near Melbourne CBD");
    expect(stripText(s, prof(-37.9, "near X")).label).toBe("previous location");
    expect(stripText(s, prof(-37.8136, "Melbourne CBD", "default")).label).toBe("previous location");
  });
});

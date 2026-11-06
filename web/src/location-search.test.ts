import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { searchAddress, suggestAddress } from "./location-search";
import { LocationSheet, SEARCH_COPY, SUGGEST_DEBOUNCE_MS } from "./ui/location-sheet";

const R = [
  { label: "Smith Street, Collingwood", suburb: "Collingwood", lat: -37.8, lon: 144.99 },
  { label: "Smith Street, Fitzroy", suburb: null, lat: -37.79, lon: 144.98 },
];

const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
const flush = () => new Promise((r) => setTimeout(r, 0));

describe("searchAddress", () => {
  afterEach(() => vi.useRealTimers());
  it("GETs the encoded same-origin url and returns results", async () => {
    const f = vi.fn().mockResolvedValue(ok(R));
    expect(await searchAddress("smith st collingwood", f)).toEqual(R);
    expect(f.mock.calls[0]![0]).toBe("/api/geocode?q=smith%20st%20collingwood");
  });
  it("rejects on non-200", async () => {
    const f = vi.fn().mockResolvedValue(new Response("x", { status: 502 }));
    await expect(searchAddress("abc", f)).rejects.toThrow();
  });
  it("aborts after 9000 ms", async () => {
    vi.useFakeTimers();
    const f = vi.fn(
      (_u: string, init?: RequestInit) =>
        new Promise<Response>((_, rej) =>
          init!.signal!.addEventListener("abort", () => rej(new Error("aborted"))),
        ),
    );
    const p = searchAddress("abc", f as unknown as typeof fetch);
    const assertion = expect(p).rejects.toThrow("aborted");
    await vi.advanceTimersByTimeAsync(8999);
    expect(f.mock.calls[0]![1]!.signal!.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(2);
    await assertion;
  });
});

describe("sheet address search", () => {
  let onSearch: ReturnType<typeof vi.fn<(r: { lat: number; lon: number; label: string }) => void>>;
  let host: HTMLElement;
  let fetchMock: ReturnType<typeof vi.fn>;
  let sheet: LocationSheet;
  const input = () => host.querySelector<HTMLInputElement>(".search-input")!;
  const enter = () =>
    input().dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));

  beforeEach(() => {
    document.body.replaceChildren();
    host = document.createElement("div");
    document.body.append(host);
    onSearch = vi.fn<(r: { lat: number; lon: number; label: string }) => void>();
    sheet = new LocationSheet(host, { onGps: vi.fn(), onPlace: vi.fn(), onSearch });
    fetchMock = vi.fn().mockResolvedValue(ok(R));
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("input has the spec attributes", () => {
    const i = input();
    expect(i.placeholder).toBe("Search address");
    expect(i.type).toBe("search");
    expect(i.autocomplete).toBe("off");
    expect(i.getAttribute("enterkeyhint")).toBe("search");
  });
  it("Enter with 3+ chars runs one full (Nominatim) search", async () => {
    input().value = "smi";
    enter();
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]![0]).toBe("/api/geocode?q=smi");
  });
  it("Enter with fewer than 3 chars does nothing", async () => {
    input().value = " ab ";
    enter();
    await flush();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("second Enter within 400 ms is ignored", async () => {
    input().value = "smith st";
    enter();
    enter();
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("shows Searching... while waiting", () => {
    fetchMock.mockReturnValue(new Promise(() => {}));
    input().value = "smith st";
    enter();
    expect(host.querySelector(".search-note")!.textContent).toBe(SEARCH_COPY.searching);
  });
  it("renders rows with label and suburb", async () => {
    input().value = "smith st";
    enter();
    await flush();
    const rows = host.querySelectorAll(".search-row");
    expect(rows.length).toBe(2);
    expect(rows[0]!.textContent).toContain("Smith Street, Collingwood");
    expect(rows[0]!.querySelector(".search-suburb")!.textContent).toBe("Collingwood");
    expect(rows[1]!.querySelector(".search-suburb")).toBeNull();
  });
  it("empty result shows the no-match copy", async () => {
    fetchMock.mockResolvedValue(ok([]));
    input().value = "zzzz";
    enter();
    await flush();
    expect(host.querySelector(".search-note")!.textContent).toBe(
      "No match. Try a street and suburb.",
    );
  });
  it("failure shows the error copy", async () => {
    fetchMock.mockResolvedValue(new Response("x", { status: 502 }));
    input().value = "smith st";
    enter();
    await flush();
    expect(host.querySelector(".search-note")!.textContent).toBe(
      "Search failed. Check your connection and try again.",
    );
  });
  it("tapping a result calls onSearch and closes the sheet", async () => {
    sheet.open();
    input().value = "smith st";
    enter();
    await flush();
    host.querySelector<HTMLButtonElement>(".search-row")!.click();
    expect(onSearch).toHaveBeenCalledWith({
      lat: -37.8,
      lon: 144.99,
      label: "Smith Street, Collingwood",
    });
    expect(sheet.isOpen()).toBe(false);
  });
  it("renders labels as text, not markup", async () => {
    fetchMock.mockResolvedValue(ok([{ label: "<b>x</b>", suburb: null, lat: 1, lon: 2 }]));
    input().value = "smith st";
    enter();
    await flush();
    expect(host.querySelector(".search-row b")).toBeNull();
  });
});

describe("suggestAddress", () => {
  it("GETs /api/suggest with the encoded query", async () => {
    const f = vi.fn().mockResolvedValue(ok(R));
    expect(await suggestAddress("lygon st", undefined, f)).toEqual(R);
    expect(f.mock.calls[0]![0]).toBe("/api/suggest?q=lygon%20st");
  });
  it("an outer abort cancels the request", async () => {
    const outer = new AbortController();
    const f = vi.fn(
      (_u: string, init?: RequestInit) =>
        new Promise<Response>((_, rej) =>
          init!.signal!.addEventListener("abort", () => rej(new Error("aborted"))),
        ),
    );
    const p = suggestAddress("lygon", outer.signal, f as unknown as typeof fetch);
    outer.abort();
    await expect(p).rejects.toThrow("aborted");
  });
});

describe("sheet type-ahead", () => {
  let host: HTMLElement;
  let fetchMock: ReturnType<typeof vi.fn>;
  let onSearch: ReturnType<typeof vi.fn<(r: { lat: number; lon: number; label: string }) => void>>;
  let sheet: LocationSheet;
  const input = () => host.querySelector<HTMLInputElement>(".search-input")!;
  const type = (v: string) => {
    input().value = v;
    input().dispatchEvent(new Event("input", { bubbles: true }));
  };
  const urls = () => fetchMock.mock.calls.map((c) => c[0] as string);

  beforeEach(() => {
    vi.useFakeTimers();
    document.body.replaceChildren();
    host = document.createElement("div");
    document.body.append(host);
    onSearch = vi.fn<(r: { lat: number; lon: number; label: string }) => void>();
    sheet = new LocationSheet(host, { onGps: vi.fn(), onPlace: vi.fn(), onSearch });
    fetchMock = vi.fn().mockResolvedValue(ok(R));
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("debounces: one suggest call for the last value after the pause", async () => {
    type("smi");
    type("smit");
    type("smith st");
    await vi.advanceTimersByTimeAsync(SUGGEST_DEBOUNCE_MS - 1);
    expect(fetchMock).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(urls()).toEqual(["/api/suggest?q=smith%20st"]);
  });
  it("renders suggestions as tappable rows that select and close", async () => {
    sheet.open();
    type("smith st");
    await vi.advanceTimersByTimeAsync(SUGGEST_DEBOUNCE_MS);
    const rows = host.querySelectorAll<HTMLButtonElement>(".search-row");
    expect(rows.length).toBe(2);
    rows[0]!.click();
    expect(onSearch).toHaveBeenCalledWith({ lat: -37.8, lon: 144.99, label: "Smith Street, Collingwood" });
    expect(sheet.isOpen()).toBe(false);
  });
  it("under 3 characters: no request and results cleared", async () => {
    type("smith st");
    await vi.advanceTimersByTimeAsync(SUGGEST_DEBOUNCE_MS);
    type("sm");
    await vi.advanceTimersByTimeAsync(SUGGEST_DEBOUNCE_MS);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(host.querySelector(".search-results")!.children.length).toBe(0);
  });
  it("a stale slow response never overwrites a newer one", async () => {
    let releaseOld!: (r: Response) => void;
    fetchMock
      .mockImplementationOnce(() => new Promise<Response>((res) => (releaseOld = res)))
      .mockResolvedValueOnce(ok([R[1]]));
    type("smith");
    await vi.advanceTimersByTimeAsync(SUGGEST_DEBOUNCE_MS);
    type("smith st fitzroy");
    await vi.advanceTimersByTimeAsync(SUGGEST_DEBOUNCE_MS);
    releaseOld(ok(R));
    await vi.advanceTimersByTimeAsync(0);
    const rows = host.querySelectorAll(".search-row");
    expect(rows.length).toBe(1);
    expect(rows[0]!.textContent).toContain("Fitzroy");
  });
  it("Enter cancels a pending suggestion and runs the full search", async () => {
    type("smith st");
    input().dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await vi.advanceTimersByTimeAsync(SUGGEST_DEBOUNCE_MS * 2);
    expect(urls()).toEqual(["/api/geocode?q=smith%20st"]);
  });
  it("suggest failure with nothing on screen shows the error copy", async () => {
    fetchMock.mockResolvedValue(new Response("x", { status: 502 }));
    type("smith st");
    await vi.advanceTimersByTimeAsync(SUGGEST_DEBOUNCE_MS);
    expect(host.querySelector(".search-note")!.textContent).toBe(SEARCH_COPY.error);
  });
});

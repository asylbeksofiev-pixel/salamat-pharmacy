import { afterEach, describe, expect, it, vi } from "vitest";

async function load(env: Record<string, string>) {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) process.env[k] = v;
  return import("@/server/geocode");
}

function respond(body: unknown, status = 200) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
}

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.TWOGIS_API_KEY;
  delete process.env.GEOCODER;
});

describe("address geocoding for the nearest pharmacy", () => {
  it("uses OpenStreetMap Nominatim without a key, inside the Astana area only", async () => {
    const fetchMock = respond([{ lat: "51.1656", lon: "71.4330", display_name: "40, улица Кенесары, Астана" }]);
    vi.stubGlobal("fetch", fetchMock);
    const { geocodeAddress, geocoderProvider } = await load({ TWOGIS_API_KEY: "", GEOCODER: "" });
    expect(geocoderProvider()).toBe("nominatim");
    const point = await geocodeAddress("Кенесары 40", "ru");
    expect(point).toMatchObject({ lat: 51.1656, lng: 71.433 });
    const url = String((fetchMock.mock.calls[0] as unknown[])[0]);
    expect(url).toContain("nominatim.openstreetmap.org");
    expect(url).toContain("bounded=1");
    expect(url).toContain("countrycodes=kz");
  });

  it("ignores results outside Astana and its suburbs (no false 'nearest')", async () => {
    vi.stubGlobal("fetch", respond([{ lat: "43.238", lon: "76.889", display_name: "Almaty" }]));
    const { geocodeAddress } = await load({ TWOGIS_API_KEY: "", GEOCODER: "" });
    expect(await geocodeAddress("Абая 10 Алматы", "ru")).toBeNull();
  });

  it("uses 2GIS when the server key is set; the key goes only into the server request", async () => {
    const fetchMock = respond({ meta: { code: 200 }, result: { items: [{ point: { lat: 51.09, lon: 71.42 }, full_name: "Астана, Мәңгілік Ел, 59" }] } });
    vi.stubGlobal("fetch", fetchMock);
    const { geocodeAddress, geocoderProvider } = await load({ TWOGIS_API_KEY: "test-key-123", GEOCODER: "" });
    expect(geocoderProvider()).toBe("2gis");
    const point = await geocodeAddress("Мангилик Ел 59", "kk");
    expect(point?.label).toBe("Астана, Мәңгілік Ел, 59");
    expect(JSON.stringify(point)).not.toContain("test-key-123");
    expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toContain("catalog.api.2gis.com");
  });

  it("reports the service as unavailable on errors and when switched off", async () => {
    vi.stubGlobal("fetch", respond({ error: "x" }, 503));
    let mod = await load({ TWOGIS_API_KEY: "", GEOCODER: "" });
    await expect(mod.geocodeAddress("Сарайшык 7", "ru")).rejects.toBeInstanceOf(mod.GeocoderUnavailableError);
    mod = await load({ TWOGIS_API_KEY: "", GEOCODER: "off" });
    await expect(mod.geocodeAddress("Сарайшык 7", "ru")).rejects.toBeInstanceOf(mod.GeocoderUnavailableError);
  });
});

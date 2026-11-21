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
  delete process.env.YANDEX_GEOCODER_API_KEY;
  delete process.env.YANDEX_SUGGEST_API_KEY;
  delete process.env.GEOCODER;
});

describe("address geocoding for the nearest pharmacy", () => {
  it("returns several different places for the visitor to choose; near-duplicates are merged", async () => {
    vi.stubGlobal(
      "fetch",
      respond([
        { lat: "51.1656", lon: "71.4330", display_name: "40, улица Кенесары, Астана" },
        { lat: "51.1657", lon: "71.4331", display_name: "Кенесары 40, подъезд 2, Астана" },
        { lat: "51.0900", lon: "71.4200", display_name: "40, улица Кенесары, Косшы" },
        { lat: "43.2380", lon: "76.8890", display_name: "Кенесары 40, Алматы" },
      ]),
    );
    const { geocodeCandidates } = await load({ YANDEX_GEOCODER_API_KEY: "", YANDEX_SUGGEST_API_KEY: "", GEOCODER: "" });
    const list = await geocodeCandidates("Кенесары 40 (несколько)", "ru");
    expect(list.map((p) => p.label)).toEqual(["40, улица Кенесары, Астана", "40, улица Кенесары, Косшы"]);
  });

  it("uses OpenStreetMap Nominatim without a key, inside the Astana area only", async () => {
    const fetchMock = respond([{ lat: "51.1656", lon: "71.4330", display_name: "40, улица Кенесары, Астана" }]);
    vi.stubGlobal("fetch", fetchMock);
    const { geocodeAddress, geocoderProvider } = await load({ YANDEX_GEOCODER_API_KEY: "", YANDEX_SUGGEST_API_KEY: "", GEOCODER: "" });
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
    const { geocodeAddress } = await load({ YANDEX_GEOCODER_API_KEY: "", YANDEX_SUGGEST_API_KEY: "", GEOCODER: "" });
    expect(await geocodeAddress("Абая 10 Алматы", "ru")).toBeNull();
  });

  it("uses the Yandex HTTP Geocoder when the server key is set; the key goes only into the server request", async () => {
    const fetchMock = respond({
      response: { GeoObjectCollection: { featureMember: [{ GeoObject: { Point: { pos: "71.42 51.09" }, metaDataProperty: { GeocoderMetaData: { kind: "house", text: "Казахстан, Астана, проспект Мангилик Ел, 59" } } } }] } },
    });
    vi.stubGlobal("fetch", fetchMock);
    const { geocodeAddress, geocoderProvider } = await load({ YANDEX_GEOCODER_API_KEY: "test-key-123", GEOCODER: "" });
    expect(geocoderProvider()).toBe("yandex");
    const point = await geocodeAddress("Мангилик Ел 59", "kk");
    expect(point).toEqual({ lat: 51.09, lng: 71.42, label: "Астана, проспект Мангилик Ел, 59" });
    expect(JSON.stringify(point)).not.toContain("test-key-123");
    const url = String((fetchMock.mock.calls[0] as unknown[])[0]);
    expect(url).toContain("geocode-maps.yandex.ru/v1/");
    expect(url).toContain("lang=kk_KZ");
    expect(url).toContain("rspn=1");
  });

  it("Yandex: a city-level match is not an address (no false 'nearest'), a picked suggestion is resolved by URI", async () => {
    vi.stubGlobal("fetch", respond({ response: { GeoObjectCollection: { featureMember: [{ GeoObject: { Point: { pos: "71.43 51.13" }, metaDataProperty: { GeocoderMetaData: { kind: "locality", text: "Казахстан, Астана" } } } }] } } }));
    let mod = await load({ YANDEX_GEOCODER_API_KEY: "k", GEOCODER: "" });
    expect(await mod.geocodeAddress("Астана", "ru")).toBeNull();
    const fetchMock = respond({ response: { GeoObjectCollection: { featureMember: [{ GeoObject: { Point: { pos: "71.433 51.1656" }, metaDataProperty: { GeocoderMetaData: { kind: "house", text: "Казахстан, Астана, улица Кенесары, 40" } } } }] } } });
    vi.stubGlobal("fetch", fetchMock);
    mod = await load({ YANDEX_GEOCODER_API_KEY: "k", GEOCODER: "" });
    const point = await mod.geocodeAddress("Астана, улица Кенесары, 40", "ru", "ymapsbm1://geo?data=abc");
    expect(point).toMatchObject({ lat: 51.1656, lng: 71.433 });
    const url = String((fetchMock.mock.calls[0] as unknown[])[0]);
    expect(url).toContain("uri=ymapsbm1");
    expect(url).not.toContain("geocode=");
  });

  it("reports the service as unavailable on errors and when switched off", async () => {
    vi.stubGlobal("fetch", respond({ error: "x" }, 503));
    let mod = await load({ YANDEX_GEOCODER_API_KEY: "", YANDEX_SUGGEST_API_KEY: "", GEOCODER: "" });
    await expect(mod.geocodeAddress("Сарайшык 7", "ru")).rejects.toBeInstanceOf(mod.GeocoderUnavailableError);
    mod = await load({ YANDEX_GEOCODER_API_KEY: "", GEOCODER: "off" });
    await expect(mod.geocodeAddress("Сарайшык 7", "ru")).rejects.toBeInstanceOf(mod.GeocoderUnavailableError);
  });

  it("offers address suggestions only with a Yandex Geosuggest key (Nominatim forbids autocomplete)", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const mod = await load({ YANDEX_GEOCODER_API_KEY: "", YANDEX_SUGGEST_API_KEY: "", GEOCODER: "" });
    expect(mod.suggestionsAvailable()).toBe(false);
    await expect(mod.suggestAddresses("Кенесары", "ru")).rejects.toBeInstanceOf(mod.GeocoderUnavailableError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("Yandex Geosuggest: Astana only, addresses with URI, duplicates dropped, key stays on the server", async () => {
    const fetchMock = respond({
      results: [
        { title: { text: "улица Кенесары, 40" }, subtitle: { text: "Астана" }, address: { formatted_address: "Казахстан, Астана, улица Кенесары, 40" }, uri: "ymapsbm1://geo?data=1" },
        { title: { text: "улица Кенесары, 40" }, address: { formatted_address: "Казахстан, Астана, улица Кенесары, 40" }, uri: "ymapsbm1://geo?data=1" },
        { title: { text: "улица Кенесары, 42" }, subtitle: { text: "Астана" } },
      ],
    });
    vi.stubGlobal("fetch", fetchMock);
    const { suggestAddresses, suggestionsAvailable } = await load({ YANDEX_SUGGEST_API_KEY: "test-key-123", GEOCODER: "" });
    expect(suggestionsAvailable()).toBe(true);
    const items = await suggestAddresses("Кенесары 4", "ru");
    expect(items).toEqual([
      { label: "Астана, улица Кенесары, 40", point: null, uri: "ymapsbm1://geo?data=1" },
      { label: "улица Кенесары, 42, Астана", point: null, uri: null },
    ]);
    expect(JSON.stringify(items)).not.toContain("test-key-123");
    const url = String((fetchMock.mock.calls[0] as unknown[])[0]);
    expect(url).toContain("suggest-maps.yandex.ru/v1/suggest");
    expect(url).toContain("strict_bounds=1");
    expect(url).toContain("types=house%2Cstreet");
  });
});

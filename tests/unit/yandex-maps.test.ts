import { describe, expect, it } from "vitest";
import { yandexMapWidgetUrl, yandexRouteUrl, yandexSearchUrl } from "@/lib/yandex-maps";

const a = { lat: 51.0920359, lng: 71.4265061 };
const b = { lat: 51.1542051, lng: 71.4852862 };

describe("Yandex Maps links", () => {
  it("widget: one marker per pharmacy (lon,lat), frames all of them, in the page language", () => {
    const url = new URL(yandexMapWidgetUrl([a, b], "kk"));
    expect(url.origin + url.pathname).toBe("https://yandex.kz/map-widget/v1/");
    expect(url.searchParams.get("pt")).toBe("71.426506,51.092036,pm2gnm~71.485286,51.154205,pm2gnm");
    expect(url.searchParams.get("lang")).toBe("kk_KZ");
    const [sw, ne] = url.searchParams.get("bbox")!.split("~").map((p) => p.split(",").map(Number));
    expect(sw[0]).toBeLessThan(a.lng);
    expect(ne[1]).toBeGreaterThan(b.lat);
  });

  it("widget: centred on a pharmacy when focused; full map page on request", () => {
    const url = new URL(yandexMapWidgetUrl([a, b], "ru", b));
    expect(url.searchParams.get("ll")).toBe("71.485286,51.154205");
    expect(url.searchParams.get("z")).toBe("16");
    expect(url.searchParams.has("bbox")).toBe(false);
    expect(yandexMapWidgetUrl([a], "en", null, true)).toMatch(/^https:\/\/yandex\.kz\/maps\/\?/);
  });

  it("route: lat,lon order, from a point or from 'my location'", () => {
    expect(yandexRouteUrl(b)).toBe("https://yandex.kz/maps/?rtext=~51.154205,71.485286&rtt=auto");
    expect(yandexRouteUrl(b, a)).toBe("https://yandex.kz/maps/?rtext=51.092036,71.426506~51.154205,71.485286&rtt=auto");
    expect(yandexSearchUrl("Астана, Сауран 5")).toContain("text=%D0%90");
  });
});

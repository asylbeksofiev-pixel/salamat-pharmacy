import { describe, expect, it } from "vitest";
import { canTransition } from "@/lib/order-status";
import { normalizeKzPhone, maskPhone } from "@/lib/phone";
import { formatKzt, formatPhone } from "@/lib/format";
import { openStatus, parseOpeningHours } from "@/lib/hours";
import { catalogQuery, parseCatalogParams } from "@/lib/params";
import { localizedPath, splitLocale } from "@/lib/i18n/config";

describe("order statuses", () => {
  it("allows only the documented transitions", () => {
    expect(canTransition("NEW", "PROCESSING")).toBe(true);
    expect(canTransition("NEW", "COMPLETED")).toBe(false);
    expect(canTransition("CONFIRMED", "READY")).toBe(true);
    expect(canTransition("COMPLETED", "CANCELLED")).toBe(false);
    expect(canTransition("CANCELLED", "NEW")).toBe(false);
  });
});

describe("phones", () => {
  it("normalises Kazakhstan numbers", () => {
    expect(normalizeKzPhone("8 701 672 76 27")).toBe("+77016727627");
    expect(normalizeKzPhone("+7 (701) 672-76-27")).toBe("+77016727627");
    expect(normalizeKzPhone("7016727627")).toBe("+77016727627");
    expect(normalizeKzPhone("+1 202 555 0100")).toBeNull();
    expect(normalizeKzPhone("12345")).toBeNull();
  });
  it("formats and masks", () => {
    expect(formatPhone("+77016727627")).toBe("8 (701) 672 76 27");
    expect(maskPhone("+77016727627")).toBe("+7 701 *** ** 27");
  });
});

describe("money", () => {
  it("formats tenge with grouping", () => {
    expect(formatKzt(12500).replace(/ /g, " ")).toBe("12 500 ₸");
  });
});

describe("opening hours", () => {
  const hours = parseOpeningHours({ mon: ["09:00-21:00"], tue: ["09:00-21:00"], wed: ["09:00-21:00"], thu: ["09:00-21:00"], fri: ["09:00-21:00"], sat: ["10:00-18:00"], sun: [] });
  it("returns null for unknown schedules (no Open/Closed badge)", () => {
    expect(openStatus(null)).toBeNull();
    expect(parseOpeningHours({ mon: ["9-21"] })).toBeNull();
  });
  it("computes open/closed in Astana time", () => {
    // Monday 2026-11-16 12:00 Astana = 07:00 UTC
    expect(openStatus(hours, new Date("2026-11-16T07:00:00Z"))).toEqual({ open: true, closesAt: "21:00" });
    // Sunday 2026-11-15 12:00 Astana: closed, opens Monday 09:00
    expect(openStatus(hours, new Date("2026-11-15T07:00:00Z"))).toEqual({ open: false, opensAt: "09:00" });
  });
});

describe("catalog URL parameters", () => {
  it("round-trips filters so links can be shared", () => {
    const f = parseCatalogParams({ brand: ["demo-farma", "primer-lab"], form: "таблетки", stock: "1", sort: "price_asc", page: "2", pmin: "100" });
    expect(f.brands).toEqual(["demo-farma", "primer-lab"]);
    expect(f.inStock).toBe(true);
    const q = catalogQuery(f);
    const usp = new URLSearchParams(q.slice(1));
    const sp: Record<string, string | string[]> = {};
    for (const k of new Set(usp.keys())) {
      const all = usp.getAll(k);
      sp[k] = all.length > 1 ? all : all[0];
    }
    expect(parseCatalogParams(sp)).toMatchObject({ brands: f.brands, forms: f.forms, sort: "price_asc", page: 2, priceMin: 100, inStock: true });
  });
  it("ignores malformed values", () => {
    const f = parseCatalogParams({ sort: "rating", page: "-1", pmin: "abc", rx: "maybe" });
    expect(f.sort).toBeUndefined();
    expect(f.page).toBe(1);
    expect(f.priceMin).toBeUndefined();
    expect(f.rx).toBeUndefined();
  });
});

describe("locale paths", () => {
  it("keeps Russian unprefixed and Kazakh under /kk", () => {
    expect(localizedPath("ru", "/catalog")).toBe("/catalog");
    expect(localizedPath("kk", "/catalog")).toBe("/kk/catalog");
    expect(localizedPath("kk", "/")).toBe("/kk");
    expect(splitLocale("/kk/product/x")).toEqual({ locale: "kk", path: "/product/x" });
    expect(splitLocale("/catalog")).toEqual({ locale: "ru", path: "/catalog" });
  });
});

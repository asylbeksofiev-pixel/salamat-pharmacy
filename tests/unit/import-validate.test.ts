import { describe, expect, it } from "vitest";
import { parseDate, parseKzt, validateRecords } from "@/server/import/validate";
import { parseCsv } from "@/server/import/parse";

const codes = new Set(["SAL-01", "SAL-02"]);
const row = (o: Record<string, string>) => ({ external_id: "X1", product_name: "Тест", full_variant_name: "Тест 10 мг №10 табл.", pharmacy_code: "SAL-01", price_kzt: "100", stock_quantity: "5", updated_at: "2026-11-14T09:00:00+05:00", ...o });
const now = new Date("2026-11-14T12:00:00Z");

describe("import validation", () => {
  it("reports missing required columns", () => {
    const r = validateRecords([{ name: "x" }], { knownPharmacyCodes: codes, now });
    expect(r.missingColumns).toContain("product_name");
    expect(r.missingColumns.join()).toContain("external_id");
  });
  it("accepts a valid row", () => {
    const r = validateRecords([row({})], { knownPharmacyCodes: codes, now });
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].priceKzt).toBe(100);
    expect(r.issues.filter((i) => i.severity === "ERROR")).toHaveLength(0);
  });
  it("rejects invalid prices, unknown pharmacies, empty names and rows without identifiers", () => {
    const r = validateRecords(
      [row({ price_kzt: "-5" }), row({ external_id: "X2", pharmacy_code: "SAL-99" }), row({ external_id: "X3", product_name: "" }), row({ external_id: "", salamat_sku: "", barcode: "" })],
      { knownPharmacyCodes: codes, now },
    );
    const codesFound = r.issues.map((i) => i.code);
    expect(codesFound).toEqual(expect.arrayContaining(["INVALID_PRICE", "UNKNOWN_PHARMACY", "EMPTY_REQUIRED", "NO_IDENTIFIER"]));
    expect(r.rows).toHaveLength(0);
    expect(r.rejected.size).toBe(4);
  });
  it("detects duplicates of the same SKU and pharmacy", () => {
    const r = validateRecords([row({}), row({ price_kzt: "110" }), row({ pharmacy_code: "SAL-02" })], { knownPharmacyCodes: codes, now });
    expect(r.issues.find((i) => i.code === "DUPLICATE_ROW")?.rowNumber).toBe(3);
    expect(r.rows).toHaveLength(2);
  });
  it("requires a pharmacy for prices and rejects future dates", () => {
    const r = validateRecords([row({ pharmacy_code: "" }), row({ external_id: "X9", updated_at: "2027-01-01" })], { knownPharmacyCodes: codes, now });
    expect(r.issues.map((i) => i.code)).toEqual(expect.arrayContaining(["PHARMACY_REQUIRED", "FUTURE_DATE"]));
  });
  it("parses prices and dates in common formats", () => {
    expect(parseKzt("1 250")).toBe(1250);
    expect(parseKzt("1250,00")).toBe(1250);
    expect(parseKzt("12.5")).toBe("invalid");
    expect(parseKzt("0")).toBe("invalid");
    expect(parseDate("14.11.2026 09:00")).toBe("2026-11-14T04:00:00.000Z");
    expect(parseDate("вчера")).toBe("invalid");
  });
  it("warns but keeps rows with unrecognised prescription values", () => {
    const r = validateRecords([row({ prescription_status: "возможно" })], { knownPharmacyCodes: codes, now });
    expect(r.rows[0].prescriptionStatus).toBe("UNKNOWN");
    expect(r.issues[0].severity).toBe("WARNING");
  });
});

describe("CSV parsing", () => {
  it("detects ';' delimiter and Windows-1251 encoding", () => {
    const text = "external_id;product_name;full_variant_name\nA1;Аспирин;Аспирин 500 мг №10 табл.\n";
    const cp1251 = Buffer.from(new Uint8Array([...text].map((ch) => {
      const c = ch.charCodeAt(0);
      if (c >= 0x410 && c <= 0x44f) return c - 0x410 + 0xc0;
      if (c === 0x2116) return 0xb9; // №
      return c;
    })));
    const parsed = parseCsv(cp1251);
    expect(parsed.headers).toEqual(["external_id", "product_name", "full_variant_name"]);
    expect(parsed.records[0].product_name).toBe("Аспирин");
    expect(parsed.records[0].full_variant_name).toBe("Аспирин 500 мг №10 табл.");
  });
});

import { describe, expect, it } from "vitest";
import { classifyArticle, gs1CheckDigit, gtinVariants, isValidGtin, sameGtin } from "@/lib/catalog-photos/barcode";
import { compareAttributes, parseAttributes } from "@/lib/catalog-photos/attributes";
import { conflictingDuplicates, decide, type Candidate } from "@/lib/catalog-photos/match";
import { catalogPhotoSources } from "@/components/catalog/ProductImage";

const off = (over: Partial<Candidate> = {}): Candidate => ({
  rights: { source: "off", sourceName: "Open Food Facts", license: "CC BY-SA 3.0", attribution: "Open Food Facts contributors", reuseAllowed: true },
  sourcePage: "https://world.openfoodfacts.org/product/4660014182244",
  imageUrl: "https://images.openfoodfacts.org/images/products/466/001/418/2244/front_ru.3.full.jpg",
  barcode: "4660014182244",
  name: "АлфаВИТ Классик таблетки",
  manufacturer: "Аквион",
  details: "60 шт",
  ...over,
});
const goodImage = { ok: true, errors: [], warnings: [], width: 1200, height: 1200, sha256: "x" };
const product = { id: "2068", article: "4660014182244", name: "АлфаВИТ Классик таблетки № 60" };

describe("article / barcode checks", () => {
  it("validates GS1 check digits", () => {
    expect(gs1CheckDigit("466001418224")).toBe(4);
    expect(isValidGtin("4660014182244")).toBe(true);
    expect(isValidGtin("4660014182245")).toBe(false);
    expect(isValidGtin("733739038784")).toBe(true); // UPC-A
    expect(isValidGtin("42420699")).toBe(true); // EAN-8
  });

  it("classifies real article formats from pharmacy_products", () => {
    expect(classifyArticle(" 4660014182244 ")).toEqual({ kind: "gtin", gtin14: "04660014182244", raw: "4660014182244" });
    expect(classifyArticle("733739038784").kind).toBe("gtin");
    expect(classifyArticle("2000994074481").kind).toBe("instore"); // shop's own code, not unique worldwide
    expect(classifyArticle("733339032287").kind).toBe("bad_check_digit");
    expect(classifyArticle("Комплектующая для №100").kind).toBe("not_numeric");
    expect(classifyArticle("12345").kind).toBe("wrong_length");
    expect(classifyArticle(null).kind).toBe("empty");
  });

  it("compares GTINs regardless of zero padding", () => {
    expect(sameGtin("0733739038784", "733739038784")).toBe(true);
    expect(sameGtin("4660014182244", "04660014182244")).toBe(true);
    expect(sameGtin("4660014182244", "4660014182053")).toBe(false);
    expect(gtinVariants("00733739038784")).toEqual(expect.arrayContaining(["0733739038784", "733739038784"]));
  });
});

describe("package characteristics", () => {
  it("parses strength, form, content and pack size", () => {
    expect(parseAttributes("Парацетамол 500 мг №20 табл.")).toEqual({ dosages: ["500mg"], forms: ["tablet"], contents: [], counts: [20] });
    expect(parseAttributes("Алцеф порошок для приготовления суспензии 125мг/5мл 60 мл")).toMatchObject({ dosages: ["125mg/5ml"], contents: ["60ml"] });
    expect(parseAttributes("NOW. Alpha Lipoic Acid 100 mg 60 vcaps")).toEqual({ dosages: ["100mg"], forms: ["capsule"], contents: [], counts: [60] });
    expect(parseAttributes("Ессентуки-4 1,5 л").contents).toEqual(["1500ml"]);
    expect(parseAttributes("Витамин D3 2000 МЕ капли 10 мл")).toMatchObject({ dosages: ["2000iu"], forms: ["drops"], contents: ["10ml"] });
    // Dimensions are not pack sizes.
    expect(parseAttributes("Бинт стерильный 7 м × 14 см").counts).toEqual([]);
  });

  it("flags a different pack, strength or form", () => {
    const mine = parseAttributes("NOW. Alpha Lipoic Acid 100 mg 60 vcaps");
    expect(compareAttributes(mine, parseAttributes("NOW Alpha Lipoic Acid 100 мг капсулы 120 шт")).mismatches).toEqual([{ key: "count", product: "60", candidate: "120" }]);
    expect(compareAttributes(parseAttributes("Альбезол 400 мг"), parseAttributes("Альбезол 200 мг")).status).toBe("mismatch");
    expect(compareAttributes(parseAttributes("Парацетамол таблетки"), parseAttributes("Парацетамол сироп")).status).toBe("mismatch");
    expect(compareAttributes(parseAttributes("7 Jelly Teeth 35 гр"), parseAttributes("Jelibon 25g")).status).toBe("mismatch");
  });

  it("treats missing characteristics on the candidate as unverified, not as a match", () => {
    const res = compareAttributes(parseAttributes("NOW. Alpha Lipoic Acid 100 mg 120 vcaps"), parseAttributes("Alpha lipoic acid"));
    expect(res.status).toBe("insufficient");
    expect(res.unverified).toEqual(["dosage", "form", "count"]);
  });
});

describe("match decision", () => {
  it("approves only an exact barcode with confirmed characteristics, reusable rights and a good image", () => {
    const d = decide({ product, candidate: off(), image: goodImage });
    expect(d.reviewStatus).toBe("approved");
    expect(d.matchMethod).toBe("barcode_exact");
    expect(d.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it("sends uncertain matches to review", () => {
    expect(decide({ product, candidate: off({ details: null }), image: goodImage }).reasons).toContain("unverified_count");
    expect(decide({ product, candidate: off({ details: "30 шт" }), image: goodImage }).reviewStatus).toBe("needs_review");
    expect(decide({ product, candidate: off({ barcode: "4660014182053" }), image: goodImage }).reasons).toContain("barcode_not_confirmed");
    expect(decide({ product, candidate: off(), image: { ...goodImage, warnings: ["low_resolution:400x380"] } }).reviewStatus).toBe("needs_review");
    expect(decide({ product, candidate: off(), image: goodImage, conflictingDuplicates: 1 }).reviewStatus).toBe("needs_review");
    expect(decide({ product, candidate: off(), image: goodImage, sharedImageConflict: true }).reviewStatus).toBe("needs_review");
  });

  it("never auto-approves without reuse rights (NCT without permission)", () => {
    const nct = off({ rights: { source: "nct", sourceName: "НКТ", license: "Не предоставлено", attribution: null, reuseAllowed: false } });
    const d = decide({ product, candidate: nct, image: null });
    expect(d.reviewStatus).toBe("needs_review");
    expect(d.reasons).toContain("reuse_rights_not_confirmed");
  });

  it("never searches by barcode for in-store or broken articles", () => {
    const d = decide({ product: { ...product, article: "2000994074481" }, candidate: off({ barcode: "2000994074481" }), image: goodImage });
    expect(d.matchMethod).toBe("name_search");
    expect(d.reviewStatus).toBe("needs_review");
  });

  it("marks products without candidates as missing", () => {
    expect(decide({ product, candidate: null, image: null })).toMatchObject({ reviewStatus: "missing", matchMethod: "none" });
  });

  it("rejects an unusable file found by exact barcode", () => {
    expect(decide({ product, candidate: off(), image: { ok: false, errors: ["blank"], warnings: [] } }).reviewStatus).toBe("rejected");
  });

  it("accepts a photo SALAMAT assigned to the product id unless it contradicts the name", () => {
    const own = off({ rights: { source: "salamat", sourceName: "SALAMAT", license: "Собственная съёмка SALAMAT", attribution: null, reuseAllowed: true }, barcode: null, name: null, details: null, assignedToProduct: true });
    expect(decide({ product, candidate: own, image: goodImage })).toMatchObject({ reviewStatus: "approved", matchMethod: "assigned_by_salamat" });
    expect(decide({ product, candidate: { ...own, name: "АлфаВИТ Классик №30" }, image: goodImage }).reviewStatus).toBe("needs_review");
  });

  it("detects equal articles on products with different characteristics", () => {
    const a = { id: "1", article: "DUP-001", name: "Бинт стерильный 7 м × 14 см" };
    const b = { id: "2", article: "DUP-001", name: "Бинт нестерильный 5 м × 10 см 2 шт" };
    expect(conflictingDuplicates(a, [a, b])).toBe(1);
    expect(conflictingDuplicates(a, [a, { ...a, id: "3" }])).toBe(0);
  });
});

describe("published photo variants", () => {
  it("derives AVIF/WebP sources only for catalogue photos in Vercel Blob", () => {
    const v = catalogPhotoSources("https://abc123.public.blob.vercel-storage.com/catalog/products/2068/v2-800.webp");
    expect(v?.avif).toBe(
      "https://abc123.public.blob.vercel-storage.com/catalog/products/2068/v2-400.avif 400w, https://abc123.public.blob.vercel-storage.com/catalog/products/2068/v2-800.avif 800w",
    );
    expect(catalogPhotoSources("https://images.openfoodfacts.org/images/products/1.jpg")).toBeNull();
    expect(catalogPhotoSources("https://evil.example/abc.public.blob.vercel-storage.com/catalog/products/1/v1-800.webp")).toBeNull();
  });
});

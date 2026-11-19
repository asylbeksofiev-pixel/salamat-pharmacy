import { describe, expect, it } from "vitest";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { OPEN_FACTS_SITES, fullImageUrl, loadOpenFactsExport, type OpenFactsProduct } from "../../scripts/catalog-photos/openfacts";
import { checkImage, discoverOne, publishable, storedFile, type PhotoResult } from "../../scripts/catalog-photos/internet";
import { blobPathname, isBlobProductPhoto } from "@/lib/catalog-photos/blob-url";
import { sameWord } from "@/lib/catalog-photos/similarity";

const obf = OPEN_FACTS_SITES.find((s) => s.code === "obf")!;
const GTIN = "3337875597197";

function card(over: Partial<OpenFactsProduct> = {}): OpenFactsProduct {
  return {
    site: obf,
    code: GTIN,
    pageUrl: `https://world.openbeautyfacts.org/product/${GTIN}`,
    name: "Effaclar Duo+ Unifiant",
    quantity: "40 ml",
    brands: "La Roche-Posay",
    imageUrl: `https://images.openbeautyfacts.org/images/products/333/787/559/7197/front_fr.12.full.jpg`,
    ...over,
  };
}

const product = (name: string, article: string | null = GTIN) => ({ id: "101", article, name });
const sources = (...cards: OpenFactsProduct[]) => new Map([[GTIN, cards]]);

describe("Open Facts exports", () => {
  it("uses the full-size front photo and only Open Facts image hosts", () => {
    expect(fullImageUrl("https://images.openfoodfacts.org/images/products/460/123/front_ru.12.400.jpg")).toBe(
      "https://images.openfoodfacts.org/images/products/460/123/front_ru.12.full.jpg",
    );
    expect(fullImageUrl("https://example.org/images/products/1/front.12.400.jpg")).toBeNull();
    expect(fullImageUrl("http://images.openfoodfacts.org/images/products/1/front.12.400.jpg")).toBeNull();
    expect(fullImageUrl("")).toBeNull();
  });

  it("keeps only wanted barcodes (leading zeros ignored) and reads brand and quantity", async () => {
    const dir = await mkdtemp(join(tmpdir(), "openfacts-"));
    const file = join(dir, "obf.tsv");
    const header = ["code", "url", "product_name", "generic_name", "quantity", "brands_tags", "image_url"].join("\t");
    await writeFile(
      file,
      [
        header,
        ["03337875597197", "", "Effaclar Duo+", "", "40 ml", "en:la-roche-posay", "https://images.openbeautyfacts.org/images/products/1/front_fr.3.400.jpg"].join("\t"),
        ["4600000000000", "", "Other", "", "", "", ""].join("\t"),
      ].join("\n"),
    );
    const rows = await loadOpenFactsExport(file, obf, new Set([GTIN]));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ code: "03337875597197", quantity: "40 ml", brands: "la-roche-posay", imageUrl: "https://images.openbeautyfacts.org/images/products/1/front_fr.3.full.jpg" });
    expect(rows[0].pageUrl).toBe("https://world.openbeautyfacts.org/product/03337875597197");
  });
});

describe("matching a SALAMAT product with an Open Facts card", () => {
  it("confirms the same barcode with the same brand, name, form and volume", () => {
    const r = discoverOne(product("La Roche-Posay Effaclar Duo+ Unifiant крем 40 мл"), sources(card({ name: "Effaclar Duo+ Unifiant crème" })), 0);
    expect(r.match_status).toBe("confirmed");
    expect(r.match_method).toBe("gtin_exact");
    expect(r.rights_status).toBe("licensed_cc_by_sa");
    expect(r.source_license).toBe("CC BY-SA 3.0");
    expect(r.attribution).toBe("Open Beauty Facts contributors");
    expect(r.product_id).toBe("101");
  });

  it("never accepts another volume, pack size or strength, even with the same barcode", () => {
    expect(discoverOne(product("La Roche-Posay Effaclar Duo+ Unifiant крем 15 мл"), sources(card()), 0).match_status).toBe("no_match");
    const tabs = card({ name: "Magnesium B6", brands: "Solgar", quantity: "20 tablets" });
    expect(discoverOne(product("Solgar Magnesium B6 таблетки №10"), sources(tabs), 0).match_status).toBe("no_match");
    const mg = card({ name: "Paracetamol 500 mg", brands: "Pharma", quantity: "10" });
    expect(discoverOne(product("Pharma Paracetamol 250 мг №10"), sources(mg), 0).match_status).toBe("no_match");
  });

  it("does not confirm when the card misses a characteristic or the brand", () => {
    const noQty = card({ quantity: "" });
    expect(discoverOne(product("La Roche-Posay Effaclar Duo+ Unifiant крем 40 мл"), sources(noQty), 0).match_status).toBe("probable");
    const noBrand = card({ brands: "", name: "Duo+ Unifiant 40 ml" });
    expect(discoverOne(product("La Roche-Posay Effaclar Duo+ Unifiant крем 40 мл"), sources(noBrand), 0).match_status).not.toBe("confirmed");
  });

  it("sends shared articles, assortments and SALAMAT repacks to a person", () => {
    expect(discoverOne(product("La Roche-Posay Effaclar Duo+ Unifiant крем 40 мл"), sources(card()), 1).match_status).toBe("probable");
    expect(discoverOne(product("La Roche-Posay Effaclar Duo+ Unifiant крем 40 мл в ассортименте"), sources(card()), 0).match_status).toBe("probable");
    expect(discoverOne(product("La Roche-Posay Effaclar Duo+ Unifiant крем 40 мл ФАСОВКА"), sources(card()), 0).match_status).toBe("doubtful");
  });

  it("finds nothing without a valid barcode or a photo", () => {
    expect(discoverOne(product("Something 40 мл", "ABC-1"), sources(card()), 0).match_status).toBe("no_match");
    expect(discoverOne(product("La Roche-Posay Effaclar Duo+ Unifiant крем 40 мл"), sources(card({ imageUrl: null })), 0).match_status).toBe("no_match");
    expect(discoverOne(product("La Roche-Posay Effaclar Duo+ Unifiant крем 40 мл"), new Map(), 0).reason).toBe("no_candidate_in_licensed_sources");
  });

  it("treats translations of the same word as the same word, but not different words", () => {
    expect(sameWord("мицеллярная", "micellaire")).toBe(true);
    expect(sameWord("крем", "crème")).toBe(true);
    expect(sameWord("шампунь", "shampooing")).toBe(true);
    expect(sameWord("крем", "гель")).toBe(false);
  });
});

async function picture(width: number, height: number, blank = false) {
  const channels = 3 as const;
  const raw = Buffer.alloc(width * height * channels, 255);
  if (!blank) for (let i = 0; i < raw.length; i++) raw[i] = (i * 7919 + Math.floor(i / 97) * 31) % 256;
  return sharp(raw, { raw: { width, height, channels } });
}

describe("image file checks", () => {
  it("accepts a real picture and reports its size", async () => {
    const png = await (await picture(800, 600)).png().toBuffer();
    const c = await checkImage(png, "image/png");
    expect(c).toMatchObject({ ok: true, width: 800, height: 600, format: "png", errors: [] });
  });

  it("rejects HTML, a wrong content type, broken files, tiny and blank pictures", async () => {
    expect((await checkImage(Buffer.from("<!doctype html><html></html>"), "text/html")).errors).toEqual(expect.arrayContaining(["not_image:text/html", "html_or_json", "corrupt"]));
    expect((await checkImage(Buffer.from([0xff, 0xd8, 0xff, 0x00, 0x01]), "image/jpeg")).errors).toContain("corrupt");
    expect((await checkImage(await (await picture(200, 200)).jpeg().toBuffer(), "image/jpeg")).errors[0]).toMatch(/^too_small/);
    expect((await checkImage(await (await picture(600, 600, true)).png().toBuffer(), "image/png")).errors).toContain("blank_or_placeholder");
  });

  it("flags low resolution and strip-like pictures for review", async () => {
    expect((await checkImage(await (await picture(400, 400)).png().toBuffer(), null)).warnings[0]).toMatch(/^low_resolution/);
    expect((await checkImage(await (await picture(1200, 300)).png().toBuffer(), null)).warnings.some((w) => w.startsWith("unusual_proportions"))).toBe(true);
  });

  it("keeps a web-ready file as is, scales a large one down to 1600 px and never enlarges", async () => {
    const small = await (await picture(700, 500)).jpeg({ quality: 90 }).toBuffer();
    const kept = await storedFile(small, await checkImage(small, "image/jpeg"));
    expect(kept.buffer.equals(small)).toBe(true);
    expect(kept).toMatchObject({ ext: "jpg", width: 700, height: 500 });

    const big = await (await picture(3200, 1600)).jpeg({ quality: 90 }).toBuffer();
    const scaled = await storedFile(big, await checkImage(big, "image/jpeg"));
    expect(scaled).toMatchObject({ ext: "webp", contentType: "image/webp", width: 1600, height: 800 });
  });

  it("turns a picture stored sideways (EXIF orientation) upright", async () => {
    const rotated = await (await picture(600, 900)).jpeg().withMetadata({ orientation: 6 }).toBuffer();
    const check = await checkImage(rotated, "image/jpeg");
    expect([check.width, check.height]).toEqual([900, 600]);
    const file = await storedFile(rotated, check);
    expect(file).toMatchObject({ ext: "webp", width: 900, height: 600 });
  });
});

describe("publication rules", () => {
  const base = { match_status: "confirmed", rights_status: "licensed_cc_by_sa", review_status: "auto", sha256: "a".repeat(64), error: "" } as PhotoResult;
  const ok = (over: Partial<PhotoResult>) => publishable({ ...base, ...over });

  it("publishes confirmed matches with a licence and a checked file", () => {
    expect(ok({})).toBe(true);
    expect(ok({ rights_status: "permission_granted" })).toBe(true);
  });

  it("requires a person's approval by default when publishing (back sides and close-ups pass every automatic check)", () => {
    expect(publishable({ ...base }, { requireReview: true })).toBe(false);
    expect(publishable({ ...base, review_status: "approved" }, { requireReview: true })).toBe(true);
    expect(publishable({ ...base, match_status: "probable", review_status: "approved" }, { requireReview: true })).toBe(true);
    expect(publishable({ ...base, review_status: "rolled_back" }, { requireReview: true })).toBe(false);
  });

  it("publishes probable matches only after a person approved them", () => {
    expect(ok({ match_status: "probable" })).toBe(false);
    expect(ok({ match_status: "probable", review_status: "approved" })).toBe(true);
  });

  it("never publishes doubtful, rejected, unlicensed or unchecked photos", () => {
    expect(ok({ match_status: "doubtful", review_status: "approved" })).toBe(false);
    expect(ok({ match_status: "no_match", review_status: "approved" })).toBe(false);
    expect(ok({ review_status: "rejected" })).toBe(false);
    expect(ok({ rights_status: "permission_required" })).toBe(false);
    expect(ok({ sha256: "" })).toBe(false);
    expect(ok({ error: "too_small:200x200" })).toBe(false);
  });
});

describe("Vercel Blob names", () => {
  it("stores each file under its product id and content hash", () => {
    expect(blobPathname("123", "b".repeat(64), "webp")).toBe(`products/123/${"b".repeat(64)}.webp`);
    expect(() => blobPathname("12/../1", "b".repeat(64), "webp")).toThrow();
    expect(() => blobPathname("1", "xyz", "webp")).toThrow();
    expect(() => blobPathname("1", "b".repeat(64), "gif")).toThrow();
  });

  it("recognises only product photos in a public Blob store", () => {
    expect(isBlobProductPhoto(`https://abc123.public.blob.vercel-storage.com/products/1/${"b".repeat(64)}.webp`)).toBe(true);
    expect(isBlobProductPhoto("https://abc123.public.blob.vercel-storage.com/other/1.webp")).toBe(false);
    expect(isBlobProductPhoto("https://abc123.public.blob.vercel-storage.com/products/1/a.webp?x=1")).toBe(false);
    expect(isBlobProductPhoto("http://abc123.public.blob.vercel-storage.com/products/1/a.webp")).toBe(false);
    expect(isBlobProductPhoto("https://evil.example.org/products/1/a.webp")).toBe(false);
    expect(isBlobProductPhoto("not a url")).toBe(false);
  });
});

// Open Food Facts / Open Beauty Facts / Open Products Facts — open databases whose product photos are published under
// CC BY-SA 3.0 (reuse, including commercial, with attribution and the same licence). Matching uses their official data
// exports (https://world.openfoodfacts.org/data), not page scraping: one download instead of thousands of requests.
//
// Export format: tab-separated, first row = header; used columns: code, url, product_name, generic_name, quantity,
// brands_en / brands_tags, image_url (front photo, 400 px display size; the original is "<…>.full.jpg").
import { createReadStream, existsSync } from "node:fs";
import { createGunzip } from "node:zlib";
import { createInterface } from "node:readline";
import type { NctCard } from "../../src/lib/catalog-photos/nct-match";

export interface OpenFactsSite {
  code: "off" | "obf" | "opf";
  name: string;
  host: string;
  imageHost: string;
}

export const OPEN_FACTS_SITES: OpenFactsSite[] = [
  { code: "obf", name: "Open Beauty Facts", host: "world.openbeautyfacts.org", imageHost: "images.openbeautyfacts.org" },
  { code: "off", name: "Open Food Facts", host: "world.openfoodfacts.org", imageHost: "images.openfoodfacts.org" },
  { code: "opf", name: "Open Products Facts", host: "world.openproductsfacts.org", imageHost: "images.openproductsfacts.org" },
];

export const OPEN_FACTS_LICENSE = "CC BY-SA 3.0";

export interface OpenFactsProduct {
  site: OpenFactsSite;
  code: string;
  pageUrl: string;
  name: string;
  quantity: string;
  brands: string;
  /** Front photo at full resolution (null when the product has no front photo). */
  imageUrl: string | null;
}

/** Front photo at full resolution: ".../front_ru.12.400.jpg" → ".../front_ru.12.full.jpg". Only Open Facts image hosts. */
export function fullImageUrl(url: string | null | undefined): string | null {
  if (!url || !/^https:\/\/images\.open(food|beauty|products|petfood)facts\.org\/images\/products\//.test(url)) return null;
  return url.replace(/\.(\d+)\.(400|200|100)\.jpg$/, ".$1.full.jpg");
}

/**
 * Reads an export (.tsv or .tsv.gz) and keeps rows whose barcode (leading zeros ignored) is wanted.
 * Lines are split on tabs; the exports never contain tabs inside fields.
 */
export async function loadOpenFactsExport(file: string, site: OpenFactsSite, wanted: Set<string>): Promise<OpenFactsProduct[]> {
  if (!existsSync(file)) return [];
  const input = file.endsWith(".gz") ? createReadStream(file).pipe(createGunzip()) : createReadStream(file);
  const lines = createInterface({ input, crlfDelay: Infinity });
  let header: string[] | null = null;
  const out: OpenFactsProduct[] = [];
  for await (const line of lines) {
    const cells = line.split("\t");
    if (!header) {
      header = cells;
      continue;
    }
    const code = (cells[0] ?? "").trim();
    if (!code || !wanted.has(code.replace(/^0+/, ""))) continue;
    const get = (col: string) => {
      const i = header!.indexOf(col);
      return i >= 0 ? (cells[i] ?? "").trim() : "";
    };
    const name = [get("product_name"), get("generic_name")].filter(Boolean).join(" · ");
    out.push({
      site,
      code,
      pageUrl: `https://${site.host}/product/${code}`,
      name,
      quantity: get("quantity"),
      brands: get("brands_en") || get("brands_tags").replace(/(^|,)[a-z]{2}:/g, "$1"),
      imageUrl: fullImageUrl(get("image_url")),
    });
  }
  return out;
}

/** An Open Facts product as a card for the common grading rules (src/lib/catalog-photos/nct-match.ts). */
export function asCard(p: OpenFactsProduct, id: number): NctCard {
  return {
    id,
    // The brand is a separate field in Open Facts; it is part of the product's identity, so it is compared too.
    name: [p.brands.split(",")[0]?.trim(), p.name].filter(Boolean).join(" "),
    gtin: p.code,
    ntin: null,
    kztin: null,
    images: p.imageUrl ? [p.imageUrl] : [],
    category: null,
    // The quantity field ("250 ml", "60 капсул") states volume and pack size; it is compared with the SALAMAT name.
    form: p.quantity || null,
    manufacturer: p.brands || null,
  };
}

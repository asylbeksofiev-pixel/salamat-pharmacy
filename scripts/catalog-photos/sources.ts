// Photo sources in priority order. Each adapter returns candidates with the terms on which the photo may be reused.
//
// 1. salamat  — files supplied by SALAMAT or by a manufacturer (inbox folder + photos.csv with the permission for each file).
// 2. nct      — the national catalogue nct.gov.kz. Its user agreement grants NO licence to reuse photos (they are uploaded by
//               suppliers, who keep the rights). Used to find a card for manual review and permission requests; the photo is
//               downloaded only if written permission is recorded in NCT_IMAGE_PERMISSION. Public barcode search is not
//               available (by-xtin answers "not found", numeric search fails), so NCT is searched by name only.
// 3. off/obf/opf — Open Food / Beauty / Products Facts: photos under CC BY-SA 3.0 with attribution; looked up by exact barcode.
import { readFile } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import Papa from "papaparse";
import { gtinVariants, type ArticleCheck } from "../../src/lib/catalog-photos/barcode";
import { compareAttributes, parseAttributes } from "../../src/lib/catalog-photos/attributes";
import type { Candidate, ProductRef } from "../../src/lib/catalog-photos/match";
import type { Http } from "./http";

export interface LookupContext {
  http: Http;
  product: ProductRef;
  article: ArticleCheck;
}

// ---------------------------------------------------------------- SALAMAT / manufacturer files

export interface InboxRow {
  product_id?: string;
  barcode?: string;
  /** File path relative to the inbox folder, or an https URL given by the rights holder. */
  file: string;
  /** Who supplied the photo: "SALAMAT", "Bayer Kazakhstan"… */
  source_name: string;
  /** What allows the use: "собственная съёмка SALAMAT", "письмо № 12 от 01.11.2026"… Required. */
  permission: string;
  attribution?: string;
  /** Product name as the supplier knows it (optional; used to check characteristics). */
  name?: string;
}

export class SalamatInbox {
  private byProduct = new Map<string, InboxRow>();
  private byBarcode = new Map<string, InboxRow>();
  constructor(readonly dir: string | null) {}

  static async load(dir: string | null): Promise<SalamatInbox> {
    const inbox = new SalamatInbox(dir);
    if (!dir) return inbox;
    const csv = await readFile(join(dir, "photos.csv"), "utf8");
    const parsed = Papa.parse<InboxRow>(csv, { header: true, skipEmptyLines: true, transformHeader: (h) => h.trim().toLowerCase() });
    for (const row of parsed.data) {
      if (!row.file?.trim() || !row.permission?.trim() || !row.source_name?.trim()) {
        throw new Error(`photos.csv: each row needs file, source_name and permission (row: ${JSON.stringify(row)})`);
      }
      if (row.product_id?.trim()) inbox.byProduct.set(row.product_id.trim(), row);
      else if (row.barcode?.trim()) inbox.byBarcode.set(row.barcode.trim().padStart(14, "0"), row);
    }
    return inbox;
  }

  /** Local file path or https URL of the original. */
  location(row: InboxRow): string {
    const f = row.file.trim();
    if (/^https:\/\//.test(f)) return f;
    return isAbsolute(f) ? f : resolve(this.dir!, f);
  }

  lookup(ctx: LookupContext): Candidate | null {
    const row = this.byProduct.get(ctx.product.id) ?? (ctx.article.gtin14 ? this.byBarcode.get(ctx.article.gtin14) : undefined);
    if (!row) return null;
    const assigned = this.byProduct.get(ctx.product.id) === row;
    return {
      rights: {
        source: "salamat",
        sourceName: row.source_name.trim(),
        license: row.permission.trim(),
        attribution: row.attribution?.trim() || null,
        reuseAllowed: true,
      },
      sourcePage: this.location(row),
      imageUrl: this.location(row),
      barcode: row.barcode?.trim() || null,
      name: row.name?.trim() || null,
      manufacturer: row.source_name.trim(),
      details: null,
      assignedToProduct: assigned,
    };
  }
}

// ---------------------------------------------------------------- Open Food / Beauty / Products Facts

interface OffProduct {
  code: string;
  product_name?: string;
  product_name_ru?: string;
  generic_name?: string;
  brands?: string;
  quantity?: string;
  selected_images?: { front?: { display?: Record<string, string> } };
  image_front_url?: string;
}

const OFF_SITES = [
  { source: "off", name: "Open Food Facts", host: "world.openfoodfacts.org" },
  { source: "obf", name: "Open Beauty Facts", host: "world.openbeautyfacts.org" },
  { source: "opf", name: "Open Products Facts", host: "world.openproductsfacts.org" },
] as const;

/** Front photo at full resolution: ".../front_ru.12.400.jpg" → ".../front_ru.12.full.jpg". */
export function offFullImage(url: string | undefined): string | null {
  if (!url || !/^https:\/\/images\.open(food|beauty|products)facts\.org\/images\/products\//.test(url)) return null;
  return url.replace(/\.(\d+|400|200|100)\.jpg$/, ".full.jpg");
}

export async function lookupOpenFacts(ctx: LookupContext): Promise<Candidate[]> {
  if (ctx.article.kind !== "gtin" || !ctx.article.gtin14) return [];
  // Open Food Facts stores EAN-13 / EAN-8; UPC-A is stored with a leading zero as EAN-13.
  const codes = gtinVariants(ctx.article.gtin14).filter((c) => c.length === 13 || c.length === 8);
  const out: Candidate[] = [];
  for (const site of OFF_SITES) {
    for (const code of codes) {
      const fields = "code,product_name,product_name_ru,generic_name,brands,quantity,selected_images,image_front_url";
      const { data } = await ctx.http.json<{ status: number; product?: OffProduct }>(`https://${site.host}/api/v2/product/${code}.json?fields=${fields}`);
      if (!data || data.status !== 1 || !data.product) continue;
      const p = data.product;
      const display = p.selected_images?.front?.display;
      const front = display?.ru ?? display?.en ?? (display ? Object.values(display)[0] : undefined) ?? p.image_front_url;
      out.push({
        rights: {
          source: site.source,
          sourceName: site.name,
          license: "CC BY-SA 3.0",
          attribution: `${site.name} contributors`, // shown as "Фото: <attribution>, <licence>" with a link to the source page
          reuseAllowed: true,
        },
        sourcePage: `https://${site.host}/product/${p.code}`,
        imageUrl: offFullImage(front),
        barcode: p.code,
        name: [p.product_name_ru || p.product_name, p.generic_name].filter(Boolean).join(" · ") || null,
        manufacturer: p.brands ?? null,
        details: p.quantity ?? null,
      });
      break;
    }
  }
  return out;
}

// ---------------------------------------------------------------- NCT (nct.gov.kz)

interface NctAttr {
  name?: { ru?: string };
  value?: { ru?: string } | string | null;
}
interface NctProduct {
  id: number;
  name: string;
  gtin: string | null;
  kztin_code?: string | null;
  ntin_code?: string | null;
  images: { image_url: string; hidden: boolean }[];
  attributes_dict: Record<string, NctAttr> | NctAttr[] | null;
}

function nctAttr(p: NctProduct, key: string): string | null {
  const dict = p.attributes_dict && !Array.isArray(p.attributes_dict) ? p.attributes_dict : {};
  const v = dict[key]?.value;
  if (!v) return null;
  return typeof v === "string" ? v : (v.ru ?? null);
}

// Words that describe the form or the pack; NCT spells them differently ("таб.", "р-р"), so they only hurt the search.
const NCT_NOISE = /^(таблетк|табл|таб|капсул|капс|раствор|р-р|для|приготовлен|инъекц|иньекц|инфуз|порош|суспенз|сироп|мазь|крем|гель|капли|спрей|суппоз|свеч|ампул|фасовк|комплект|шт|мг|мл|гр|caps|vcaps|tabs|mg|ml)/i;

/** Search text: brand and product words of the name, without strengths, pack sizes and form words. */
export function nctQuery(name: string): string {
  return name
    .replace(/\(([^)]*)\)/g, (_m, inner: string) => (/\d|№/.test(inner) ? " " : ` ${inner} `)) // "(№30)" goes, "(Gufolino)" stays
    .replace(/[№#]\s*\d+/g, " ")
    .replace(/\d+([.,]\d+)?\s*(мг|мкг|мл|г|гр|ме|%|mg|mcg|ml|g|шт)(?![\p{L}])/giu, " ")
    .replace(/\b[дД]\/\S*/g, " ")
    .replace(/[^\p{L}\d\s-]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !/^\d+$/.test(w) && !NCT_NOISE.test(w))
    .slice(0, 3)
    .join(" ");
}

export async function lookupNct(ctx: LookupContext): Promise<Candidate[]> {
  const q = nctQuery(ctx.product.name);
  if (q.length < 3) return [];
  const { data } = await ctx.http.json<{ result?: NctProduct[] }>("https://nct.gov.kz/api/core/products/search/?limit=5&offset=0", {
    method: "POST",
    body: JSON.stringify({ q }),
    headers: { "Content-Type": "application/json" },
    timeoutMs: 45_000,
  });
  const permission = process.env.NCT_IMAGE_PERMISSION?.trim() || null;
  const firstWord = q.split(" ")[0].toLowerCase().replace(/ё/g, "е");
  const mine = parseAttributes(ctx.product.name);
  return (data?.result ?? [])
    .filter((p) => p.name.toLowerCase().replace(/ё/g, "е").includes(firstWord))
    .map((p) => {
      const form = nctAttr(p, "forma_vypuska");
      const img = p.images.find((i) => !i.hidden)?.image_url ?? null;
      const c: Candidate = {
        rights: {
          source: "nct",
          sourceName: "НКТ (nct.gov.kz)",
          license: permission ?? "Не предоставлено: соглашение НКТ не даёт права на повторное использование фото; права у поставщика, загрузившего фото",
          attribution: permission ? "Национальный каталог товаров (nct.gov.kz)" : null,
          reuseAllowed: !!permission,
        },
        sourcePage: `https://nct.gov.kz/#/products/${p.id}`,
        imageUrl: img,
        barcode: p.gtin,
        name: p.name,
        manufacturer: nctAttr(p, "proizvoditel"),
        details: form,
      };
      return c;
    })
    .sort((a, b) => score(b) - score(a))
    .slice(0, 1);

  function score(c: Candidate) {
    const cmp = compareAttributes(mine, parseAttributes(`${c.name} ${c.details ?? ""}`));
    return (cmp.status === "consistent" ? 10 : cmp.status === "insufficient" ? 5 : 0) + cmp.confirmed.length;
  }
}

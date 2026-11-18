// Client for the public NCT catalogue API (https://nct.gov.kz/api/…, no authorisation; the same calls the public site makes).
//
// What the public API offers (checked 18.11.2026):
//   POST /api/core/products/search/?limit=&offset=  body {"q": "..."} — search; all words must match (AND), the GTIN field
//        is matched too, so "<word> <GTIN>" finds the card with that barcode. Pages hold at most 48 cards.
//        A query made of a barcode alone makes the server fail (HTTP 500 after ~30 s), so it is never sent.
//   GET  /api/core/products/<id>/ — full card: manufacturer, manufacturer BIN, country, pack amount, image URLs.
// Photos are NOT downloaded: the NCT user agreement grants no licence to reuse them (docs/catalog-photos-nct.md).
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { NctCard } from "../../src/lib/catalog-photos/nct-match";
import { significantWords } from "../../src/lib/catalog-photos/similarity";
import { HttpError, type Http } from "./http";
import { nctQuery } from "./sources";

/** Words to search with: the cleaned name (brand + product words) and its significant words. */
export function queryWords(name: string): string[] {
  const base = nctQuery(name).split(" ").filter(Boolean);
  const extra = significantWords(name).filter((w) => w.length >= 3 && !base.some((b) => b.toLowerCase() === w));
  return [...base, ...extra].slice(0, 5);
}

interface RawAttr {
  value?: { ru?: string } | string | null;
}
interface RawCard {
  id: number;
  name: string;
  gtin: string | null;
  kztin_code?: string | null;
  ntin_code?: string | null;
  external_id?: string | null;
  images?: { image_url: string; hidden: boolean }[] | null;
  category?: { name?: string } | string | null;
  attributes_dict?: Record<string, RawAttr> | RawAttr[] | null;
  manufacturer?: string | null;
  manufacturer_bin?: string | null;
  country?: { name?: string } | null;
  amount_in_package?: number | null;
  source?: number | null;
}

function attr(c: RawCard, key: string): string | null {
  const d = c.attributes_dict && !Array.isArray(c.attributes_dict) ? c.attributes_dict : {};
  const v = d[key]?.value;
  if (!v) return null;
  return (typeof v === "string" ? v : (v.ru ?? null))?.trim() || null;
}

export function slimCard(c: RawCard, detailed = false): NctCard {
  return {
    id: c.id,
    name: (c.name ?? "").trim(),
    gtin: c.gtin?.trim() || null,
    ntin: c.ntin_code?.trim() || null,
    kztin: c.kztin_code?.trim() || null,
    images: (c.images ?? []).filter((i) => !i.hidden && /^https:\/\//.test(i.image_url)).map((i) => i.image_url),
    category: typeof c.category === "object" && c.category ? (c.category.name ?? null) : null,
    form: attr(c, "forma_vypuska"),
    manufacturer: c.manufacturer?.trim() || attr(c, "proizvoditel"),
    manufacturerBin: c.manufacturer_bin?.trim() || null,
    country: c.country?.name ?? null,
    amountInPackage: c.amount_in_package ?? null,
    source: c.source ?? null,
    externalId: c.external_id ?? null,
    detailed,
  };
}

export interface SearchResult {
  q: string;
  count: number;
  cards: NctCard[];
  /** All matching cards were fetched (count ≤ pages × 48). */
  complete: boolean;
  requests: number;
}

/** A query the API can answer: at least one word with letters, no bare barcode. */
export function safeQuery(q: string): string | null {
  const clean = q.replace(/["\\]/g, " ").replace(/\s+/g, " ").trim();
  if (!/\p{L}{2,}/u.test(clean)) return null;
  return clean.slice(0, 120);
}

const PAGE = 48;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class NctClient {
  readonly stats = { requests: 0, cacheHits: 0, serverErrors: 0, failed: 0 };
  constructor(
    private readonly http: Http,
    private readonly cacheDir: string,
    private readonly log: (e: Record<string, unknown>) => void,
  ) {}

  private file(kind: string, key: string) {
    const h = createHash("sha256").update(key).digest("hex");
    return join(this.cacheDir, kind, h.slice(0, 2), `${h}.json`);
  }

  private async cached<T>(kind: string, key: string): Promise<T | null> {
    try {
      return JSON.parse(await readFile(this.file(kind, key), "utf8")) as T;
    } catch {
      return null;
    }
  }

  private async store(kind: string, key: string, value: unknown) {
    const f = this.file(kind, key);
    await mkdir(join(f, ".."), { recursive: true });
    await writeFile(f, JSON.stringify(value));
  }

  /**
   * One API call. 429/502/503/504 and network errors are retried by Http (backoff, Retry-After, adaptive pacing).
   * HTTP 500 is retried here twice with growing pauses; after that the error goes up and the product is marked for a
   * later run.
   */
  private async call(url: string, init: RequestInit = {}): Promise<unknown> {
    for (let attempt = 0; ; attempt++) {
      this.stats.requests++;
      try {
        const res = await this.http.fetchBytes(url, { ...init, timeoutMs: 60_000, maxBytes: 20_000_000 });
        if (res.status === 200) return JSON.parse(res.body.toString("utf8"));
        if (res.status === 404) return null;
        throw new HttpError(`HTTP ${res.status}`, res.status, res.status >= 500);
      } catch (e) {
        const status = e instanceof HttpError ? e.status : null;
        if (status !== null && status >= 500) this.stats.serverErrors++;
        if (status === 500 && attempt < 2) {
          const delay = 15_000 * (attempt + 1);
          this.log({ event: "nct_retry", url, status, delayMs: delay });
          await sleep(delay);
          continue;
        }
        this.stats.failed++;
        throw e;
      }
    }
  }

  /** Search with up to `maxPages` pages of 48 cards. Results (slim cards) are cached on disk. */
  async search(query: string, maxPages: number): Promise<SearchResult | null> {
    const q = safeQuery(query);
    if (!q) return null;
    const key = `${q.toLowerCase()}|${maxPages}`;
    const hit = await this.cached<SearchResult>("search", key);
    if (hit) {
      this.stats.cacheHits++;
      return { ...hit, requests: 0 };
    }
    const cards: NctCard[] = [];
    let count = 0;
    let requests = 0;
    for (let page = 0; page < maxPages; page++) {
      const data = (await this.call(`https://nct.gov.kz/api/core/products/search/?limit=${PAGE}&offset=${page * PAGE}`, {
        method: "POST",
        body: JSON.stringify({ q }),
        headers: { "Content-Type": "application/json" },
      })) as { count?: number; result?: RawCard[]; next?: string | null } | null;
      requests++;
      count = data?.count ?? 0;
      for (const c of data?.result ?? []) cards.push(slimCard(c));
      if (!data?.next || !(data.result ?? []).length) break;
      // A query too broad to be read completely within maxPages is not paged further: a narrower query does better.
      if (count > maxPages * PAGE) break;
    }
    const result: SearchResult = { q, count, cards, complete: cards.length >= count, requests };
    await this.store("search", key, result);
    return result;
  }

  /** Full card (manufacturer, BIN, country, pack amount). Cached. */
  async card(id: number): Promise<NctCard | null> {
    const key = String(id);
    const hit = await this.cached<NctCard>("card", key);
    if (hit) {
      this.stats.cacheHits++;
      return hit;
    }
    const data = (await this.call(`https://nct.gov.kz/api/core/products/${id}/`)) as RawCard | null;
    if (!data) return null;
    const card = slimCard(data, true);
    await this.store("card", key, card);
    return card;
  }
}

// Reading products. public.pharmacy_products is read-only in production: every query runs in a READ ONLY
// transaction, pages by the unique id (keyset pagination, so resuming from the last id never skips or repeats rows).
import { readFile, writeFile } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import type { ProductRef } from "../../src/lib/catalog-photos/match";
import type { Http } from "./http";

export interface ProductReader {
  /** Up to `limit` products with id > afterId, ordered by id. */
  batch(afterId: bigint, limit: number): Promise<ProductRef[]>;
  /** Specific products (dry run on a chosen sample). */
  byIds(ids: string[]): Promise<ProductRef[]>;
  /** All products that share each article (only articles used by more than one product). */
  duplicates(): Promise<Map<string, ProductRef[]>>;
  total(): Promise<number>;
  close(): Promise<void>;
}

export class DbReader implements ProductReader {
  private prisma: PrismaClient;
  constructor(url: string) {
    this.prisma = new PrismaClient({ datasources: { db: { url } }, log: ["warn", "error"] });
  }

  private async readOnly<T>(q: (tx: Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
      return q(tx);
    });
  }

  batch(afterId: bigint, limit: number) {
    return this.readOnly((tx) =>
      tx.$queryRaw<ProductRef[]>`SELECT p.id::text AS id, p.article, coalesce(p.name, '') AS name FROM public.pharmacy_products p WHERE p.id > ${afterId} ORDER BY p.id LIMIT ${limit}`,
    );
  }

  byIds(ids: string[]) {
    const list = ids.filter((i) => /^[1-9]\d{0,17}$/.test(i)).map((i) => BigInt(i));
    return this.readOnly((tx) => tx.$queryRaw<ProductRef[]>`SELECT p.id::text AS id, p.article, coalesce(p.name, '') AS name FROM public.pharmacy_products p WHERE p.id = ANY(${list}) ORDER BY p.id`);
  }

  async duplicates() {
    const rows = await this.readOnly((tx) =>
      tx.$queryRaw<{ article: string; items: ProductRef[] }[]>`
        SELECT btrim(article) AS article, json_agg(json_build_object('id', id::text, 'article', article, 'name', coalesce(name, '')) ORDER BY id) AS items
        FROM public.pharmacy_products WHERE coalesce(btrim(article), '') <> ''
        GROUP BY btrim(article) HAVING count(*) > 1`,
    );
    return new Map(rows.map((r) => [r.article, r.items]));
  }

  async total() {
    const [r] = await this.readOnly((tx) => tx.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM public.pharmacy_products`);
    return Number(r.n);
  }

  close() {
    return this.prisma.$disconnect();
  }
}

/** Reads through the site's public catalogue API (no database credentials). Used for the dry run. */
export class SiteApiReader implements ProductReader {
  constructor(
    private readonly base: string,
    private readonly http: Http,
  ) {}

  async batch(): Promise<ProductRef[]> {
    throw new Error("Full runs read the database (DATABASE_URL); the site API is only for --ids samples");
  }

  async byIds(ids: string[]) {
    const out: ProductRef[] = [];
    for (const id of ids) {
      const res = await this.http.fetchBytes(`${this.base}/api/catalog/items/${id}`);
      if (res.status !== 200) continue;
      const j = JSON.parse(res.body.toString("utf8"));
      const it = j.item ?? j;
      out.push({ id: String(it.id), article: it.article ?? null, name: it.name ?? "" });
    }
    return out;
  }

  /** Duplicates among the sample only (the public API has no "same article" query); the report says so. */
  async duplicates() {
    return new Map<string, ProductRef[]>();
  }

  async total() {
    const res = await this.http.fetchBytes(`${this.base}/api/catalog/items?pageSize=1`);
    return JSON.parse(res.body.toString("utf8")).total as number;
  }

  async close() {}
}

export interface SnapshotMeta {
  source: string;
  fetchedAt: string;
  total: number;
  uniqueIds: number;
  pages: number;
  withImage: number;
  duplicateArticles: number;
  productsInDuplicateArticles: number;
}

/**
 * Copies the whole catalogue (id, article, name, imageUrl) through the public read-only API, page by page, and stores it
 * sorted by the unique id. The API orders by name with id as the tie-breaker, so pages neither repeat nor skip rows;
 * the result is still checked: the number of unique ids must equal the reported total, otherwise the scan is repeated.
 */
export async function takeSnapshot(base: string, http: Http, file: string, log: (m: string) => void): Promise<SnapshotMeta> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const byId = new Map<string, ProductRef & { imageUrl: string | null }>();
    let total = 0;
    let pages = 0;
    for (let page = 1; ; page++) {
      const res = await http.fetchBytes(`${base}/api/catalog/items?page=${page}&pageSize=48`);
      if (res.status !== 200) throw new Error(`catalogue API answered ${res.status} on page ${page}`);
      const j = JSON.parse(res.body.toString("utf8")) as { items: { id: string; article: string | null; name: string; imageUrl: string | null }[]; total: number; pageCount: number };
      total = j.total;
      pages = j.pageCount;
      for (const it of j.items) byId.set(String(it.id), { id: String(it.id), article: it.article ?? null, name: it.name ?? "", imageUrl: it.imageUrl ?? null });
      if (page % 50 === 0) log(`  страница ${page}/${j.pageCount}, товаров ${byId.size}`);
      if (page >= j.pageCount) break;
    }
    if (byId.size !== total) {
      log(`  уникальных id ${byId.size}, а total ${total} — каталог менялся во время чтения, повтор (${attempt}/3)`);
      continue;
    }
    const rows = [...byId.values()].sort((a, b) => (BigInt(a.id) < BigInt(b.id) ? -1 : 1));
    const articles = new Map<string, number>();
    for (const r of rows) {
      const a = (r.article ?? "").trim();
      if (a) articles.set(a, (articles.get(a) ?? 0) + 1);
    }
    const dups = [...articles.values()].filter((n) => n > 1);
    await writeFile(file, rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
    return {
      source: `${base}/api/catalog/items`,
      fetchedAt: new Date().toISOString(),
      total,
      uniqueIds: rows.length,
      pages,
      withImage: rows.filter((r) => r.imageUrl).length,
      duplicateArticles: dups.length,
      productsInDuplicateArticles: dups.reduce((s, n) => s + n, 0),
    };
  }
  throw new Error("the catalogue kept changing during the scan; try again later");
}

/** Reads a snapshot made by takeSnapshot: batches by id (keyset), duplicates by article. */
export class SnapshotReader implements ProductReader {
  private rows: ProductRef[] = [];
  constructor(private readonly file: string) {}

  private async load() {
    if (!this.rows.length) {
      this.rows = (await readFile(this.file, "utf8"))
        .split("\n")
        .filter(Boolean)
        .map((l) => {
          const r = JSON.parse(l);
          return { id: String(r.id), article: r.article ?? null, name: r.name ?? "" };
        });
    }
    return this.rows;
  }

  async batch(afterId: bigint, limit: number) {
    return (await this.load()).filter((r) => BigInt(r.id) > afterId).slice(0, limit);
  }

  async byIds(ids: string[]) {
    const want = new Set(ids);
    return (await this.load()).filter((r) => want.has(r.id));
  }

  async duplicates() {
    const by = new Map<string, ProductRef[]>();
    for (const r of await this.load()) {
      const a = (r.article ?? "").trim();
      if (a) by.set(a, [...(by.get(a) ?? []), r]);
    }
    return new Map([...by].filter(([, v]) => v.length > 1));
  }

  async total() {
    return (await this.load()).length;
  }

  async close() {}
}

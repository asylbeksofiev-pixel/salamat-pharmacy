// Reading products. public.pharmacy_products is read-only in production: every query runs in a READ ONLY
// transaction, pages by the unique id (keyset pagination, so resuming from the last id never skips or repeats rows).
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

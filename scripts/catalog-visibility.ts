// Public visibility of catalogue products (catalog_item_visibility; no row = public).
//
//   npm run catalog:visibility -- candidates [--from-report data/reports/catalog-classification.csv] [--out <file.csv>]
//       List products whose article or name carries a service marker ("Комплектующая", "ФАСОВКА", "ШТУЧНО" …) or whose
//       article does not look like a barcode — for a decision by SALAMAT staff. Writes a CSV, hides nothing.
//       Without --from-report reads public.pharmacy_products from DATABASE_URL.
//   npm run catalog:visibility -- list                                   hidden products (DATABASE_URL)
//   npm run catalog:visibility -- hide <id[,id…]> --reason "…" --by "…" [--yes]
//   npm run catalog:visibility -- show <id[,id…]> --reason "…" --by "…" [--yes]
//       Hide or show again; every row keeps who decided and why. --yes is required for a non-local database.
//
// Nothing is hidden automatically: a missing barcode or the word "комплект" alone is not a reason to hide a product.
import { PrismaClient } from "@prisma/client";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { parseCsvObjects, toCsv } from "../src/lib/csv";

const args = process.argv.slice(2);
const cmd = args[0];
const opt = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

/** Service markers seen in the catalogue (article or name). A signal for a person, not a decision. */
// In a name, only the upper-case accounting note counts: "Глюкометр … комплект" is a kit and "Набор комплектующих"
// a set of spare parts, both normal products.
const SERVICE_MARKERS: [RegExp, RegExp, string][] = [
  [/комплектующ/i, /КОМПЛЕКТУЮЩ/, "«Комплектующая»"],
  [/^компл/i, /(?:^|\s)КОМПЛ(?:ЕКТ)?\.?(?=\s|$)/, "«Комплект»"],
  [/фасовк/i, /ФАСОВК/, "«Фасовка»"],
  [/штучно/i, /ШТУЧНО/, "«Штучно»"],
  [/разделить/i, /РАЗДЕЛИТЬ/, "«Разделить»"],
];

export interface Candidate {
  id: string;
  article: string;
  name: string;
  category: string;
  signal: string;
  question: string;
}

export function visibilityCandidates(rows: { id: string; article: string | null; name: string; category: string | null }[]): Candidate[] {
  const out: Candidate[] = [];
  for (const r of rows) {
    const article = (r.article ?? "").trim();
    const inArticle = SERVICE_MARKERS.filter(([a]) => a.test(article));
    const inName = SERVICE_MARKERS.filter(([, n]) => n.test(r.name));
    const markers = [...new Set([...inArticle, ...inName].map(([, , label]) => label))];
    if (markers.length) {
      out.push({
        id: r.id,
        article,
        name: r.name,
        category: r.category ?? "",
        signal: `служебная пометка: ${markers.join(", ")} (${inArticle.length ? "в артикуле" : "в названии"})`,
        question: "Это позиция для покупателей (фасовка, штучная продажа) или внутренняя учётная запись? Если внутренняя — скрыть с сайта.",
      });
    } else if (!/^\d{8,14}$/.test(article)) {
      out.push({
        id: r.id,
        article,
        name: r.name,
        category: r.category ?? "",
        signal: article ? "артикул не похож на штрихкод" : "нет артикула",
        question: "Проверьте артикул (штрихкод) в учётной системе. Скрывать не нужно, если товар продаётся.",
      });
    }
  }
  return out.sort((a, b) => Number(b.signal.startsWith("служебная")) - Number(a.signal.startsWith("служебная")) || a.name.localeCompare(b.name, "ru"));
}

function ids(): bigint[] {
  const raw = args[1] ?? "";
  const list = raw.split(",").map((s) => s.trim()).filter(Boolean);
  if (!list.length || list.some((s) => !/^[1-9]\d{0,17}$/.test(s))) throw new Error("Give product ids: hide 1594,773");
  return list.map((s) => BigInt(s));
}

function isLocalDb(): boolean {
  try {
    return ["localhost", "127.0.0.1", "::1", "db", "postgres"].includes(new URL(process.env.DATABASE_URL ?? "").hostname);
  } catch {
    return false;
  }
}

async function main() {
  if (cmd === "candidates") {
    const from = opt("from-report");
    let rows: { id: string; article: string | null; name: string; category: string | null }[];
    if (from) {
      rows = parseCsvObjects(readFileSync(from, "utf8").replace(/^﻿/, "")).map((r) => ({
        id: r.product_id,
        article: r.article ?? null,
        name: r.name ?? "",
        category: r.review_status === "needs_review" ? null : r.category_slug || null,
      }));
    } else {
      const db = new PrismaClient();
      try {
        rows = (
          await db.$queryRaw<{ id: string; article: string | null; name: string | null; category: string | null }[]>`
            SELECT p."id"::text AS id, p."article", p."name", k."slug" AS category
            FROM "public"."pharmacy_products" p
            LEFT JOIN "catalog_item_categories" c ON c."product_id" = p."id" AND c."review_status" IN ('auto', 'confirmed')
            LEFT JOIN "Category" k ON k."id" = c."category_id"
            ORDER BY p."id"`
        ).map((r) => ({ ...r, name: r.name ?? "" }));
      } finally {
        await db.$disconnect();
      }
    }
    const list = visibilityCandidates(rows);
    const out = opt("out") ?? "data/reports/catalog-visibility-candidates.csv";
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, toCsv(["product_id", "article", "name", "current_category", "signal", "question"], list.map((c) => [c.id, c.article, c.name, c.category, c.signal, c.question])));
    const service = list.filter((c) => c.signal.startsWith("служебная")).length;
    console.log(`Candidates: ${list.length} (${service} with a service marker, ${list.length - service} with an unusual article) → ${out}. Nothing was hidden.`);
    return;
  }
  const db = new PrismaClient();
  try {
    if (cmd === "list") {
      const rows = await db.catalogItemVisibility.findMany({ where: { isPublic: false }, orderBy: { productId: "asc" } });
      for (const r of rows) console.log(`${r.productId}\t${r.decidedBy}\t${r.updatedAt.toISOString()}\t${r.reason}`);
      console.log(`Hidden: ${rows.length}`);
      return;
    }
    if (cmd === "hide" || cmd === "show") {
      const list = ids();
      const reason = opt("reason")?.trim();
      const by = opt("by")?.trim();
      if (!reason || !by) throw new Error('--reason "…" and --by "…" are required');
      if (!isLocalDb() && !args.includes("--yes")) throw new Error("Non-local database: add --yes to confirm");
      const isPublic = cmd === "show";
      const known = await db.$queryRaw<{ id: bigint }[]>`SELECT "id" FROM "public"."pharmacy_products" WHERE "id" IN (${prismaJoin(list)})`;
      const knownIds = new Set(known.map((r) => r.id.toString()));
      const missing = list.filter((id) => !knownIds.has(id.toString()));
      if (missing.length) throw new Error(`Unknown product ids: ${missing.join(", ")}`);
      await db.$transaction(
        list.map((productId) =>
          db.catalogItemVisibility.upsert({
            where: { productId },
            create: { productId, isPublic, reason, decidedBy: by },
            update: { isPublic, reason, decidedBy: by },
          }),
        ),
      );
      console.log(`${isPublic ? "Shown" : "Hidden"}: ${list.join(", ")}`);
      return;
    }
    console.error("Usage: npm run catalog:visibility -- candidates|list|hide <ids>|show <ids> …");
    process.exitCode = 2;
  } finally {
    await db.$disconnect();
  }
}

function prismaJoin(list: bigint[]) {
  // Local import keeps the pure candidate function usable without a database client.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Prisma } = require("@prisma/client") as typeof import("@prisma/client");
  return Prisma.join(list);
}

if (process.argv[1]?.endsWith("catalog-visibility.ts")) {
  main().catch((e) => {
    console.error((e as Error).message);
    process.exit(1);
  });
}

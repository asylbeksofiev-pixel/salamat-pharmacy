// Distributes catalogue products (public.pharmacy_products) into the nine sections.
//
//   npm run catalog:classify                         dry run against DATABASE_URL: CSV report + summary, no writes
//   npm run catalog:classify -- --apply [--yes]      write assignments (runs are logged; --yes needed for non-local DBs)
//   npm run catalog:classify -- --verify             counts and integrity of stored assignments
//   npm run catalog:classify -- --rollback <runId>   undo exactly what one apply run wrote
//   npm run catalog:classify -- --from-json f.json   offline dry run over a dump ([{id, article, name}]) — no database
//
// Options: --report <file.csv> (default data/reports/catalog-classification.csv), --overrides <file.csv>
// (default data/catalog-category-overrides.csv: product_id,category_slug,note — applied as "confirmed"),
// --categories-csv <file.csv> (compare an exported Category table with the database before applying).
import { PrismaClient } from "@prisma/client";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { CATEGORY_SLUGS, CLASSIFIER_VERSION, classifyName, type CategorySlug } from "../src/lib/catalog-classify";
import { parseCsvObjects, toCsv } from "../src/lib/csv";
import {
  REPORT_HEADER,
  applyPlan,
  loadCategories,
  planClassification,
  reportRow,
  rollbackRun,
  verifyClassification,
  type Override,
  type PlanItem,
} from "../src/server/catalog-classification";

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const opt = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

const reportPath = opt("report") ?? "data/reports/catalog-classification.csv";
const overridesPath = opt("overrides") ?? "data/catalog-category-overrides.csv";

function writeReport(items: PlanItem[], summary: unknown) {
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, toCsv(REPORT_HEADER, items.map(reportRow)));
  // Only the products waiting for a person, easier to work through.
  const review = items.filter((i) => i.next.reviewStatus === "needs_review");
  writeFileSync(reportPath.replace(/\.csv$/, "") + ".needs-review.csv", toCsv(REPORT_HEADER, review.map(reportRow)));
  writeFileSync(reportPath.replace(/\.csv$/, "") + ".summary.json", JSON.stringify(summary, null, 2) + "\n");
  console.log(`Report: ${reportPath} (${items.length} rows; ${review.length} need review)`);
}

function loadOverrides(): Map<string, Override> {
  const map = new Map<string, Override>();
  if (!existsSync(overridesPath)) return map;
  for (const row of parseCsvObjects(readFileSync(overridesPath, "utf8"))) {
    const id = row.product_id;
    const slug = row.category_slug as CategorySlug;
    if (!/^[1-9]\d{0,17}$/.test(id ?? "")) throw new Error(`${overridesPath}: invalid product_id "${id}"`);
    if (!(CATEGORY_SLUGS as readonly string[]).includes(slug)) throw new Error(`${overridesPath}: unknown category_slug "${slug}" for ${id}`);
    map.set(id, { slug, note: row.note ?? "" });
  }
  console.log(`Manual overrides: ${map.size} (${overridesPath})`);
  return map;
}

function dbHost(): string {
  try {
    return new URL(process.env.DATABASE_URL ?? "").hostname;
  } catch {
    return "";
  }
}
const isLocal = (h: string) => ["localhost", "127.0.0.1", "::1", "db", "postgres"].includes(h);

async function compareCategoriesCsv(db: PrismaClient, file: string) {
  const rows = parseCsvObjects(readFileSync(file, "utf8"));
  const pick = (r: Record<string, string>, ...keys: string[]) => keys.map((k) => r[k] ?? r[k.toLowerCase()]).find((v) => v !== undefined && v !== "") ?? "";
  const dbRows = await db.category.findMany({ select: { id: true, slug: true, nameRu: true, nameKk: true, parentId: true } });
  const byId = new Map(dbRows.map((r) => [r.id, r]));
  const bySlug = new Map(dbRows.map((r) => [r.slug, r]));
  const problems: string[] = [];
  for (const r of rows) {
    const id = pick(r, "id");
    const slug = pick(r, "slug");
    const inDb = (id && byId.get(id)) || (slug && bySlug.get(slug));
    if (!inDb) problems.push(`not in database: id=${id} slug=${slug}`);
    else {
      if (id && inDb.id !== id) problems.push(`id differs for slug ${slug}: file ${id}, database ${inDb.id}`);
      if (slug && inDb.slug !== slug) problems.push(`slug differs for id ${id}: file ${slug}, database ${inDb.slug}`);
      const nameRu = pick(r, "nameRu", "name_ru");
      if (nameRu && nameRu !== inDb.nameRu) problems.push(`nameRu differs for ${inDb.slug}: file "${nameRu}", database "${inDb.nameRu}"`);
    }
  }
  console.log(`Category file ${file}: ${rows.length} rows, ${dbRows.length} in database, ${problems.length} differences`);
  for (const p of problems) console.log(`  - ${p}`);
  console.log("Matching uses slug → existing id; nothing is created or renamed by this script.");
}

async function main() {
  // Offline dry run over a dump of the public catalogue: no database access at all.
  const fromJson = opt("from-json");
  if (fromJson) {
    const items: { id: string; article: string | null; name: string }[] = JSON.parse(readFileSync(fromJson, "utf8"));
    const plan: PlanItem[] = items.map((p) => {
      const c = classifyName(p.name);
      return {
        productId: BigInt(p.id),
        article: p.article,
        name: p.name,
        categorySlug: c.category,
        next: { categoryId: null, confidence: c.confidence, method: c.method, reason: c.reason, reviewStatus: c.reviewStatus, classifierVersion: CLASSIFIER_VERSION },
        previous: null,
        action: "create",
      };
    });
    const byCategory: Record<string, number> = {};
    let review = 0;
    let reviewWithSuggestion = 0;
    for (const it of plan) {
      if (it.next.reviewStatus === "needs_review") {
        review++;
        if (it.categorySlug) reviewWithSuggestion++;
      } else byCategory[it.categorySlug!] = (byCategory[it.categorySlug!] ?? 0) + 1;
    }
    const summary = { mode: "offline", source: fromJson.split("/").pop(), classifierVersion: CLASSIFIER_VERSION, products: plan.length, uniqueIds: new Set(items.map((i) => i.id)).size, byCategory, needsReview: review, needsReviewWithSuggestion: reviewWithSuggestion, needsReviewWithoutSuggestion: review - reviewWithSuggestion, note: "category_id is empty in offline mode: ids come from the database" };
    writeReport(plan, summary);
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  const db = new PrismaClient();
  try {
    const catCsv = opt("categories-csv");
    if (catCsv) await compareCategoriesCsv(db, catCsv);

    if (flag("verify")) {
      const r = await verifyClassification(db);
      console.log(JSON.stringify(r, null, 2));
      process.exitCode = r.ok ? 0 : 1;
      return;
    }

    const rollback = opt("rollback");
    if (rollback) {
      const host = dbHost();
      if (!isLocal(host) && !flag("yes")) throw new Error(`Refusing to roll back on ${host} without --yes`);
      console.log(JSON.stringify(await rollbackRun(db, rollback), null, 2));
      return;
    }

    const { missing } = await loadCategories(db);
    if (missing.length) throw new Error(`Sections missing in the database (run the seed first): ${missing.join(", ")}`);

    const { items, stats } = await planClassification(db, { overrides: loadOverrides() });
    const summary = { mode: flag("apply") ? "apply" : "dry-run", classifierVersion: CLASSIFIER_VERSION, ...stats };
    writeReport(items, summary);
    console.log(JSON.stringify(summary, null, 2));

    if (!flag("apply")) {
      console.log("Dry run: nothing was written. Add --apply to save.");
      return;
    }
    const host = dbHost();
    if (!isLocal(host) && !flag("yes")) throw new Error(`Refusing to write to ${host} without --yes`);
    const runId = await applyPlan(db, items, stats);
    console.log(`Applied: run ${runId} (created ${stats.create}, updated ${stats.update}, unchanged ${stats.unchanged}, kept confirmed ${stats.keptConfirmed}).`);
    console.log(`Undo with: npm run catalog:classify -- --rollback ${runId}${isLocal(host) ? "" : " --yes"}`);
    const v = await verifyClassification(db);
    console.log(JSON.stringify(v, null, 2));
    if (!v.ok) process.exitCode = 1;
  } finally {
    await db.$disconnect();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});

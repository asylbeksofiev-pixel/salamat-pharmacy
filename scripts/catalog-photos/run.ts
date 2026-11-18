// Product photo pipeline for public.pharmacy_products. Runs on a workstation or CI — never inside a Vercel Function
// or a page request. See docs/catalog-photos.md.
//
//   npm run photos -- process [--ids 1,2,3 | --ids-file ids.txt] [--limit N] [--batch 50] [--concurrency 3]
//                             [--site-api https://…] [--inbox DIR] [--no-nct] [--restart] [--force] [--work-dir DIR]
//   npm run photos -- snapshot [--site-api https://…] [--work-dir DIR]
//   npm run photos -- report  [--work-dir DIR]
//   npm run photos -- publish --manifest DIR/manifest.csv --sources salamat,off --confirm-rights [--production] [--dry]
//
// process: reads products in batches (READ ONLY), looks for candidates, checks rights, downloads only permitted photos,
//          makes WebP/AVIF variants locally, decides approved / needs_review / missing. Never uploads, never writes to Neon.
//          Ctrl+C stops after the current products; the next run continues from the last finished id.
// report:  rebuilds manifest.csv / manifest.json / report.md from the results journal.
// publish: uploads the variants of rows marked "approved" (by the rules or by a reviewer in the CSV) to Vercel Blob
//          and stores only their URLs and metadata in catalog_images.
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import Papa from "papaparse";
import { classifyArticle } from "../../src/lib/catalog-photos/barcode";
import { describeAttributes, parseAttributes } from "../../src/lib/catalog-photos/attributes";
import { conflictingDuplicates, decide, sourceRank, type Candidate, type ProductRef, type ReviewStatus } from "../../src/lib/catalog-photos/match";
import { Http, HttpError } from "./http";
import { loadOriginal, processImage, type ProcessedImage, type VariantKey } from "./image";
import { DbReader, SiteApiReader, SnapshotReader, takeSnapshot, type ProductReader } from "./products";
import { SalamatInbox, lookupNct, lookupOpenFacts, type LookupContext } from "./sources";

// ---------------------------------------------------------------- options

const argv = process.argv.slice(2);
const command = argv[0];
const opt = (name: string) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const flag = (name: string) => argv.includes(`--${name}`);
const workDir = resolve(opt("work-dir") ?? ".photo-work");
const paths = {
  journal: join(workDir, "journal.jsonl"),
  results: join(workDir, "results.jsonl"),
  state: join(workDir, "state.json"),
  versions: join(workDir, "versions.json"),
  urlIndex: join(workDir, "url-index.json"),
  cache: join(workDir, "http-cache"),
  snapshot: join(workDir, "products.jsonl"),
};
const siteUrl = (process.env.APP_URL || "https://salamat-pharmacy.vercel.app").replace(/\/$/, "");
const userAgent = `SalamatCatalogPhotos/1.0 (+${process.env.PHOTO_BOT_CONTACT || siteUrl})`;

// ---------------------------------------------------------------- manifest row

export interface ResultRow {
  product_id: string;
  article: string;
  name: string;
  image_url: string;
  source_page: string;
  source_name: string;
  license_or_permission: string;
  attribution: string;
  match_method: string;
  confidence: number;
  review_status: ReviewStatus;
  checked_at: string;
  reasons: string;
  article_kind: string;
  candidate_name: string;
  candidate_barcode: string;
  candidate_manufacturer: string;
  candidate_form: string;
  candidate_dosage: string;
  candidate_volume: string;
  candidate_pack: string;
  product_attributes: string;
  candidate_attributes: string;
  original_image_url: string;
  image_sha256: string;
  image_width: number | "";
  image_height: number | "";
  original_bytes: number | "";
  variant_bytes: string;
  blob_prefix: string;
  image_version: number | "";
  local_preview: string;
  source_code: string;
  other_candidates: string;
}

const MANIFEST_COLUMNS: (keyof ResultRow)[] = [
  "product_id", "article", "name", "image_url", "source_page", "source_name", "license_or_permission", "attribution",
  "match_method", "confidence", "review_status", "checked_at", "reasons", "article_kind", "candidate_name", "candidate_barcode",
  "candidate_manufacturer", "candidate_form", "candidate_dosage", "candidate_volume", "candidate_pack", "product_attributes",
  "candidate_attributes", "original_image_url", "image_sha256", "image_width", "image_height", "original_bytes", "variant_bytes",
  "blob_prefix", "image_version", "local_preview", "source_code", "other_candidates",
];

// ---------------------------------------------------------------- small persistent stores

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}

async function readResults(): Promise<Map<string, ResultRow>> {
  const out = new Map<string, ResultRow>();
  if (!existsSync(paths.results)) return out;
  for (const line of (await readFile(paths.results, "utf8")).split("\n")) {
    if (!line.trim()) continue;
    const r = JSON.parse(line) as ResultRow;
    out.set(r.product_id, r); // the latest line for a product wins
  }
  return out;
}

const runId = new Date().toISOString().replace(/[:.]/g, "-");
async function journal(event: Record<string, unknown>) {
  await appendFile(paths.journal, JSON.stringify({ ts: new Date().toISOString(), run: runId, ...event }) + "\n");
}

// ---------------------------------------------------------------- process

interface Ctx {
  http: Http;
  inbox: SalamatInbox;
  useNct: boolean;
  duplicates: Map<string, ProductRef[]>;
  versions: Record<string, { sha256: string; version: number }>;
  urlIndex: Record<string, string>;
  images: Map<string, ProcessedImage>;
}

function blobPrefix(productId: string, version: number) {
  return `catalog/products/${productId}/v${version}`;
}

async function processProduct(product: ProductRef, ctx: Ctx): Promise<ResultRow> {
  const article = classifyArticle(product.article);
  const lc: LookupContext = { http: ctx.http, product, article };
  const candidates: Candidate[] = [];
  const lookupErrors: string[] = [];
  const own = ctx.inbox.lookup(lc);
  if (own) candidates.push(own);
  else {
    try {
      candidates.push(...(await lookupOpenFacts(lc)));
    } catch (e) {
      lookupErrors.push(`openfacts_unavailable:${(e as Error).message}`);
    }
    // NCT is asked only when no reusable photo was found: its photos need the rights holder's permission anyway.
    const reusable = candidates.some((c) => c.rights.reuseAllowed && c.imageUrl);
    if (ctx.useNct && !reusable) {
      try {
        candidates.push(...(await lookupNct(lc)));
      } catch (e) {
        lookupErrors.push(`nct_unavailable:${(e as Error).message}`);
      }
    }
  }
  const sameArticle = ctx.duplicates.get(article.raw) ?? [];
  const dupConflicts = conflictingDuplicates(product, sameArticle);

  // Pick the best candidate: what the rules would accept first, then source priority, then confidence.
  const statusRank: Record<ReviewStatus, number> = { approved: 0, needs_review: 1, rejected: 2, missing: 3 };
  const ranked = candidates
    .map((c) => ({ c, d: decide({ product, candidate: c, image: { ok: true, errors: [], warnings: [] }, conflictingDuplicates: dupConflicts }) }))
    .sort((a, b) => statusRank[a.d.reviewStatus] - statusRank[b.d.reviewStatus] || sourceRank(a.c) - sourceRank(b.c) || b.d.confidence - a.d.confidence);
  const best = ranked[0]?.c ?? null;

  // Download only photos whose reuse is permitted.
  let processed: ProcessedImage | null = null;
  let imageError: string | null = null;
  if (best?.imageUrl && best.rights.reuseAllowed) {
    try {
      const knownSha = ctx.urlIndex[best.imageUrl];
      processed = knownSha ? (ctx.images.get(knownSha) ?? null) : null;
      if (!processed) {
        const { bytes, contentType } = await loadOriginal(best.imageUrl, ctx.http);
        processed = await processImage(bytes, contentType, workDir);
        if (processed.check.sha256) {
          ctx.urlIndex[best.imageUrl] = processed.check.sha256;
          ctx.images.set(processed.check.sha256, processed);
        }
      }
    } catch (e) {
      imageError = (e as { code?: string }).code ?? (e instanceof HttpError ? "unavailable" : "download_failed");
    }
  }
  const image = processed?.check ?? (imageError ? { ok: false, errors: [imageError], warnings: [] } : null);
  const decision = decide({ product, candidate: best, image, conflictingDuplicates: dupConflicts });
  if (!best && lookupErrors.length) decision.reasons.push(...lookupErrors);

  let version: number | "" = "";
  if (processed?.check.ok && processed.check.sha256) {
    const prev = ctx.versions[product.id];
    version = prev ? (prev.sha256 === processed.check.sha256 ? prev.version : prev.version + 1) : 1;
    ctx.versions[product.id] = { sha256: processed.check.sha256, version };
  }
  const ca = best ? parseAttributes([best.name, best.details].filter(Boolean).join(" ")) : null;
  const vb = processed ? Object.fromEntries(Object.entries(processed.variants).map(([k, v]) => [k, v!.bytes])) : {};
  return {
    product_id: product.id,
    article: product.article ?? "",
    name: product.name,
    image_url: "",
    source_page: best?.sourcePage ?? "",
    source_name: best?.rights.sourceName ?? "",
    license_or_permission: best?.rights.license ?? "",
    attribution: best?.rights.attribution ?? "",
    match_method: decision.matchMethod,
    confidence: decision.confidence,
    review_status: decision.reviewStatus,
    checked_at: new Date().toISOString(),
    reasons: decision.reasons.join("; "),
    article_kind: article.kind,
    candidate_name: best?.name ?? "",
    candidate_barcode: best?.barcode ?? "",
    candidate_manufacturer: best?.manufacturer ?? "",
    candidate_form: ca?.forms.join("/") ?? "",
    candidate_dosage: ca?.dosages.join("+") ?? "",
    candidate_volume: ca?.contents.join(", ") ?? "",
    candidate_pack: ca?.counts.join("/") ?? "",
    product_attributes: decision.productAttributes,
    candidate_attributes: decision.candidateAttributes,
    original_image_url: best?.imageUrl ?? "",
    image_sha256: processed?.check.sha256 ?? "",
    image_width: processed?.check.width ?? "",
    image_height: processed?.check.height ?? "",
    original_bytes: processed?.originalBytes ?? "",
    variant_bytes: JSON.stringify(vb),
    blob_prefix: version ? blobPrefix(product.id, version) : "",
    image_version: version,
    local_preview: processed?.variants["800.webp" as VariantKey]?.path ?? "",
    source_code: best?.rights.source ?? "",
    other_candidates: ranked
      .slice(1)
      .map(({ c, d }) => `${c.rights.source}:${d.reviewStatus}:${c.sourcePage}`)
      .join(" | "),
  };
}

async function pool<T>(items: T[], size: number, fn: (t: T) => Promise<void>, stop: () => boolean) {
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (i < items.length && !stop()) await fn(items[i++]);
    }),
  );
}

async function runProcess() {
  await mkdir(workDir, { recursive: true });
  const http = new Http({ userAgent, cacheDir: paths.cache, log: (e) => void journal(e) });
  const dbUrl = process.env.PHOTOS_DATABASE_URL || process.env.DATABASE_URL;
  const siteApi = opt("site-api");
  const productsFile = opt("products-file") ?? (existsSync(paths.snapshot) && !dbUrl ? paths.snapshot : undefined);
  const reader: ProductReader = productsFile
    ? new SnapshotReader(productsFile)
    : siteApi
      ? new SiteApiReader(siteApi.replace(/\/$/, ""), http)
      : dbUrl
        ? new DbReader(dbUrl)
        : (() => {
            throw new Error("Set DATABASE_URL (read-only access is enough), run `snapshot` first, or pass --site-api for an --ids sample");
          })();
  const ctx: Ctx = {
    http,
    inbox: await SalamatInbox.load(opt("inbox") ?? process.env.PHOTOS_INBOX_DIR ?? null),
    useNct: !flag("no-nct"),
    duplicates: await reader.duplicates(),
    versions: await readJson(paths.versions, {}),
    urlIndex: await readJson(paths.urlIndex, {}),
    images: new Map(),
  };
  const done = await readResults();
  const state = flag("restart") ? { lastId: "0", processed: 0 } : await readJson(paths.state, { lastId: "0", processed: 0 });
  const limit = Number(opt("limit") ?? Infinity);
  const batchSize = Math.min(200, Number(opt("batch") ?? 50));
  const concurrency = Math.min(4, Number(opt("concurrency") ?? 3));
  let stopping = false;
  process.on("SIGINT", () => {
    if (stopping) process.exit(130);
    stopping = true;
    console.log("\nОстанавливаюсь после текущих товаров… (повторный Ctrl+C — немедленно)");
  });

  const idsArg = opt("ids") ?? (opt("ids-file") ? (await readFile(opt("ids-file")!, "utf8")).split(/[\s,]+/).join(",") : undefined);
  const ids = idsArg?.split(",").map((s) => s.trim()).filter(Boolean);
  await journal({ event: "run_start", mode: ids ? "ids" : "batches", lastId: state.lastId, total: await reader.total().catch(() => null) });

  let processedNow = 0;
  const handle = async (p: ProductRef) => {
    // Finished products are skipped on resume; those that hit an unavailable source are tried again.
    const prev = done.get(p.id);
    if (!flag("force") && prev && !/_unavailable/.test(prev.reasons)) return;
    try {
      const row = await processProduct(p, ctx);
      await appendFile(paths.results, JSON.stringify(row) + "\n");
      done.set(p.id, row);
      await journal({ event: "product", product_id: p.id, status: row.review_status, method: row.match_method, source: row.source_code, reasons: row.reasons });
      processedNow++;
      console.log(`${p.id.padStart(6)}  ${row.review_status.padEnd(12)} ${row.source_code.padEnd(8)} ${p.name.slice(0, 70)}`);
    } catch (e) {
      // Unexpected failure: logged, the product stays unprocessed and is retried on the next run.
      await journal({ event: "error", product_id: p.id, error: String((e as Error).stack ?? e).slice(0, 500) });
      console.error(`${p.id}: ${(e as Error).message}`);
    }
  };

  try {
    if (ids) {
      const products = await reader.byIds(ids);
      await pool(products.slice(0, limit), concurrency, handle, () => stopping);
    } else {
      let after = BigInt(state.lastId);
      while (!stopping && processedNow < limit) {
        const batch = await reader.batch(after, batchSize);
        if (!batch.length) break;
        // With --limit only part of the last batch may be taken; the checkpoint moves to the last product actually taken.
        const slice = batch.slice(0, Math.max(0, limit - processedNow));
        await pool(slice, concurrency, handle, () => stopping);
        if (stopping) break; // unfinished products of this batch are retried next time (finished ones are skipped)
        after = BigInt(slice[slice.length - 1].id);
        state.lastId = after.toString();
        state.processed = done.size;
        await writeFile(paths.state, JSON.stringify({ ...state, updatedAt: new Date().toISOString() }, null, 2));
        await writeFile(paths.versions, JSON.stringify(ctx.versions));
        await writeFile(paths.urlIndex, JSON.stringify(ctx.urlIndex));
      }
    }
  } finally {
    await writeFile(paths.versions, JSON.stringify(ctx.versions));
    await writeFile(paths.urlIndex, JSON.stringify(ctx.urlIndex));
    await journal({ event: "run_end", processed: processedNow, http: http.summary(), stopped: stopping });
    await reader.close();
  }
  console.log(`\nОбработано в этом запуске: ${processedNow}. Всего в журнале: ${done.size}.`);
  await runReport();
}

// ---------------------------------------------------------------- report

function sharedImageConflicts(rows: ResultRow[]) {
  // The same photo file for products whose characteristics differ is a sign of a wrong match: send all of them to review.
  const bySha = new Map<string, ResultRow[]>();
  for (const r of rows) if (r.image_sha256) bySha.set(r.image_sha256, [...(bySha.get(r.image_sha256) ?? []), r]);
  for (const group of bySha.values()) {
    if (group.length < 2) continue;
    const kinds = new Set(group.map((r) => describeAttributes(parseAttributes(r.name))));
    if (kinds.size < 2) continue;
    for (const r of group) {
      if (r.match_method === "assigned_by_salamat") continue;
      if (r.review_status === "approved") r.review_status = "needs_review";
      if (!r.reasons.includes("same_image_for_different_products")) r.reasons = [r.reasons, "same_image_for_different_products"].filter(Boolean).join("; ");
    }
  }
}

/** One source card picked for several products with different names (e.g. flavours of one line): say so to the reviewer. */
function sharedCandidateConflicts(rows: ResultRow[]) {
  const byPage = new Map<string, ResultRow[]>();
  for (const r of rows) if (r.source_page && r.match_method !== "assigned_by_salamat") byPage.set(r.source_page, [...(byPage.get(r.source_page) ?? []), r]);
  for (const group of byPage.values()) {
    if (new Set(group.map((r) => r.name.trim().toLowerCase())).size < 2) continue;
    for (const r of group) {
      if (r.review_status === "approved") r.review_status = "needs_review";
      if (!r.reasons.includes("same_candidate_for_different_products")) r.reasons = [r.reasons, "same_candidate_for_different_products"].filter(Boolean).join("; ");
    }
  }
}

const pct = (a: number, b: number) => (b ? `${((a / b) * 100).toFixed(1)} %` : "—");
const kb = (n: number) => `${(n / 1024).toFixed(1)} КБ`;

async function runReport() {
  const rows = [...(await readResults()).values()].sort((a, b) => Number(a.product_id) - Number(b.product_id));
  sharedImageConflicts(rows);
  sharedCandidateConflicts(rows);
  await writeFile(join(workDir, "manifest.json"), JSON.stringify(rows.map((r) => Object.fromEntries(MANIFEST_COLUMNS.map((c) => [c, r[c]]))), null, 2));
  await writeFile(join(workDir, "manifest.csv"), "﻿" + Papa.unparse(rows, { columns: MANIFEST_COLUMNS }));

  const by = <K extends string>(f: (r: ResultRow) => K) => rows.reduce((m, r) => m.set(f(r), (m.get(f(r)) ?? 0) + 1), new Map<K, number>());
  const status = by((r) => r.review_status);
  const reasons = new Map<string, number>();
  for (const r of rows) for (const x of r.reasons.split("; ").filter(Boolean)) {
    const k = x.replace(/:.*$/, "");
    reasons.set(k, (reasons.get(k) ?? 0) + 1);
  }
  const withImg = rows.filter((r) => r.variant_bytes && r.variant_bytes !== "{}");
  const sumVar = (k: string) => withImg.reduce((s, r) => s + (JSON.parse(r.variant_bytes)[k] ?? 0), 0);
  const variantKeys = ["400.webp", "800.webp", "400.avif", "800.avif"];
  const avgSet = withImg.length ? variantKeys.reduce((s, k) => s + sumVar(k), 0) / withImg.length : 0;
  const table = (m: Map<string, number>) => [...m].sort((a, b) => b[1] - a[1]).map(([k, v]) => `| ${k} | ${v} | ${pct(v, rows.length)} |`).join("\n");
  const examples = (st: ReviewStatus, n: number) =>
    rows
      .filter((r) => r.review_status === st)
      .slice(0, n)
      .map((r) => `| ${r.product_id} | ${r.article} | ${r.name.replace(/\|/g, "/")} | ${r.candidate_name.replace(/\|/g, "/").slice(0, 80)} | ${r.source_name} | ${r.match_method} | ${r.confidence} | ${r.reasons.replace(/\|/g, "/").slice(0, 160)} |`)
      .join("\n");
  const md = `# Фото товаров — отчёт

Сформирован: ${new Date().toISOString()} · товаров в журнале: ${rows.length}

## Итог

| Статус | Товаров | Доля |
|---|---|---|
${table(status)}

## Формат артикула

| Вид | Товаров | Доля |
|---|---|---|
${table(by((r) => r.article_kind))}

## Источник выбранного кандидата

| Источник | Товаров | Доля |
|---|---|---|
${table(by((r) => r.source_name || "— (нет кандидата)"))}

## Причины (одна строка может иметь несколько)

| Причина | Товаров | Доля |
|---|---|---|
${table(reasons)}

## Изображения

* Скачано и обработано: ${withImg.length}
* Средний размер вариантов: ${variantKeys.map((k) => `${k} — ${kb(withImg.length ? sumVar(k) / withImg.length : 0)}`).join(", ")}
* Средний комплект из 4 файлов на товар: ${kb(avgSet)}

## Примеры: принято автоматически

| id | Артикул | Название | Кандидат | Источник | Метод | Уверенность | Замечания |
|---|---|---|---|---|---|---|---|
${examples("approved", 15)}

## Примеры: на ручную проверку

| id | Артикул | Название | Кандидат | Источник | Метод | Уверенность | Причины |
|---|---|---|---|---|---|---|---|
${examples("needs_review", 20)}
`;
  await writeFile(join(workDir, "report.md"), md);
  console.log(`Манифест: ${join(workDir, "manifest.csv")}\nОтчёт: ${join(workDir, "report.md")}`);
  console.log([...status].map(([k, v]) => `${k}: ${v}`).join(", "));
}

// ---------------------------------------------------------------- publish

async function runPublish() {
  const manifestPath = opt("manifest") ?? join(workDir, "manifest.csv");
  const sources = (opt("sources") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!flag("confirm-rights") || !sources.length) {
    throw new Error("publish требует --sources (какие источники проверены, например salamat,off) и --confirm-rights (права на фото проверены человеком)");
  }
  const dbUrl = process.env.PHOTOS_DATABASE_URL || process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("Нужен DATABASE_URL базы сайта (запись только в catalog_images)");
  const host = new URL(dbUrl).hostname;
  const local = ["localhost", "127.0.0.1", "::1"].includes(host);
  if (!local && !flag("production")) throw new Error(`База ${host} не локальная. Для production добавьте --production после проверки прав и сопоставлений.`);
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  const dry = flag("dry");
  if (!token && !dry) throw new Error("Нужен BLOB_READ_WRITE_TOKEN (Vercel → Storage → Blob → .env.local)");

  const csv = (await readFile(manifestPath, "utf8")).replace(/^﻿/, "");
  const rows = Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: true }).data;
  const todo = rows.filter((r) => r.review_status === "approved" && sources.includes(r.source_code) && r.image_sha256 && r.blob_prefix);
  console.log(`К публикации: ${todo.length} из ${rows.length} (статус approved, источники ${sources.join(", ")})`);
  if (dry) {
    for (const r of todo.slice(0, 20)) console.log(`  ${r.product_id} → ${r.blob_prefix}-800.webp (${r.source_name}, ${r.license_or_permission})`);
    return;
  }
  const { put, head } = await import("@vercel/blob");
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
  const types: Record<string, string> = { webp: "image/webp", avif: "image/avif" };
  const results = await readResults();
  let ok = 0;
  try {
    for (const r of todo) {
      const dir = join(workDir, "images", r.image_sha256.slice(0, 2), r.image_sha256);
      const urls: Record<string, string> = {};
      for (const key of ["400.webp", "800.webp", "400.avif", "800.avif"]) {
        // Predictable name: catalog/products/<product id>/v<image version>-<width>.<format>
        const pathname = `${r.blob_prefix}-${key}`;
        const body = await readFile(join(dir, key));
        try {
          urls[key] = (await put(pathname, body, { access: "public", addRandomSuffix: false, allowOverwrite: false, contentType: types[key.split(".")[1]], cacheControlMaxAge: 31_536_000, token })).url;
        } catch (e) {
          // Re-run after an interruption: the object is already there (names are versioned, content is the same).
          if (!/already exists/i.test((e as Error).message)) throw e;
          urls[key] = (await head(pathname, { token })).url;
        }
      }
      // Local inbox files: keep only the file name, never a path from the operator's computer.
      const sourceUrl = /^https:\/\//.test(r.source_page) ? r.source_page : `inbox:${basename(r.source_page)}`;
      await prisma.$executeRaw`
        INSERT INTO catalog_images (product_id, barcode, photo_url, photo_source, photo_source_url, photo_license, attribution, source_name,
                                    review_status, match_method, confidence, image_version, image_sha256, image_width, image_height, checked_at)
        VALUES (${BigInt(r.product_id)}, ${r.article || null}, ${urls["800.webp"]}, ${r.source_name}, ${sourceUrl}, ${r.license_or_permission},
                ${r.attribution || null}, ${r.candidate_manufacturer || null}, 'approved', ${r.match_method}, ${Number(r.confidence)},
                ${Number(r.image_version)}, ${r.image_sha256}, ${Number(r.image_width) || null}, ${Number(r.image_height) || null}, ${new Date(r.checked_at)})
        ON CONFLICT (product_id) DO UPDATE SET barcode = EXCLUDED.barcode, photo_url = EXCLUDED.photo_url, photo_source = EXCLUDED.photo_source,
          photo_source_url = EXCLUDED.photo_source_url, photo_license = EXCLUDED.photo_license, attribution = EXCLUDED.attribution,
          source_name = EXCLUDED.source_name, review_status = 'approved', match_method = EXCLUDED.match_method, confidence = EXCLUDED.confidence,
          image_version = EXCLUDED.image_version, image_sha256 = EXCLUDED.image_sha256, image_width = EXCLUDED.image_width,
          image_height = EXCLUDED.image_height, checked_at = EXCLUDED.checked_at`;
      await journal({ event: "published", product_id: r.product_id, url: urls["800.webp"] });
      // Record the public URL so that the rebuilt manifest shows it in image_url.
      const latest = results.get(r.product_id);
      if (latest) await appendFile(paths.results, JSON.stringify({ ...latest, review_status: "approved", image_url: urls["800.webp"] }) + "\n");
      ok++;
    }
  } finally {
    await prisma.$disconnect();
  }
  console.log(`Опубликовано: ${ok}`);
  await runReport();
}

// ---------------------------------------------------------------- main

// ---------------------------------------------------------------- snapshot

/** Copies the production catalogue (id, article, name) through the site's public read-only API into products.jsonl. */
async function runSnapshot() {
  const base = (opt("site-api") ?? siteUrl).replace(/\/$/, "");
  const http = new Http({ userAgent });
  console.log(`Читаю каталог: ${base}/api/catalog/items`);
  const meta = await takeSnapshot(base, http, paths.snapshot, (m) => console.log(m));
  await writeFile(join(workDir, "snapshot.json"), JSON.stringify(meta, null, 2));
  await journal({ event: "snapshot", ...meta });
  console.log(JSON.stringify(meta, null, 2));
}

const commands: Record<string, () => Promise<void>> = { snapshot: runSnapshot, process: runProcess, report: runReport, publish: runPublish };
if (!commands[command]) {
  console.error("Команды: process | report | publish (см. docs/catalog-photos.md)");
  process.exit(2);
}
mkdir(workDir, { recursive: true })
  .then(() => commands[command]())
  .catch((e) => {
    console.error(e.message ?? e);
    process.exit(1);
  });

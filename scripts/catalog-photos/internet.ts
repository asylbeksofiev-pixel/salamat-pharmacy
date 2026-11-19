// Photos for products that still have no image_url — only from sources whose terms allow reuse. Runs on a workstation or
// CI, never inside a Vercel Function or a page request. See docs/catalog-photos-internet.md.
//
//   npm run photos:snapshot                         copy of the catalogue (public API or DATABASE_URL), read only
//   npm run photos:fetch-sources                    official Open Facts data exports (once a day at most)
//   npm run photos:discover  [--limit N] [--offset N] [--batch-size 500] [--resume] [--product-id 1,2]
//   npm run photos:validate  [--limit N] [--concurrency 3] [--resume] [--product-id …] [--confirmed-only]
//   npm run photos:review-export                    CSVs for people (confirmed, probable for review, failed, remaining)
//   npm run photos:apply-review FILE                product_id,decision(approve|reject),note — a person's decisions
//   npm run photos:publish   --dry-run | --confirm  [--confirmed-only] [--limit N] [--product-id …] [--from-review FILE]
//                            [--run-id ID] [--allow-unreviewed] [--no-audit]   (approved photos only, unless --allow-unreviewed)
//   npm run photos:rollback  --run-id RUN (--dry-run | --confirm) [--delete-files]
//   npm run photos:report
//
// Work folder .photo-work/internet: snapshot, exports, results.jsonl (one line per product and stage, the latest
// wins), validated files, journal. Nothing binary goes to Git or Neon: files go to Vercel Blob
// (products/{product_id}/{sha256}.{ext}); Neon receives the public URL, an audit row per product
// (catalog_photo_results) and a change log per run (catalog_photo_changes) that allows rolling back one run.
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { createWriteStream, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, resolve, basename } from "node:path";
import { createGunzip } from "node:zlib";
import { createInterface } from "node:readline";
import { Readable } from "node:stream";
import Papa from "papaparse";
import sharp, { type Metadata } from "sharp";
import { createRequire } from "node:module";
import { Http } from "./http";
import { takeSnapshot, SnapshotReader } from "./products";
import { OPEN_FACTS_LICENSE, OPEN_FACTS_SITES, asCard, loadOpenFactsExport, type OpenFactsProduct } from "./openfacts";
import { classifyArticle } from "../../src/lib/catalog-photos/barcode";
import { assessNctCard, GRADE_ORDER, type NctAssessment } from "../../src/lib/catalog-photos/nct-match";
import type { ProductRef } from "../../src/lib/catalog-photos/product";
import { blobPathname, isBlobProductPhoto } from "../../src/lib/catalog-photos/blob-url";
import { isOpenFactsPhotoUrl } from "../../src/lib/catalog-photos/photo-hosts";

// ---------------------------------------------------------------- options

const argv = process.argv.slice(2);
const command = argv[0];
const opt = (name: string) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const flag = (name: string) => argv.includes(`--${name}`);
const num = (name: string, fallback: number) => (opt(name) !== undefined ? Number(opt(name)) : fallback);

const workDir = resolve(opt("work-dir") ?? ".photo-work/internet");
const paths = {
  snapshot: join(workDir, "products.jsonl"),
  snapshotMeta: join(workDir, "snapshot.json"),
  dumps: join(workDir, "dumps"),
  results: join(workDir, "results.jsonl"),
  state: join(workDir, "state.json"),
  journal: join(workDir, "journal.jsonl"),
  files: join(workDir, "files"),
  review: resolve(opt("review-dir") ?? "data/catalog-photos-internet"),
};
const siteUrl = (process.env.APP_URL || "https://salamat-pharmacy.vercel.app").replace(/\/$/, "");
const userAgent = `SalamatCatalogPhotos/1.1 (+${process.env.PHOTO_BOT_CONTACT || siteUrl})`;
const dbUrl = () => process.env.PHOTOS_DATABASE_URL || process.env.DATABASE_URL || "";

async function journal(event: Record<string, unknown>) {
  await mkdir(workDir, { recursive: true });
  await appendFile(paths.journal, JSON.stringify({ ts: new Date().toISOString(), ...event }) + "\n");
}

async function readJsonl<T>(file: string): Promise<T[]> {
  if (!existsSync(file)) return [];
  return (await readFile(file, "utf8"))
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as T);
}

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}

/** Products without a photo: NULLIF(BTRIM(image_url), '') IS NULL — the only ones this pipeline may touch. */
const hasNoImage = (p: { imageUrl?: string | null }) => !(p.imageUrl ?? "").trim();

// ---------------------------------------------------------------- result rows (audit)

export type MatchStatus = "confirmed" | "probable" | "doubtful" | "no_match";
export type RightsStatus = "licensed_cc_by_sa" | "permission_granted" | "permission_required" | "not_applicable";
export type ReviewStatus = "auto" | "approved" | "rejected" | "published" | "rolled_back";

export interface CandidateSummary {
  source: string;
  page: string;
  image: string | null;
  name: string;
  quantity: string;
  status: MatchStatus;
  reasons: string[];
}

export interface PhotoResult {
  product_id: string;
  article: string;
  product_name: string;
  category: string | null;
  match_status: MatchStatus;
  match_method: string;
  confidence: number;
  source_name: string;
  source_page_url: string;
  source_image_url: string;
  stored_image_url: string;
  source_license: string;
  rights_status: RightsStatus;
  attribution: string;
  manufacturer: string;
  detected_gtin: string;
  width: number | null;
  height: number | null;
  file_size: number | null;
  sha256: string;
  stored_ext: string;
  local_file: string;
  review_status: ReviewStatus;
  reason: string;
  error: string;
  candidates: CandidateSummary[];
  stage: "discovered" | "validated" | "published";
  checked_at: string;
  validated_at: string | null;
  published_at: string | null;
  run_id: string | null;
  /** How the published photo is served: a file in SALAMAT's Vercel Blob store, or the source's own public URL. */
  storage?: Storage_ | "";
  /** The value written into pharmacy_products.image_url (Blob URL or the source URL). */
  published_image_url?: string;
  /** Check of the source URL right before an external-URL publication (verify-external). */
  source_sha256?: string;
  source_bytes?: number | null;
  source_content_type?: string;
  source_width?: number | null;
  source_height?: number | null;
  source_checked_at?: string | null;
  source_check_error?: string;
}

export type Storage_ = "vercel_blob" | "external_url";

async function readResults(): Promise<Map<string, PhotoResult>> {
  const out = new Map<string, PhotoResult>();
  for (const r of await readJsonl<PhotoResult>(paths.results)) out.set(r.product_id, r);
  return out;
}

async function writeResults(rows: PhotoResult[]) {
  if (!rows.length) return;
  await appendFile(paths.results, rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
}

const STATUS_OF: Record<string, MatchStatus> = { confirmed: "confirmed", probable: "probable", doubtful: "doubtful", mismatch: "no_match", unrelated: "no_match" };

// ---------------------------------------------------------------- snapshot

async function runSnapshot() {
  await mkdir(workDir, { recursive: true });
  const base = (opt("site-api") ?? siteUrl).replace(/\/$/, "");
  const http = new Http({ userAgent });
  console.log(`Читаю каталог: ${base}/api/catalog/items`);
  const meta = await takeSnapshot(base, http, paths.snapshot, (m) => console.log(m));
  const rows = await readJsonl<ProductRef>(paths.snapshot);
  const withImage = rows.filter((r) => !hasNoImage(r)).length;
  const full = { ...meta, withImage, withoutImage: rows.length - withImage };
  await writeFile(paths.snapshotMeta, JSON.stringify(full, null, 2));
  await journal({ event: "snapshot", ...full });
  console.log(JSON.stringify(full, null, 2));
}

/** Target products, ordered by id: from Neon (READ ONLY) when DATABASE_URL is set, otherwise from the snapshot. */
async function targetProducts(): Promise<ProductRef[]> {
  let rows: ProductRef[];
  if (dbUrl() && !flag("from-snapshot")) {
    const { PrismaClient } = await import("@prisma/client");
    const prisma = new PrismaClient({ datasources: { db: { url: dbUrl() } } });
    try {
      rows = await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
        return tx.$queryRaw<ProductRef[]>`
          SELECT p.id::text AS id, p.article, coalesce(p.name, '') AS name, p.image_url AS "imageUrl"
          FROM public.pharmacy_products p
          WHERE NULLIF(BTRIM(p.image_url), '') IS NULL
          ORDER BY p.id`;
      });
    } finally {
      await prisma.$disconnect();
    }
  } else {
    if (!existsSync(paths.snapshot)) throw new Error("Нет DATABASE_URL и нет снимка каталога: выполните `npm run photos:snapshot`");
    rows = (await new SnapshotReader(paths.snapshot).batch(BigInt(0), Number.MAX_SAFE_INTEGER)).filter(hasNoImage);
  }
  const ids = opt("product-id")?.split(",").map((s) => s.trim());
  if (ids) rows = rows.filter((r) => ids.includes(r.id));
  rows = rows.slice(num("offset", 0));
  return Number.isFinite(num("limit", Infinity)) ? rows.slice(0, num("limit", Infinity)) : rows;
}

// ---------------------------------------------------------------- sources: official exports

/** Downloads the Open Facts exports; Open Food Facts (≈1 GB) is filtered on the fly to the barcodes of the target. */
async function runFetchSources() {
  await mkdir(paths.dumps, { recursive: true });
  const products = await targetProducts();
  const wanted = new Set(products.map((p) => classifyArticle(p.article)).filter((a) => a.kind === "gtin").map((a) => a.gtin14!.replace(/^0+/, "")));
  for (const site of OPEN_FACTS_SITES) {
    const url = `https://${site.host}/data/en.${site.host.replace(/^world\./, "")}.products.csv.gz`;
    const target = join(paths.dumps, site.code === "off" ? "off-matches.tsv" : `${site.code}.products.csv.gz`);
    console.log(`${site.name}: ${url}`);
    const res = await fetch(url, { headers: { "User-Agent": userAgent }, redirect: "follow" });
    if (!res.ok || !res.body) throw new Error(`${site.name}: HTTP ${res.status}`);
    const body = Readable.fromWeb(res.body as never);
    if (site.code !== "off") {
      await new Promise<void>((ok, fail) => body.pipe(createWriteStream(target)).on("finish", ok).on("error", fail));
      continue;
    }
    // Open Food Facts: keep only the header and the rows of our barcodes.
    const out = createWriteStream(target);
    let header = true;
    let kept = 0;
    for await (const line of createInterface({ input: body.pipe(createGunzip()), crlfDelay: Infinity })) {
      if (header || wanted.has((line.slice(0, line.indexOf("\t")) || "").replace(/^0+/, ""))) {
        out.write(line + "\n");
        if (!header) kept++;
        header = false;
      }
    }
    out.end();
    console.log(`  оставлено строк: ${kept}`);
  }
  await journal({ event: "fetch_sources", target: products.length });
}

async function loadSources(products: ProductRef[]): Promise<Map<string, OpenFactsProduct[]>> {
  const wanted = new Set(products.map((p) => classifyArticle(p.article)).filter((a) => a.kind === "gtin").map((a) => a.gtin14!.replace(/^0+/, "")));
  const byCode = new Map<string, OpenFactsProduct[]>();
  for (const site of OPEN_FACTS_SITES) {
    const file = join(paths.dumps, site.code === "off" ? "off-matches.tsv" : `${site.code}.products.csv.gz`);
    const legacy = join(paths.dumps, `en.${site.host.replace(/^world\./, "")}.products.csv.gz`);
    const rows = await loadOpenFactsExport(existsSync(file) ? file : legacy, site, wanted);
    for (const r of rows) {
      const k = r.code.replace(/^0+/, "");
      byCode.set(k, [...(byCode.get(k) ?? []), r]);
    }
    console.log(`${site.name}: ${rows.length} совпадений по штрихкоду`);
  }
  return byCode;
}

// ---------------------------------------------------------------- discover

function summarize(a: NctAssessment, p: OpenFactsProduct): CandidateSummary {
  return { source: p.site.code, page: p.pageUrl, image: p.imageUrl, name: p.name, quantity: p.quantity, status: STATUS_OF[a.grade], reasons: a.reasons };
}

export function discoverOne(product: ProductRef, sources: Map<string, OpenFactsProduct[]>, sharedConflicts: number): PhotoResult {
  const art = classifyArticle(product.article);
  const base: PhotoResult = {
    product_id: product.id,
    article: (product.article ?? "").trim(),
    product_name: product.name,
    category: product.category ?? null,
    match_status: "no_match",
    match_method: "none",
    confidence: 0,
    source_name: "",
    source_page_url: "",
    source_image_url: "",
    stored_image_url: "",
    source_license: "",
    rights_status: "not_applicable",
    attribution: "",
    manufacturer: "",
    detected_gtin: "",
    width: null,
    height: null,
    file_size: null,
    sha256: "",
    stored_ext: "",
    local_file: "",
    review_status: "auto",
    reason: art.kind === "gtin" ? "no_candidate_in_licensed_sources" : `article_${art.kind}`,
    error: "",
    candidates: [],
    stage: "discovered",
    checked_at: new Date().toISOString(),
    validated_at: null,
    published_at: null,
    run_id: null,
  };
  if (art.kind !== "gtin") return base;
  const found = sources.get(art.gtin14!.replace(/^0+/, "")) ?? [];
  const graded = found
    .map((p, i) => ({ p, a: assessNctCard(product, asCard(p, i + 1), sharedConflicts) }))
    // A candidate without a photo is useless here; among equals the photo wins.
    .sort((x, y) => GRADE_ORDER[x.a.grade] - GRADE_ORDER[y.a.grade] || Number(!!y.p.imageUrl) - Number(!!x.p.imageUrl) || y.a.score - x.a.score);
  const candidates = graded.map(({ p, a }) => summarize(a, p));
  const best = graded.find((g) => g.p.imageUrl) ?? graded[0];
  if (!best) return base;
  const status: MatchStatus = best.p.imageUrl ? STATUS_OF[best.a.grade] : "no_match";
  return {
    ...base,
    match_status: status,
    match_method: best.a.method,
    // Score → 0…1: an identical barcode starts at 0.6; names, characteristics and brand add the rest.
    confidence: Math.max(0, Math.min(1, Math.round((best.a.score / 180) * 100) / 100)),
    source_name: best.p.site.name,
    source_page_url: best.p.pageUrl,
    source_image_url: best.p.imageUrl ?? "",
    source_license: OPEN_FACTS_LICENSE,
    rights_status: "licensed_cc_by_sa",
    attribution: `${best.p.site.name} contributors`,
    manufacturer: best.p.brands,
    detected_gtin: best.p.code,
    reason: [best.p.imageUrl ? "" : "source_has_no_photo", ...best.a.reasons].filter(Boolean).join("; "),
    candidates,
  };
}

async function runDiscover() {
  await mkdir(workDir, { recursive: true });
  const products = await targetProducts();
  const done = await readResults();
  // Resumable: products already in results.jsonl are skipped unless --force (--resume is the default behaviour).
  const todo = flag("force") ? products : products.filter((p) => !done.has(p.id));
  console.log(`Товаров без фото в выборке: ${products.length}; к обработке: ${todo.length}`);
  const sources = await loadSources(products);
  // Same article on SALAMAT products with different names: a barcode cannot tell which of them a card shows.
  const all = existsSync(paths.snapshot) ? await new SnapshotReader(paths.snapshot).batch(BigInt(0), Number.MAX_SAFE_INTEGER) : products;
  const byArticle = new Map<string, ProductRef[]>();
  for (const p of all) {
    const a = (p.article ?? "").trim();
    if (a) byArticle.set(a, [...(byArticle.get(a) ?? []), p]);
  }
  const norm = (s: string) => s.toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ").trim();
  const batchSize = num("batch-size", 500);
  const counts: Record<string, number> = {};
  for (let i = 0; i < todo.length; i += batchSize) {
    const batch = todo.slice(i, i + batchSize).map((p) => {
      const shared = (byArticle.get((p.article ?? "").trim()) ?? []).filter((o) => o.id !== p.id && norm(o.name) !== norm(p.name)).length;
      const prev = done.get(p.id);
      // Rows a person decided on (approved / rejected) are never overwritten automatically.
      if (prev && (prev.review_status === "approved" || prev.review_status === "rejected" || prev.review_status === "published")) return prev;
      return discoverOne(p, sources, shared);
    });
    await writeResults(batch);
    for (const r of batch) counts[r.match_status] = (counts[r.match_status] ?? 0) + 1;
    await writeFile(paths.state, JSON.stringify({ discover: { lastId: batch[batch.length - 1].product_id, done: i + batch.length, total: todo.length, at: new Date().toISOString() } }, null, 2));
    console.log(`  ${i + batch.length}/${todo.length}: ${JSON.stringify(counts)}`);
  }
  await journal({ event: "discover", products: todo.length, counts });
}

// ---------------------------------------------------------------- validate

const MIN_LONG_SIDE = 300; // below: unusable
const GOOD_LONG_SIDE = 500; // below: not published automatically (recommended minimum)
const STORE_MAX = 1600; // stored files are not larger than this on the long side (never upscaled)

export interface ImageCheck {
  ok: boolean;
  errors: string[];
  warnings: string[];
  width: number;
  height: number;
  format: string | null;
}

/** Checks the real content of a downloaded file (not its URL): type, decodability, size, blank placeholder. */
export async function checkImage(bytes: Buffer, contentType: string | null): Promise<ImageCheck> {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (contentType && !/^image\//i.test(contentType)) errors.push(`not_image:${contentType.split(";")[0]}`);
  if (/^\s*(<|\{|\[)/.test(bytes.subarray(0, 64).toString("utf8"))) errors.push("html_or_json");
  let meta: Metadata;
  try {
    meta = await sharp(bytes, { failOn: "error", limitInputPixels: 80_000_000 }).metadata();
  } catch {
    return { ok: false, errors: [...errors, "corrupt"], warnings, width: 0, height: 0, format: null };
  }
  if (!meta.format || !["jpeg", "png", "webp", "avif", "heif"].includes(meta.format)) errors.push(`unsupported_type:${meta.format ?? "unknown"}`);
  const swap = (meta.orientation ?? 1) >= 5;
  const width = (swap ? meta.height : meta.width) ?? 0;
  const height = (swap ? meta.width : meta.height) ?? 0;
  const long = Math.max(width, height);
  if (long < MIN_LONG_SIDE) errors.push(`too_small:${width}x${height}`);
  else if (long < GOOD_LONG_SIDE) warnings.push(`low_resolution:${width}x${height}`);
  if (long / Math.max(1, Math.min(width, height)) > 3) warnings.push(`unusual_proportions:${width}x${height}`);
  if (!errors.length) {
    const st = await sharp(bytes).rotate().flatten({ background: "#ffffff" }).resize(64, 64, { fit: "inside" }).stats();
    if (Math.max(...st.channels.slice(0, 3).map((c) => c.stdev)) < 6) errors.push("blank_or_placeholder");
  }
  return { ok: errors.length === 0, errors, warnings, width, height, format: meta.format ?? null };
}

let zxingReady: Promise<typeof import("zxing-wasm/reader")> | null = null;
/** ZXing barcode reader with the WASM file from node_modules (no network). */
function zxing() {
  if (!zxingReady) {
    zxingReady = (async () => {
      const z = await import("zxing-wasm/reader");
      const wasm = await readFile(createRequire(import.meta.url).resolve("zxing-wasm/reader/zxing_reader.wasm"));
      await z.prepareZXingModule({ overrides: { wasmBinary: wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength) as ArrayBuffer }, fireImmediately: true });
      return z;
    })();
  }
  return zxingReady;
}

export interface BarcodeInImage {
  code: string;
  /** Largest side of the barcode relative to the picture (0…1). */
  share: number;
}

/** Retail barcodes (EAN/UPC) visible in the picture. */
export async function barcodesInImage(bytes: Buffer): Promise<BarcodeInImage[]> {
  const z = await zxing();
  const { data, info } = await sharp(bytes).rotate().resize(1600, 1600, { fit: "inside", withoutEnlargement: true }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const found = await z.readBarcodes(
    { data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.length), width: info.width, height: info.height, colorSpace: "srgb" } as unknown as ImageData,
    { formats: ["EAN-13", "EAN-8", "UPC-A", "UPC-E"] as never, tryHarder: true, tryRotate: true, maxNumberOfSymbols: 3 },
  );
  return found.map((b) => {
    const p = b.position;
    const xs = [p.topLeft.x, p.topRight.x, p.bottomLeft.x, p.bottomRight.x];
    const ys = [p.topLeft.y, p.topRight.y, p.bottomLeft.y, p.bottomRight.y];
    return { code: b.text, share: Math.round(Math.max((Math.max(...xs) - Math.min(...xs)) / info.width, (Math.max(...ys) - Math.min(...ys)) / info.height) * 100) / 100 };
  });
}

/**
 * The file to store: the original bytes when they are already a web format, upright and at most STORE_MAX px;
 * otherwise rotated upright and/or scaled down (never up) and saved as high-quality WebP.
 */
export async function storedFile(bytes: Buffer, check: ImageCheck): Promise<{ buffer: Buffer; ext: string; contentType: string; width: number; height: number }> {
  const meta = await sharp(bytes).metadata();
  const upright = (meta.orientation ?? 1) === 1;
  const keep = upright && Math.max(check.width, check.height) <= STORE_MAX && ["jpeg", "png", "webp", "avif"].includes(check.format ?? "");
  if (keep) {
    const ext = check.format === "jpeg" ? "jpg" : check.format!;
    return { buffer: bytes, ext, contentType: `image/${check.format}`, width: check.width, height: check.height };
  }
  const out = await sharp(bytes).rotate().resize(STORE_MAX, STORE_MAX, { fit: "inside", withoutEnlargement: true }).webp({ quality: 90, effort: 5 }).toBuffer({ resolveWithObject: true });
  return { buffer: out.data, ext: "webp", contentType: "image/webp", width: out.info.width, height: out.info.height };
}

async function runValidate() {
  const results = await readResults();
  const ids = opt("product-id")?.split(",");
  const wantStatus: MatchStatus[] = flag("confirmed-only") ? ["confirmed"] : ["confirmed", "probable"];
  let todo = [...results.values()].filter(
    (r) =>
      wantStatus.includes(r.match_status) &&
      r.source_image_url &&
      (r.rights_status === "licensed_cc_by_sa" || r.rights_status === "permission_granted") &&
      (flag("force") || r.stage === "discovered") &&
      (!ids || ids.includes(r.product_id)),
  );
  todo = todo.slice(0, num("limit", Infinity));
  console.log(`К проверке файлов: ${todo.length}`);
  await mkdir(paths.files, { recursive: true });
  const http = new Http({ userAgent, maxRetries: 3, log: (e) => void journal(e) });
  const concurrency = Math.max(1, Math.min(4, num("concurrency", 3)));
  const byUrl = new Map<string, Promise<{ bytes: Buffer; type: string | null } | { error: string }>>();
  const fetchOnce = (url: string) => {
    if (!byUrl.has(url))
      byUrl.set(
        url,
        http
          .fetchBytes(url, { maxBytes: 15_000_000, timeoutMs: 60_000, headers: { Accept: "image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8" } })
          .then((res) => (res.status === 200 ? { bytes: res.body, type: res.headers.get("content-type") } : { error: `http_${res.status}` }))
          .catch((e: Error) => ({ error: `download_failed:${e.message.slice(0, 80)}` })),
      );
    return byUrl.get(url)!;
  };
  let next = 0;
  let done = 0;
  const out: PhotoResult[] = [];
  const flush = async () => {
    await writeResults(out.splice(0));
  };
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (next < todo.length) {
        const r = { ...todo[next++] };
        const got = await fetchOnce(r.source_image_url);
        r.validated_at = new Date().toISOString();
        r.stage = "validated";
        if ("error" in got) {
          r.error = got.error;
        } else {
          const check = await checkImage(got.bytes, got.type);
          r.width = check.width;
          r.height = check.height;
          if (!check.ok) r.error = check.errors.join("; ");
          else {
            const file = await storedFile(got.bytes, check);
            r.sha256 = createHash("sha256").update(file.buffer).digest("hex");
            r.stored_ext = file.ext;
            r.width = file.width;
            r.height = file.height;
            r.file_size = file.buffer.length;
            r.local_file = join(paths.files, `${r.sha256}.${file.ext}`);
            if (!existsSync(r.local_file)) await writeFile(r.local_file, file.buffer);
            r.error = "";
            // A barcode in the picture: a close-up of it is not a packaging photo; another barcode means another product.
            const codes = await barcodesInImage(got.bytes).catch(() => [] as BarcodeInImage[]);
            const mine = (r.article || "").padStart(14, "0");
            for (const b of codes) {
              if (b.code.padStart(14, "0") !== mine) check.warnings.push(`barcode_of_another_product:${b.code}`);
              else if (!r.reason.includes("image_barcode_matches")) r.reason = [r.reason, "image_barcode_matches"].filter(Boolean).join("; ");
              if (b.share >= 0.25) check.warnings.push(`barcode_closeup:${b.share}`);
            }
            if (check.warnings.length) {
              r.reason = [r.reason, ...check.warnings.map((w) => `image_${w}`)].filter(Boolean).join("; ");
              // A small or oddly shaped picture is never published automatically.
              if (r.match_status === "confirmed") r.match_status = "probable";
            }
          }
        }
        out.push(r);
        if (out.length >= 50) await flush();
        if (++done % 100 === 0) console.log(`  проверено файлов: ${done}/${todo.length}`);
      }
    }),
  );
  await flush();
  await dedupeImages();
  const after = [...(await readResults()).values()];
  await journal({ event: "validate", files: todo.length, ok: after.filter((r) => r.stage === "validated" && !r.error && r.sha256).length, http: http.summary() });
  console.log(`Готово. Файлы: ${paths.files}`);
}

/** The same file for products with different names is a sign of a wrong match: send all of them to review. */
async function dedupeImages() {
  const results = [...(await readResults()).values()];
  const bySha = new Map<string, PhotoResult[]>();
  for (const r of results) if (r.sha256 && !r.error) bySha.set(r.sha256, [...(bySha.get(r.sha256) ?? []), r]);
  const changed: PhotoResult[] = [];
  const norm = (s: string) => s.toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ").trim();
  for (const group of bySha.values()) {
    if (group.length < 2 || new Set(group.map((r) => norm(r.product_name))).size < 2) continue;
    for (const r of group) {
      if (r.reason.includes("same_image_for_different_products")) continue;
      changed.push({ ...r, match_status: r.match_status === "confirmed" ? "probable" : r.match_status, reason: [r.reason, "same_image_for_different_products"].filter(Boolean).join("; ") });
    }
  }
  await writeResults(changed);
  if (changed.length) console.log(`  одинаковый файл у разных товаров: ${changed.length} → на проверку`);
}

// ---------------------------------------------------------------- review export

const REVIEW_COLUMNS = [
  "product_id", "article", "name", "match_status", "confidence", "match_method", "source_name", "source_page_url", "source_image_url",
  "stored_image_url", "rights_status", "review_status", "reason", "error", "checked_at", "sha256",
] as const;

function reviewRow(r: PhotoResult) {
  return {
    product_id: r.product_id,
    article: r.article,
    name: r.product_name,
    match_status: r.match_status,
    confidence: r.confidence,
    match_method: r.match_method,
    source_name: r.source_name,
    source_page_url: r.source_page_url,
    source_image_url: r.source_image_url,
    stored_image_url: r.stored_image_url,
    rights_status: r.rights_status,
    review_status: r.review_status,
    reason: r.reason,
    error: r.error,
    checked_at: r.validated_at ?? r.checked_at,
    sha256: r.sha256,
  };
}

const licensed = (r: PhotoResult) => r.rights_status === "licensed_cc_by_sa" || r.rights_status === "permission_granted";
/** Never published, whatever a review file says: doubtful matches and products without a match. */
const matchAllowsPublication = (r: PhotoResult) => r.match_status === "confirmed" || r.match_status === "probable";
/**
 * Ready to publish: licensed, file checked and stored locally, and approved by a person — or, with
 * requireReview: false, simply confirmed. The QA of this run found back sides, barcode close-ups and a leaflet among
 * correctly matched "confirmed" photos (8 of 85), which no automatic check catches, so `publish` requires the
 * visual approval by default (apply-review); --allow-unreviewed lifts that for confirmed matches only.
 */
export const publishable = (r: PhotoResult, { requireReview = false }: { requireReview?: boolean } = {}) =>
  r.review_status !== "rejected" &&
  matchAllowsPublication(r) &&
  licensed(r) &&
  !!r.sha256 &&
  !r.error &&
  (r.review_status === "approved" || (!requireReview && r.match_status === "confirmed"));

async function runReviewExport() {
  const rows = [...(await readResults()).values()].sort((a, b) => Number(a.product_id) - Number(b.product_id));
  await mkdir(paths.review, { recursive: true });
  const csv = (list: PhotoResult[], extra: Record<string, string> = {}) =>
    "﻿" + Papa.unparse(list.map((r) => ({ ...reviewRow(r), ...extra })), { columns: [...REVIEW_COLUMNS, ...Object.keys(extra)] });
  const confirmed = rows.filter((r) => publishable(r, { requireReview: true }));
  const probable = rows.filter(
    // Still waiting for a person: approved and rejected rows are already decided.
    (r) => (r.match_status === "probable" || r.match_status === "confirmed") && r.review_status === "auto" && !publishable(r, { requireReview: true }) && r.source_image_url && !r.error,
  );
  const failed = rows.filter((r) => !!r.error);
  await writeFile(join(paths.review, "photo-results.csv"), csv(rows));
  // Ready to publish: confirmed or probable, approved by a person (publish requires the approval by default).
  await writeFile(join(paths.review, "confirmed_photos.csv"), csv(confirmed));
  // "decision": a reviewer writes approve / reject; `publish --from-review` publishes the approved rows.
  await writeFile(join(paths.review, "probable_photos_review.csv"), csv(probable, { decision: "" }));
  await writeFile(join(paths.review, "failed_photos.csv"), csv(failed));
  await writeFile(join(paths.review, "remaining_without_photo.csv"), csv(rows.filter((r) => !publishable(r))));
  console.log(`CSV: ${paths.review} — confirmed ${confirmed.length}, probable ${probable.length}, failed ${failed.length}, всего ${rows.length}`);
}

/**
 * Applies a reviewer's decisions (CSV with product_id and decision = approve / reject, optional note) to the results:
 * approved rows become publishable, rejected ones never are. Automatic runs do not overwrite these decisions.
 */
async function runApplyReview() {
  const file = opt("file") ?? argv[1];
  if (!file || file.startsWith("--")) throw new Error("apply-review: укажите файл, например data/catalog-photos-internet/qa-decisions.csv");
  const csv = (await readFile(file, "utf8")).replace(/^\uFEFF/, "");
  const results = await readResults();
  const changed: PhotoResult[] = [];
  let stale = 0;
  for (const row of Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: true }).data) {
    const r = results.get((row.product_id ?? "").trim());
    const d = (row.decision ?? "").trim().toLowerCase();
    if (!r || !/^(approve|approved|reject|rejected)$/.test(d)) continue;
    const status: ReviewStatus = d.startsWith("approve") ? "approved" : "rejected";
    // A decision is about one picture: if the source photo changed since the review (another run, another day),
    // an approval no longer applies and the row stays waiting for a person.
    const reviewedSha = (row.sha256 ?? "").trim();
    if (status === "approved" && (!reviewedSha || reviewedSha !== r.sha256)) {
      stale++;
      continue;
    }
    const note = (row.note ?? "").trim();
    changed.push({ ...r, review_status: status, reason: [r.reason, `review_${status}${note ? `:${note}` : ""}`].filter(Boolean).join("; ") });
  }
  await writeResults(changed);
  await journal({ event: "apply_review", file, approved: changed.filter((r) => r.review_status === "approved").length, rejected: changed.filter((r) => r.review_status === "rejected").length });
  console.log(`Решения применены: ${changed.length} (одобрено ${changed.filter((r) => r.review_status === "approved").length}, отклонено ${changed.filter((r) => r.review_status === "rejected").length})`);
  if (stale) console.log(`Не применено одобрений: ${stale} — файл изменился после проверки или в CSV нет sha256; эти фото снова ждут проверки`);
}

// ---------------------------------------------------------------- verify-external

/** Approved photos that may be published (confirmed or probable, licensed, checked file, approved by a person). */
export const approvedForPublication = (r: PhotoResult) => publishable(r, { requireReview: true });

/**
 * Hosts whose files may be put into image_url as they are (direct links): the Open Facts image servers.
 * Their photos are CC BY-SA; the credit is kept in catalog_photo_results and shown under the photo.
 */
export const isExternalPhotoUrl = isOpenFactsPhotoUrl;

/**
 * Re-downloads the source of every approved photo the way a browser on the SALAMAT site would (no cookies, no
 * authorisation, Referer = the site) and checks that it is still the file a person approved: same picture after
 * the same processing (SHA-256 of the processed file equals the reviewed one). A changed or broken source sends the
 * product back to review. Records the source's own SHA-256, size, type and dimensions.
 */
async function runVerifyExternal() {
  const results = await readResults();
  const ids = opt("product-id")?.split(",");
  const todo = [...results.values()].filter((r) => approvedForPublication(r) && (!ids || ids.includes(r.product_id))).slice(0, num("limit", Infinity));
  console.log(`Одобренных фото к проверке ссылки: ${todo.length}`);
  const http = new Http({ userAgent, maxRetries: 3, log: (e) => void journal(e) });
  const concurrency = Math.max(1, Math.min(4, num("concurrency", 3)));
  const out: PhotoResult[] = [];
  const counts: Record<string, number> = {};
  const bump = (k: string) => (counts[k] = (counts[k] ?? 0) + 1);
  let next = 0;
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (next < todo.length) {
        const r = { ...todo[next++] };
        const problems: string[] = [];
        let changed = false;
        if (!isExternalPhotoUrl(r.source_image_url)) problems.push("not_a_direct_open_facts_image_url");
        else {
          try {
            const res = await http.fetchBytes(r.source_image_url, {
              maxBytes: 20_000_000,
              timeoutMs: 60_000,
              credentials: "omit",
              headers: { Accept: "image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8", Referer: `${siteUrl}/` },
            });
            const type = (res.headers.get("content-type") ?? "").split(";")[0].trim();
            const corp = (res.headers.get("cross-origin-resource-policy") ?? "").toLowerCase();
            if (res.status !== 200) problems.push(`http_${res.status}`);
            else {
              if (!/^image\//.test(type)) problems.push(`not_image:${type || "none"}`);
              if (corp === "same-origin" || corp === "same-site") problems.push(`blocked_cross_origin:${corp}`);
              const check = await checkImage(res.body, type);
              if (!check.ok) problems.push(...check.errors);
              else {
                const file = await storedFile(res.body, check);
                const sha = createHash("sha256").update(file.buffer).digest("hex");
                if (sha !== r.sha256) changed = true;
                r.source_sha256 = createHash("sha256").update(res.body).digest("hex");
                r.source_bytes = res.body.length;
                r.source_content_type = type;
                r.source_width = check.width;
                r.source_height = check.height;
              }
            }
          } catch (e) {
            problems.push(`download_failed:${(e as Error).message.slice(0, 80)}`);
          }
        }
        r.source_checked_at = new Date().toISOString();
        r.source_check_error = changed ? "source_changed_after_review" : problems.join("; ");
        if (changed || problems.length) {
          // Not the reviewed picture any more (or not reachable): a person has to look again.
          r.review_status = "auto";
          r.reason = [r.reason, changed ? "source_changed_after_review" : `source_check_failed:${problems.join(",")}`].filter(Boolean).join("; ");
          bump(changed ? "changed" : "failed");
        } else bump("ok");
        out.push(r);
        if (out.length >= 50) await writeResults(out.splice(0));
        const done = (counts.ok ?? 0) + (counts.changed ?? 0) + (counts.failed ?? 0);
        if (done % 100 === 0) console.log(`  проверено: ${done}/${todo.length}`);
      }
    }),
  );
  await writeResults(out);
  await journal({ event: "verify_external", checked: todo.length, counts, http: http.summary() });
  console.log(`Проверено ссылок: ${todo.length} — ${JSON.stringify(counts)}`);
}

// ---------------------------------------------------------------- neon-import (psql)

/** Columns of the CSV loaded with \copy into public.catalog_photo_import_openfacts (see neon-import/*.sql). */
export const NEON_IMPORT_COLUMNS = [
  "product_id", "article", "product_name", "image_url", "source_name", "source_page_url", "attribution", "source_license",
  "rights_status", "match_status", "match_method", "confidence", "manufacturer", "detected_gtin", "width", "height",
  "file_size", "sha256", "source_sha256", "source_bytes", "source_checked_at", "checked_at", "review_note",
] as const;

/**
 * Writes the approved photos whose source URL was verified (verify-external) as a UTF-8 CSV for a psql import that
 * fills image_url with the source's own URL (storage = external_url). No database access.
 */
async function runNeonImportCsv() {
  const results = [...(await readResults()).values()].sort((a, b) => Number(a.product_id) - Number(b.product_id));
  const approved = results.filter(approvedForPublication);
  const ready = approved.filter((r) => isExternalPhotoUrl(r.source_image_url) && !!r.source_sha256 && !r.source_check_error);
  const dir = resolve(opt("out") ?? join(paths.review, "neon-import"));
  await mkdir(dir, { recursive: true });
  const rows = ready.map((r) => ({
    product_id: r.product_id,
    article: r.article,
    product_name: r.product_name,
    image_url: r.source_image_url,
    source_name: r.source_name,
    source_page_url: r.source_page_url,
    attribution: r.attribution,
    source_license: r.source_license,
    rights_status: r.rights_status,
    match_status: r.match_status,
    match_method: r.match_method,
    confidence: r.confidence.toFixed(2),
    manufacturer: r.manufacturer,
    detected_gtin: r.detected_gtin,
    width: r.width ?? "",
    height: r.height ?? "",
    file_size: r.file_size ?? "",
    sha256: r.sha256,
    source_sha256: r.source_sha256,
    source_bytes: r.source_bytes ?? "",
    source_checked_at: r.source_checked_at,
    checked_at: r.validated_at ?? r.checked_at,
    review_note: (r.reason.split("; ").find((t) => t.startsWith("review_approved")) ?? "review_approved").slice(0, 300),
  }));
  // No BOM: psql \copy reads the header line as data otherwise; CRLF-free, quoted where needed (Papa.unparse).
  const file = join(dir, "openfacts_approved_photos.csv");
  await writeFile(file, Papa.unparse(rows, { columns: [...NEON_IMPORT_COLUMNS], newline: "\n" }) + "\n");
  console.log(`CSV для импорта: ${file} — ${rows.length} строк (одобрено ${approved.length}, без проверенной ссылки ${approved.length - ready.length})`);
}

// ---------------------------------------------------------------- publish

interface Storage {
  name: string;
  /** Uploads (or finds the already uploaded) file and returns its public URL. */
  put(pathname: string, body: Buffer, contentType: string): Promise<string>;
  del?(url: string): Promise<void>;
}

/** Vercel Blob: public store, predictable names, never overwritten (the name contains the file's SHA-256). */
async function blobStorage(): Promise<Storage> {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) throw new Error("Нужен BLOB_READ_WRITE_TOKEN (Vercel → Storage → Blob → подключить к проекту → .env.local); в Git и логи не попадает");
  const { put, head, del } = await import("@vercel/blob");
  return {
    name: "vercel-blob",
    async put(pathname, body, contentType) {
      try {
        return (await put(pathname, body, { access: "public", addRandomSuffix: false, allowOverwrite: false, contentType, cacheControlMaxAge: 31_536_000, token })).url;
      } catch (e) {
        // A repeated run: the same content is already stored under the same name.
        if (!/already exists/i.test((e as Error).message)) throw e;
        return (await head(pathname, { token })).url;
      }
    },
    async del(url) {
      await del(url, { token });
    },
  };
}

/** For local tests only: pretends to upload and returns a URL on a test host. */
function testStorage(): Storage {
  return { name: "test", put: async (pathname) => `https://test-store.public.blob.vercel-storage.com/${pathname}` };
}

async function runPublish() {
  const dry = flag("dry-run");
  if (!dry && !flag("confirm")) throw new Error("publish: укажите --dry-run (план без изменений) или --confirm (загрузить в Blob и записать в Neon)");
  // --storage external: image_url gets the source's own public URL (checked by verify-external); nothing is copied and
  // no Blob token is needed. Default: a copy in Vercel Blob.
  const storageKind: Storage_ = (opt("storage") ?? "blob") === "external" ? "external_url" : "vercel_blob";
  const external = storageKind === "external_url";
  const results = await readResults();
  const ids = opt("product-id")?.split(",");
  // Approved by a reviewer in probable_photos_review.csv (decision = approve).
  const approved = new Set<string>();
  if (opt("from-review")) {
    const csv = (await readFile(opt("from-review")!, "utf8")).replace(/^﻿/, "");
    for (const row of Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: true }).data) {
      if (/^(approve|approved|да|ok)$/i.test((row.decision ?? "").trim())) approved.add(row.product_id);
    }
  }
  let plan = [...results.values()].filter(
    (r) =>
      r.review_status !== "rejected" &&
      ((publishable(r, { requireReview: !flag("allow-unreviewed") }) && !flag("from-review")) || (approved.has(r.product_id) && matchAllowsPublication(r) && !!r.sha256 && !r.error && licensed(r))),
  );
  if (flag("confirmed-only")) plan = plan.filter((r) => r.match_status === "confirmed");
  plan = plan.filter((r) => r.stage !== "published" && (!ids || ids.includes(r.product_id)));
  // A direct link is published only after verify-external confirmed it still serves the reviewed picture.
  if (external) plan = plan.filter((r) => isExternalPhotoUrl(r.source_image_url) && !!r.source_sha256 && !r.source_check_error);
  plan = plan.slice(0, num("limit", Infinity));
  const runId = opt("run-id") ?? `photos-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  await mkdir(paths.review, { recursive: true });
  await writeFile(
    join(workDir, `publish-plan-${runId}.csv`),
    "﻿" + Papa.unparse(plan.map((r) => ({ run_id: runId, product_id: r.product_id, name: r.product_name, storage: storageKind, image_url: external ? r.source_image_url : blobPathname(r.product_id, r.sha256, r.stored_ext), source: r.source_page_url, license: r.source_license }))),
  );
  console.log(`План ${runId}: ${plan.length} фото, хранение ${storageKind} (${dry ? "dry-run, без изменений" : "публикация"})`);
  if (dry) {
    for (const r of plan.slice(0, 10)) console.log(`  ${r.product_id} → ${external ? r.source_image_url : blobPathname(r.product_id, r.sha256, r.stored_ext)} (${r.source_name})`);
    return;
  }
  if (!dbUrl()) throw new Error("Нужен DATABASE_URL базы Neon сайта");
  const storage = external ? null : process.env.PHOTOS_STORAGE === "test" ? testStorage() : await blobStorage();
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient({ datasources: { db: { url: dbUrl() } } });
  const published: PhotoResult[] = [];
  let skipped = 0;
  let failed = 0;
  try {
    for (const r of plan) {
      try {
        // Never touch a product that already has a photo (someone may have added one since the snapshot).
        const [cur] = await prisma.$queryRaw<{ image_url: string | null }[]>`SELECT image_url FROM public.pharmacy_products WHERE id = ${BigInt(r.product_id)}`;
        if (!cur || (cur.image_url ?? "").trim()) {
          skipped++;
          await journal({ event: "publish_skip", run_id: runId, product_id: r.product_id, reason: cur ? "has_image" : "no_product" });
          continue;
        }
        const url = external
          ? r.source_image_url
          : await storage!.put(blobPathname(r.product_id, r.sha256, r.stored_ext), await readFile(r.local_file), r.stored_ext === "jpg" ? "image/jpeg" : `image/${r.stored_ext}`);
        // The audit never presents a source URL as a stored copy: stored_image_url is set only for Blob files.
        const done: Partial<PhotoResult> = { storage: storageKind, published_image_url: url, stored_image_url: external ? "" : url };
        const updated = await prisma.$transaction(async (tx) => {
          const n = await tx.$executeRaw`
            UPDATE public.pharmacy_products SET image_url = ${url}
            WHERE id = ${BigInt(r.product_id)} AND NULLIF(BTRIM(image_url), '') IS NULL`;
          if (n !== 1) return false;
          await tx.$executeRaw`
            INSERT INTO catalog_photo_changes (run_id, product_id, previous_image_url, new_image_url)
            VALUES (${runId}, ${BigInt(r.product_id)}, ${cur.image_url}, ${url})`;
          await upsertAudit(tx, { ...r, ...done, review_status: "published", published_at: new Date().toISOString(), run_id: runId });
          return true;
        });
        if (!updated) {
          skipped++;
          continue;
        }
        published.push({ ...r, ...done, stage: "published", review_status: "published", published_at: new Date().toISOString(), run_id: runId });
        if (published.length % 50 === 0) {
          await writeResults(published.slice(-50));
          console.log(`  опубликовано: ${published.length}/${plan.length}`);
        }
      } catch (e) {
        failed++;
        await journal({ event: "publish_error", run_id: runId, product_id: r.product_id, error: String((e as Error).message).slice(0, 300) });
      }
    }
    await writeResults(published.slice(published.length - (published.length % 50)));
    // Audit rows for every processed product (probable, doubtful, no_match too), unless a person already decided.
    if (!flag("no-audit")) {
      const rest = [...(await readResults()).values()].filter((r) => r.stage !== "published");
      for (let i = 0; i < rest.length; i += 200) {
        await prisma.$transaction(async (tx) => {
          for (const r of rest.slice(i, i + 200)) await upsertAudit(tx, r);
        });
      }
    }
  } finally {
    await prisma.$disconnect();
  }
  await journal({ event: "publish", run_id: runId, storage: storage?.name ?? storageKind, planned: plan.length, published: published.length, skipped, failed });
  console.log(`run_id ${runId}: опубликовано ${published.length}, пропущено ${skipped}, ошибок ${failed}. Откат: npm run photos:rollback -- --run-id ${runId} --confirm`);
}

type Tx = { $executeRaw: (query: TemplateStringsArray, ...values: unknown[]) => Promise<number> };

/** One audit row per product. Rows a person approved or rejected are not overwritten by automatic runs. */
async function upsertAudit(tx: Tx, r: PhotoResult) {
  await tx.$executeRaw`
    INSERT INTO catalog_photo_results (product_id, article, product_name, match_status, match_method, confidence, source_name, source_page_url,
      source_image_url, stored_image_url, source_license, rights_status, attribution, manufacturer, detected_gtin, width, height, file_size,
      sha256, review_status, reason, error, run_id, checked_at, published_at, updated_at,
      storage, published_image_url, source_sha256, source_bytes, source_checked_at)
    VALUES (${BigInt(r.product_id)}, ${r.article || null}, ${r.product_name}, ${r.match_status}, ${r.match_method}, ${r.confidence},
      ${r.source_name || null}, ${r.source_page_url || null}, ${r.source_image_url || null}, ${r.stored_image_url || null}, ${r.source_license || null},
      ${r.rights_status}, ${r.attribution || null}, ${r.manufacturer || null}, ${r.detected_gtin || null}, ${r.width}, ${r.height}, ${r.file_size},
      ${r.sha256 || null}, ${r.review_status}, ${r.reason || null}, ${r.error || null}, ${r.run_id}, ${new Date(r.validated_at ?? r.checked_at)},
      ${r.published_at ? new Date(r.published_at) : null}, now(),
      ${r.storage || null}, ${r.published_image_url || null}, ${r.source_sha256 || null}, ${r.source_bytes ?? null},
      ${r.source_checked_at ? new Date(r.source_checked_at) : null})
    ON CONFLICT (product_id) DO UPDATE SET
      article = EXCLUDED.article, product_name = EXCLUDED.product_name, match_status = EXCLUDED.match_status, match_method = EXCLUDED.match_method,
      confidence = EXCLUDED.confidence, source_name = EXCLUDED.source_name, source_page_url = EXCLUDED.source_page_url,
      source_image_url = EXCLUDED.source_image_url,
      stored_image_url = CASE WHEN EXCLUDED.review_status = 'published' THEN EXCLUDED.stored_image_url
                              ELSE COALESCE(EXCLUDED.stored_image_url, catalog_photo_results.stored_image_url) END,
      storage = CASE WHEN EXCLUDED.review_status = 'published' THEN EXCLUDED.storage ELSE catalog_photo_results.storage END,
      published_image_url = CASE WHEN EXCLUDED.review_status = 'published' THEN EXCLUDED.published_image_url
                                 ELSE catalog_photo_results.published_image_url END,
      source_sha256 = COALESCE(EXCLUDED.source_sha256, catalog_photo_results.source_sha256),
      source_bytes = COALESCE(EXCLUDED.source_bytes, catalog_photo_results.source_bytes),
      source_checked_at = COALESCE(EXCLUDED.source_checked_at, catalog_photo_results.source_checked_at),
      source_license = EXCLUDED.source_license, rights_status = EXCLUDED.rights_status, attribution = EXCLUDED.attribution,
      manufacturer = EXCLUDED.manufacturer, detected_gtin = EXCLUDED.detected_gtin, width = EXCLUDED.width, height = EXCLUDED.height,
      file_size = EXCLUDED.file_size, sha256 = EXCLUDED.sha256, review_status = EXCLUDED.review_status, reason = EXCLUDED.reason,
      error = EXCLUDED.error, run_id = COALESCE(EXCLUDED.run_id, catalog_photo_results.run_id), checked_at = EXCLUDED.checked_at,
      published_at = COALESCE(EXCLUDED.published_at, catalog_photo_results.published_at), updated_at = now()
    WHERE (catalog_photo_results.review_status NOT IN ('approved', 'rejected', 'published') OR EXCLUDED.review_status = 'published')
      AND catalog_photo_results.review_status <> 'rejected'`;
}

// ---------------------------------------------------------------- rollback

async function runRollback() {
  const runId = opt("run-id");
  if (!runId) throw new Error("rollback: укажите --run-id");
  const dry = flag("dry-run");
  if (!dry && !flag("confirm")) throw new Error("rollback: укажите --dry-run или --confirm");
  if (!dbUrl()) throw new Error("Нужен DATABASE_URL");
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient({ datasources: { db: { url: dbUrl() } } });
  try {
    const changes = await prisma.$queryRaw<{ id: bigint; product_id: bigint; previous_image_url: string | null; new_image_url: string }[]>`
      SELECT id, product_id, previous_image_url, new_image_url FROM catalog_photo_changes WHERE run_id = ${runId} AND reverted_at IS NULL ORDER BY id`;
    console.log(`run_id ${runId}: изменений к откату ${changes.length}${dry ? " (dry-run)" : ""}`);
    if (dry) return;
    const revertedIds: string[] = [];
    let kept = 0;
    const storage = flag("delete-files") ? await blobStorage() : null;
    for (const c of changes) {
      const ok = await prisma.$transaction(async (tx) => {
        // Only if the photo is still the one this run wrote: a later manual change is never undone.
        const n = await tx.$executeRaw`
          UPDATE public.pharmacy_products SET image_url = ${c.previous_image_url}
          WHERE id = ${c.product_id} AND image_url = ${c.new_image_url}`;
        if (n === 1) {
          // reverted_at stays empty for a change that was not undone, so the journal does not claim otherwise.
          await tx.$executeRaw`UPDATE catalog_photo_changes SET reverted_at = now() WHERE id = ${c.id}`;
          await tx.$executeRaw`
            UPDATE catalog_photo_results SET review_status = 'rolled_back', published_at = NULL, updated_at = now()
            WHERE product_id = ${c.product_id} AND run_id = ${runId}`;
        }
        return n === 1;
      });
      if (ok) {
        revertedIds.push(c.product_id.toString());
        // Only SALAMAT's own Blob copies are deleted; a source's URL (external_url) is never touched.
        if (storage?.del && isBlobProductPhoto(c.new_image_url)) await storage.del(c.new_image_url).catch(() => undefined);
      } else kept++;
    }
    const results = await readResults();
    await writeResults(
      revertedIds
        .map((id) => results.get(id))
        .filter((r): r is PhotoResult => !!r)
        .map((r) => ({ ...r, stage: "validated" as const, review_status: "rolled_back" as const, stored_image_url: "", published_image_url: "", published_at: null })),
    );
    await journal({ event: "rollback", run_id: runId, reverted: revertedIds.length, kept });
    console.log(`Откачено: ${revertedIds.length}; не тронуто (фото уже изменено вручную): ${kept}`);
  } finally {
    await prisma.$disconnect();
  }
}

// ---------------------------------------------------------------- report

async function runReport() {
  const rows = [...(await readResults()).values()];
  const snap = await readJson<Record<string, unknown>>(paths.snapshotMeta, {});
  const by = (f: (r: PhotoResult) => string, list = rows) => [...list.reduce((m, r) => m.set(f(r), (m.get(f(r)) ?? 0) + 1), new Map<string, number>())].sort((a, b) => b[1] - a[1]);
  const files = rows.filter((r) => r.sha256 && !r.error);
  const bytes = files.reduce((s, r) => s + (r.file_size ?? 0), 0);
  const summary = {
    generatedAt: new Date().toISOString(),
    snapshot: snap,
    processed: rows.length,
    withCandidates: rows.filter((r) => r.candidates.length).length,
    candidates: rows.reduce((s, r) => s + r.candidates.length, 0),
    matchStatus: Object.fromEntries(by((r) => r.match_status)),
    publishable: rows.filter((r) => publishable(r)).length,
    published: rows.filter((r) => r.stage === "published").length,
    filesValidated: files.length,
    filesBytes: bytes,
    avgFileBytes: files.length ? Math.round(bytes / files.length) : 0,
    errors: Object.fromEntries(by((r) => r.error.replace(/:.*$/, ""), rows.filter((r) => r.error))),
    sources: Object.fromEntries(by((r) => r.source_name || "—")),
    categories: Object.fromEntries(by((r) => `${r.category ?? "(нет раздела)"} / ${r.match_status}`)),
    brands: by((r) => (r.manufacturer || "—").split(",")[0].trim().toLowerCase(), rows.filter((r) => publishable(r))).slice(0, 30),
  };
  await writeFile(join(workDir, "report.json"), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
}

// ---------------------------------------------------------------- main

const commands: Record<string, () => Promise<void>> = {
  snapshot: runSnapshot,
  "fetch-sources": runFetchSources,
  discover: runDiscover,
  validate: runValidate,
  "review-export": runReviewExport,
  "apply-review": runApplyReview,
  "verify-external": runVerifyExternal,
  "neon-import-csv": runNeonImportCsv,
  publish: runPublish,
  rollback: runRollback,
  report: runReport,
};

if (basename(process.argv[1] ?? "") === "internet.ts") {
  if (!commands[command]) {
    console.error(`Команды: ${Object.keys(commands).join(" | ")} (см. docs/catalog-photos-internet.md)`);
    process.exit(2);
  }
  mkdir(workDir, { recursive: true })
    .then(() => commands[command]())
    .catch((e) => {
      console.error((e as Error).stack ?? e);
      process.exit(1);
    });
}


// Full pass over the SALAMAT catalogue against the national product catalogue NCT (nct.gov.kz).
// Finds and grades candidate cards; never downloads NCT photos (no reuse licence — see docs/catalog-photos-nct.md).
//
//   npm run photos:nct -- run    [--limit N] [--ids 1,2] [--restart] [--force] [--max-pages 3] [--work-dir DIR]
//   npm run photos:nct -- report [--work-dir DIR]
//   npm run photos:nct -- export [--out data/nct]   (compact manifest for the repository)
//
// Products come from DIR/products.jsonl (`npm run photos -- snapshot`) or, with DATABASE_URL, from
// public.pharmacy_products (READ ONLY, by id). Progress: DIR/nct/state.json (last finished id), results.jsonl (one line per
// product, the latest wins), journal.jsonl. Ctrl+C stops after the current product; the next run continues. Products
// whose queries failed (HTTP 429/5xx after retries, timeouts) are kept with status "error" and are retried by the next run.
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import Papa from "papaparse";
import { classifyArticle } from "../../src/lib/catalog-photos/barcode";
import { describeAttributes, parseAttributes } from "../../src/lib/catalog-photos/attributes";
import { assessNctCard, attributeColumns, GRADE_ORDER, nctUrl, type NctAssessment, type NctCard, type NctGrade } from "../../src/lib/catalog-photos/nct-match";
import type { ProductRef } from "../../src/lib/catalog-photos/match";
import { isSignificantWord } from "../../src/lib/catalog-photos/similarity";
import { Http, HOST_INTERVAL_MS } from "./http";
import { NctClient, queryWords } from "./nct";
import { DbReader, SnapshotReader, type ProductReader } from "./products";

const argv = process.argv.slice(2);
const command = argv[0];
const opt = (name: string) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const flag = (name: string) => argv.includes(`--${name}`);
const workDir = resolve(opt("work-dir") ?? ".photo-work");
const dir = join(workDir, "nct");
const paths = {
  state: join(dir, "state.json"),
  results: join(dir, "results.jsonl"),
  journal: join(dir, "journal.jsonl"),
  cache: join(dir, "cache"),
  progress: join(dir, "progress.json"),
};
const siteUrl = (process.env.APP_URL || "https://salamat-pharmacy.vercel.app").replace(/\/$/, "");
const userAgent = `SalamatCatalogPhotos/1.0 (+${process.env.PHOTO_BOT_CONTACT || siteUrl})`;
const MAX_CANDIDATES = 5;
const runId = new Date().toISOString().replace(/[:.]/g, "-");

async function journal(e: Record<string, unknown>) {
  await appendFile(paths.journal, JSON.stringify({ ts: new Date().toISOString(), run: runId, ...e }) + "\n");
}

// ---------------------------------------------------------------- result rows

export type ProductStatus = "confirmed" | "probable" | "doubtful" | "mismatch_only" | "no_candidate" | "no_query" | "error";

export interface CandidateRow {
  rank: number;
  nct_id: number;
  nct_url: string;
  nct_name: string;
  nct_gtin: string | null;
  nct_ntin: string | null;
  nct_kztin: string | null;
  nct_external_id: string | null;
  nct_source: number | null;
  nct_category: string | null;
  image_urls: string[];
  manufacturer: string | null;
  manufacturer_bin: string | null;
  country: string | null;
  form: string;
  dosage: string;
  volume: string;
  pack: string;
  amount_in_package: number | null;
  match_method: string;
  grade: NctGrade;
  score: number;
  name_coverage: number;
  name_reverse: number;
  comparison: string;
  reasons: string[];
}

export interface ProductResult {
  product_id: string;
  article: string;
  name: string;
  article_kind: string;
  product_attributes: string;
  status: ProductStatus;
  queries: string[];
  requests: number;
  pool_size: number;
  candidates: CandidateRow[];
  error: string | null;
  checked_at: string;
}

function toRow(card: NctCard, a: NctAssessment, rank: number): CandidateRow {
  const cols = attributeColumns(a.candidate);
  return {
    rank,
    nct_id: card.id,
    nct_url: nctUrl(card.id),
    nct_name: card.name,
    nct_gtin: card.gtin,
    nct_ntin: card.ntin,
    nct_kztin: card.kztin,
    nct_external_id: card.externalId ?? null,
    nct_source: card.source ?? null,
    nct_category: card.category,
    image_urls: card.images,
    manufacturer: card.manufacturer,
    manufacturer_bin: card.manufacturerBin ?? null,
    country: card.country ?? null,
    form: card.form ?? cols.form,
    dosage: cols.dosage,
    volume: cols.volume,
    pack: cols.pack,
    amount_in_package: card.amountInPackage ?? null,
    match_method: a.method,
    grade: a.grade,
    score: a.score,
    name_coverage: a.similarity.coverage,
    name_reverse: a.similarity.reverse,
    comparison: `${a.comparison.status}${a.comparison.confirmed.length ? ` (подтверждено: ${a.comparison.confirmed.join(", ")})` : ""}`,
    reasons: a.reasons,
  };
}

// ---------------------------------------------------------------- one product

async function processProduct(p: ProductRef, nct: NctClient, maxPages: number, duplicates: Map<string, ProductRef[]>): Promise<ProductResult> {
  // Same article on SALAMAT products with different names (other pack, flavour, size): a barcode cannot say which of
  // them a card shows, so none of them is confirmed by the barcode alone.
  const norm = (s: string) => s.toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ").trim();
  const shared = (duplicates.get((p.article ?? "").trim()) ?? []).filter((o) => o.id !== p.id && norm(o.name) !== norm(p.name)).length;
  const assess = (c: NctCard) => assessNctCard(p, c, shared);
  const art = classifyArticle(p.article);
  const words = queryWords(p.name);
  const base: Omit<ProductResult, "status" | "candidates" | "error"> = {
    product_id: p.id,
    article: (p.article ?? "").trim(),
    name: p.name,
    article_kind: art.kind,
    product_attributes: describeAttributes(parseAttributes(p.name)),
    queries: [],
    requests: 0,
    pool_size: 0,
    checked_at: new Date().toISOString(),
  };
  if (!words.length) return { ...base, status: "no_query", candidates: [], error: null };

  const pool = new Map<number, NctCard>();
  const add = (r: Awaited<ReturnType<NctClient["search"]>>) => {
    if (!r) return;
    base.queries.push(`${r.q} [${r.cards.length}/${r.count}]`);
    base.requests += r.requests;
    for (const c of r.cards) if (!pool.has(c.id)) pool.set(c.id, c);
  };
  const exactIn = () => [...pool.values()].some((c) => assess(c).method !== "name");
  try {
    // 1. Brand / first word: shared by every product of the brand (cached), up to maxPages × 48 cards.
    const brand = await nct.search(words[0], maxPages);
    add(brand);
    // 2. A more specific name query when the brand list was cut off.
    if (brand && !brand.complete && words.length > 1) add(await nct.search(words.slice(0, 3).join(" "), 1));
    // 3. Exact barcode: "<word> <GTIN>" (AND search; a bare barcode is never sent).
    if (art.kind === "gtin" && !exactIn()) {
      const probeWords = [...(brand && !brand.complete ? [words[0]] : []), ...words.slice(1)].filter(isSignificantWord).slice(0, 2);
      for (const w of probeWords) {
        add(await nct.search(`${w} ${base.article}`, 1));
        if (exactIn()) break;
      }
    }
    // 4. Grade everything found; keep the best candidates.
    let ranked = [...pool.values()]
      .map((c) => ({ c, a: assess(c) }))
      .filter((x) => x.a.grade !== "unrelated" || x.a.method !== "name")
      .sort((x, y) => GRADE_ORDER[x.a.grade] - GRADE_ORDER[y.a.grade] || y.a.score - x.a.score)
      .slice(0, MAX_CANDIDATES);
    // 5. Full card (manufacturer, BIN, pack amount) for the leading candidate when it has photos and is a real
    //    contender — that is what a permission request needs. Cards without photos are not worth an extra request.
    //    The card used is the best one that has photos (another card with the same barcode may have them).
    const leadIndex = ranked.findIndex((x) => x.c.images.length && (x.a.method !== "name" || x.a.grade === "probable" || x.a.grade === "confirmed"));
    if (leadIndex >= 0 && !ranked[leadIndex].c.detailed) {
      const full = await nct.card(ranked[leadIndex].c.id);
      if (full) {
        ranked[leadIndex] = { c: full, a: assess(full) };
        base.requests += 1;
        ranked = ranked.sort((x, y) => GRADE_ORDER[x.a.grade] - GRADE_ORDER[y.a.grade] || y.a.score - x.a.score);
      }
    }
    base.pool_size = pool.size;
    const candidates = ranked.map((x, i) => toRow(x.c, x.a, i + 1));
    const best = candidates[0]?.grade;
    const status: ProductStatus = !best || best === "unrelated" ? "no_candidate" : best === "mismatch" ? "mismatch_only" : best;
    return { ...base, status, candidates, error: null };
  } catch (e) {
    base.pool_size = pool.size;
    return { ...base, status: "error", candidates: [], error: String((e as Error).message ?? e).slice(0, 300) };
  }
}

// ---------------------------------------------------------------- run

async function readResults(): Promise<Map<string, ProductResult>> {
  const out = new Map<string, ProductResult>();
  if (!existsSync(paths.results)) return out;
  for (const line of (await readFile(paths.results, "utf8")).split("\n")) {
    if (!line.trim()) continue;
    const r = JSON.parse(line) as ProductResult;
    out.set(r.product_id, r);
  }
  return out;
}

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}

async function run() {
  await mkdir(dir, { recursive: true });
  const interval = Number(process.env.NCT_INTERVAL_MS || 1000);
  HOST_INTERVAL_MS["nct.gov.kz"] = Math.max(1000, interval);
  const http = new Http({ userAgent, maxRetries: 4, log: (e) => void journal(e) });
  const nct = new NctClient(http, paths.cache, (e) => void journal(e));
  const dbUrl = process.env.PHOTOS_DATABASE_URL || process.env.DATABASE_URL;
  const snapshot = opt("products-file") ?? join(workDir, "products.jsonl");
  const reader: ProductReader = existsSync(snapshot) && !flag("from-db") ? new SnapshotReader(snapshot) : dbUrl ? new DbReader(dbUrl) : (() => {
    throw new Error("Run `npm run photos -- snapshot` first or set DATABASE_URL");
  })();
  const maxPages = Math.max(1, Math.min(5, Number(opt("max-pages") ?? 3)));
  const limit = Number(opt("limit") ?? Infinity);
  const concurrency = Math.max(1, Math.min(2, Number(opt("concurrency") ?? 2)));
  const done = await readResults();
  const state = flag("restart") ? { lastId: "0" } : await readJson(paths.state, { lastId: "0" });
  let stopping = false;
  process.on("SIGINT", () => {
    if (stopping) process.exit(130);
    stopping = true;
    console.log("\nОстанавливаюсь после текущего товара…");
  });
  process.on("SIGTERM", () => {
    stopping = true;
  });
  const total = await reader.total();
  const duplicates = await reader.duplicates();
  await journal({ event: "run_start", total, lastId: state.lastId, alreadyDone: done.size, intervalMs: HOST_INTERVAL_MS["nct.gov.kz"] });
  const started = Date.now();
  let processed = 0;

  const handle = async (p: ProductRef) => {
    const prev = done.get(p.id);
    if (!flag("force") && prev && prev.status !== "error") return;
    const r = await processProduct(p, nct, maxPages, duplicates);
    await appendFile(paths.results, JSON.stringify(r) + "\n");
    done.set(p.id, r);
    processed++;
    if (r.status === "error") await journal({ event: "product_error", product_id: p.id, error: r.error });
  };
  const progress = async () => {
    const counts: Record<string, number> = {};
    for (const r of done.values()) counts[r.status] = (counts[r.status] ?? 0) + 1;
    await writeFile(
      paths.progress,
      JSON.stringify({ updatedAt: new Date().toISOString(), lastId: state.lastId, done: done.size, total, processedThisRun: processed, elapsedMin: Math.round((Date.now() - started) / 60000), counts, nct: nct.stats, http: http.summary()["nct.gov.kz"] ?? null }, null, 2),
    );
  };

  try {
    const ids = opt("ids")?.split(",").map((s) => s.trim()).filter(Boolean);
    if (ids) {
      for (const p of (await reader.byIds(ids)).slice(0, limit)) {
        if (stopping) break;
        await handle(p);
      }
    } else {
      let after = BigInt(state.lastId);
      while (!stopping && processed < limit) {
        const batch = (await reader.batch(after, 50)).slice(0, Math.max(0, limit - processed));
        if (!batch.length) break;
        // Two products at a time: request starts to nct.gov.kz stay ≥ 1 s apart (one queue per host), only the waiting
        // for answers overlaps. The checkpoint moves only past a batch that finished completely.
        let next = 0;
        await Promise.all(
          Array.from({ length: Math.min(concurrency, batch.length) }, async () => {
            while (next < batch.length && !stopping) await handle(batch[next++]);
          }),
        );
        if (stopping) break; // unfinished products of this batch are redone next time (finished ones are skipped)
        after = BigInt(batch[batch.length - 1].id);
        state.lastId = after.toString();
        await writeFile(paths.state, JSON.stringify({ ...state, updatedAt: new Date().toISOString() }, null, 2));
        await progress();
      }
      // Second chance for products whose queries failed earlier in this or a previous run.
      if (!stopping && processed < limit && !flag("no-retry")) {
        const failed = [...done.values()].filter((r) => r.status === "error").map((r) => r.product_id);
        if (failed.length) {
          await journal({ event: "retry_errors", count: failed.length });
          for (const p of await reader.byIds(failed)) {
            if (stopping) break;
            await handle(p);
          }
        }
      }
    }
  } finally {
    await progress();
    await journal({ event: "run_end", processed, stopped: stopping, nct: nct.stats, http: http.summary() });
    await reader.close();
  }
  console.log(`Обработано в этом запуске: ${processed}; всего: ${done.size} из ${total}`);
  await report();
}

// ---------------------------------------------------------------- report

type PhotoStatus =
  | "confirmed_photo_needs_permission"
  | "probable_photo_needs_review"
  | "doubtful_photo_needs_review"
  | "match_without_photo"
  | "no_usable_candidate"
  | "error";

const PRODUCT_COLUMNS = [
  "product_id", "article", "name", "article_kind", "product_attributes", "status", "photo_status", "photo_grade", "photo_nct_url",
  "photo_image_url", "photo_image_count", "photo_manufacturer", "photo_manufacturer_bin", "best_grade", "best_match_method", "best_nct_url",
  "best_nct_id", "best_nct_name", "best_nct_gtin", "best_image_url", "best_image_count", "best_manufacturer", "best_manufacturer_bin",
  "best_reasons", "candidates", "rights_status", "review_status", "queries", "error", "checked_at",
];
const CANDIDATE_COLUMNS = [
  "product_id", "article", "name", "rank", "nct_id", "nct_url", "nct_name", "nct_gtin", "nct_ntin", "nct_kztin", "nct_external_id",
  "nct_source", "nct_category", "image_url", "image_urls", "image_count", "manufacturer", "manufacturer_bin", "country", "form", "dosage",
  "volume", "pack", "amount_in_package", "match_method", "grade", "score", "name_coverage", "name_reverse", "comparison", "reasons",
  "rights_status", "checked_at",
];
const RIGHTS = "permission_required";

const pct = (a: number, b: number) => (b ? `${((a / b) * 100).toFixed(1)} %` : "—");

async function report() {
  const results = [...(await readResults()).values()].sort((a, b) => Number(a.product_id) - Number(b.product_id));
  // The photo candidate: the best-graded card that has photos (another card with the same barcode may have them when the
  // leading one does not). Only confirmed/probable/doubtful cards qualify.
  const photoOf = (r: ProductResult) => r.candidates.find((c) => c.image_urls.length && (c.grade === "confirmed" || c.grade === "probable" || c.grade === "doubtful")) ?? null;
  const photoStatus = (r: ProductResult): PhotoStatus => {
    const p = photoOf(r);
    if (r.status === "error") return "error";
    if (p?.grade === "confirmed") return "confirmed_photo_needs_permission";
    if (p?.grade === "probable") return "probable_photo_needs_review";
    if (p?.grade === "doubtful") return "doubtful_photo_needs_review";
    if (r.status === "confirmed" || r.status === "probable" || r.status === "doubtful") return "match_without_photo";
    return "no_usable_candidate";
  };
  const products = results.map((r) => {
    const b = r.candidates[0];
    const p = photoOf(r);
    const usable = r.status === "confirmed" || r.status === "probable" || r.status === "doubtful";
    return {
      photo_status: photoStatus(r),
      photo_grade: p?.grade ?? "",
      photo_nct_url: p?.nct_url ?? "",
      photo_image_url: p?.image_urls[0] ?? "",
      photo_image_count: p?.image_urls.length ?? 0,
      photo_manufacturer: p?.manufacturer ?? "",
      photo_manufacturer_bin: p?.manufacturer_bin ?? "",
      product_id: r.product_id,
      article: r.article,
      name: r.name,
      article_kind: r.article_kind,
      product_attributes: r.product_attributes,
      status: r.status,
      best_grade: b?.grade ?? "",
      best_match_method: b?.match_method ?? "",
      best_nct_url: b?.nct_url ?? "",
      best_nct_id: b?.nct_id ?? "",
      best_nct_name: b?.nct_name ?? "",
      best_nct_gtin: b?.nct_gtin ?? "",
      best_image_url: b?.image_urls[0] ?? "",
      best_image_count: b?.image_urls.length ?? 0,
      best_manufacturer: b?.manufacturer ?? "",
      best_manufacturer_bin: b?.manufacturer_bin ?? "",
      best_reasons: b?.reasons.join("; ") ?? "",
      candidates: r.candidates.length,
      // NCT photos may not be reused without the rights holder's permission; nothing here is publishable yet.
      rights_status: p ? RIGHTS : "",
      review_status: r.status === "confirmed" ? "match_confirmed_needs_permission" : usable ? "needs_review" : r.status === "error" ? "retry" : "missing",
      queries: r.queries.join(" | "),
      error: r.error ?? "",
      checked_at: r.checked_at,
    };
  });
  const candidates = results.flatMap((r) =>
    r.candidates.map((c) => ({
      product_id: r.product_id,
      article: r.article,
      name: r.name,
      ...c,
      image_url: c.image_urls[0] ?? "",
      image_urls: c.image_urls.join(" "),
      image_count: c.image_urls.length,
      reasons: c.reasons.join("; "),
      rights_status: RIGHTS,
      checked_at: r.checked_at,
    })),
  );
  await writeFile(join(dir, "products.csv"), "﻿" + Papa.unparse(products, { columns: PRODUCT_COLUMNS }));
  await writeFile(join(dir, "candidates.csv"), "﻿" + Papa.unparse(candidates, { columns: CANDIDATE_COLUMNS }));
  await writeFile(join(dir, "candidates.json"), JSON.stringify(results, null, 1));

  // Rights holders to ask: manufacturers of cards that match a SALAMAT product (confirmed or probable) and have photos.
  const holders = new Map<string, { manufacturer: string; bin: string; sources: Set<number>; products: Set<string>; cards: Set<number>; confirmed: number }>();
  for (const r of results) {
    const b = photoOf(r);
    if (!b || !(b.grade === "confirmed" || b.grade === "probable")) continue;
    // One row per company: the name without legal form, quotes and punctuation ("ТОО «Eva-Phyto»" = "Eva-Phyto ТОО").
    const key =
      (b.manufacturer ?? "")
        .toLowerCase()
        .replace(/(^|[^\p{L}])(товарищество с ограниченной ответственностью|тоо|ао|оао|зао|ооо|пк|ип|llc|ltd|limited|inc|gmbh)(?=$|[^\p{L}])/giu, " ")
        .replace(/[^\p{L}\d]+/gu, "") || "(производитель не указан)";
    let h = holders.get(key);
    if (!h) holders.set(key, (h = { manufacturer: b.manufacturer ?? "(не указан)", bin: "", sources: new Set(), products: new Set(), cards: new Set(), confirmed: 0 }));
    if (!h.bin && b.manufacturer_bin) h.bin = b.manufacturer_bin;
    h.products.add(r.product_id);
    h.cards.add(b.nct_id);
    if (b.nct_source !== null) h.sources.add(b.nct_source);
    if (b.grade === "confirmed") h.confirmed++;
  }
  const holderRows = [...holders.values()]
    .sort((a, b) => b.products.size - a.products.size)
    .map((h) => ({
      manufacturer: h.manufacturer,
      manufacturer_bin: h.bin,
      products: h.products.size,
      confirmed_matches: h.confirmed,
      nct_cards: h.cards.size,
      nct_sources: [...h.sources].join(","),
      contact: h.bin ? `БИН ${h.bin}: контакты — в реестре юрлиц (stat.gov.kz / egov.kz) или через поставщика SALAMAT` : "в карточке НКТ контакты не указаны; запросить у поставщика SALAMAT или у оператора НКТ",
      product_ids: [...h.products].join(" "),
      nct_urls: [...h.cards].map(nctUrl).join(" "),
    }));
  await writeFile(join(dir, "permission-requests.csv"), "﻿" + Papa.unparse(holderRows));

  const count = (s: ProductStatus) => results.filter((r) => r.status === s).length;
  const statuses: ProductStatus[] = ["confirmed", "probable", "doubtful", "mismatch_only", "no_candidate", "no_query", "error"];
  const withCards = results.filter((r) => r.candidates.length);
  const uniqueCards = new Set(results.flatMap((r) => r.candidates.map((c) => c.nct_id)));
  const methods = new Map<string, number>();
  for (const r of results) if (r.candidates[0]) methods.set(r.candidates[0].match_method, (methods.get(r.candidates[0].match_method) ?? 0) + 1);
  const kinds = new Map<string, number>();
  for (const r of results) kinds.set(r.article_kind, (kinds.get(r.article_kind) ?? 0) + 1);
  const progressInfo = await readJson<Record<string, unknown>>(paths.progress, {});
  const journalLines = existsSync(paths.journal) ? (await readFile(paths.journal, "utf8")).split("\n").filter(Boolean).map((l) => JSON.parse(l)) : [];
  const runs = journalLines.filter((e) => e.event === "run_end");
  const sum = (k: "requests" | "cacheHits" | "serverErrors" | "failed") => runs.reduce((s, e) => s + (e.nct?.[k] ?? 0), 0);
  const ex = (s: ProductStatus, n: number) =>
    results
      .filter((r) => r.status === s)
      .slice(0, n)
      .map((r) => {
        const b = r.candidates[0];
        return `| ${r.product_id} | ${r.article} | ${r.name.replace(/\|/g, "/")} | ${b ? `[${b.nct_name.replace(/\|/g, "/").slice(0, 60)}](${b.nct_url})` : "—"} | ${b?.match_method ?? ""} | ${b?.image_urls.length ?? 0} | ${(b?.reasons ?? []).join(", ").replace(/\|/g, "/").slice(0, 140)} |`;
      })
      .join("\n");
  const md = `# НКТ: полный проход по каталогу SALAMAT

Сформирован: ${new Date().toISOString()} · обработано товаров: ${results.length} из ${progressInfo.total ?? "?"}

## Итог по товарам

| Статус | Товаров | Доля | Что значит |
|---|---|---|---|
| confirmed | ${count("confirmed")} | ${pct(count("confirmed"), results.length)} | тот же GTIN/NTIN/KZTIN, характеристики подтверждены — нужна только письменная санкция правообладателя на фото |
| probable | ${count("probable")} | ${pct(count("probable"), results.length)} | тот же код, но часть характеристик на карточке не указана, или полное совпадение названия и характеристик без кода — ручная проверка + разрешение |
| doubtful | ${count("doubtful")} | ${pct(count("doubtful"), results.length)} | похожее название — ручная проверка |
| mismatch_only | ${count("mismatch_only")} | ${pct(count("mismatch_only"), results.length)} | найдены только карточки с другой дозировкой, формой, объёмом или фасовкой |
| no_candidate | ${count("no_candidate")} | ${pct(count("no_candidate"), results.length)} | в НКТ ничего похожего |
| no_query | ${count("no_query")} | ${pct(count("no_query"), results.length)} | в названии нет слов для поиска |
| error | ${count("error")} | ${pct(count("error"), results.length)} | запросы не удались после повторов — будут повторены |

* Товаров хотя бы с одним кандидатом: ${withCards.length}; уникальных карточек НКТ среди кандидатов: ${uniqueCards.size}; строк кандидатов: ${candidates.length}.
* Метод лучшего кандидата: ${[...methods].map(([k, v]) => `${k} — ${v}`).join(", ")}.
* Формат артикула: ${[...kinds].map(([k, v]) => `${k} — ${v}`).join(", ")}.

## Фото

| Статус фото | Товаров | Доля |
|---|---|---|
${(["confirmed_photo_needs_permission", "probable_photo_needs_review", "doubtful_photo_needs_review", "match_without_photo", "no_usable_candidate", "error"] as PhotoStatus[])
  .map((s) => { const n = results.filter((r) => photoStatus(r) === s).length; return `| ${s} | ${n} | ${pct(n, results.length)} |`; })
  .join("\n")}

* Фото одобрено и опубликовано: **0**. НКТ не даёт права на повторное использование фото, а письменных разрешений правообладателей нет (docs/catalog-photos-nct.md). Фото НКТ не скачивались.
* Правообладателей (производитель + БИН) для запроса разрешения: ${holderRows.length}, товаров у них: ${holderRows.reduce((s, h) => s + h.products, 0)} (permission-requests.csv).

### Крупнейшие правообладатели

| Производитель | БИН | Товаров SALAMAT | Из них confirmed | Карточек НКТ |
|---|---|---|---|---|
${holderRows.slice(0, 25).map((h) => `| ${h.manufacturer.replace(/\|/g, "/")} | ${h.manufacturer_bin || "—"} | ${h.products} | ${h.confirmed_matches} | ${h.nct_cards} |`).join("\n")}

## Запросы к НКТ

Всего HTTP-запросов: ${sum("requests")}, из кэша: ${sum("cacheHits")}, ответов 5xx: ${sum("serverErrors")}, повторов после 429/5xx/сетевых ошибок: ${runs.reduce((s, e) => s + (e.http?.["nct.gov.kz"]?.retries ?? 0), 0)}, окончательно не удалось: ${sum("failed")}.

## Примеры: confirmed

| id | Артикул | Название SALAMAT | Карточка НКТ | Метод | Фото | Замечания |
|---|---|---|---|---|---|---|
${ex("confirmed", 15)}

## Примеры: probable

| id | Артикул | Название SALAMAT | Карточка НКТ | Метод | Фото | Замечания |
|---|---|---|---|---|---|---|
${ex("probable", 15)}

## Примеры: doubtful

| id | Артикул | Название SALAMAT | Карточка НКТ | Метод | Фото | Замечания |
|---|---|---|---|---|---|---|
${ex("doubtful", 10)}

## Примеры: mismatch_only

| id | Артикул | Название SALAMAT | Карточка НКТ | Метод | Фото | Замечания |
|---|---|---|---|---|---|---|
${ex("mismatch_only", 10)}
`;
  await writeFile(join(dir, "report.md"), md);
  console.log(`Отчёт: ${join(dir, "report.md")}`);
  console.log(statuses.map((s) => `${s}: ${count(s)}`).join(", "));
}

// ---------------------------------------------------------------- export

/**
 * Compact copy of the manifest for the repository (data/nct/): text only — no photos. Built from products.csv,
 * candidates.csv and permission-requests.csv of `report`, with fewer columns (all image URLs and queries stay in the
 * work folder).
 */
async function exportData() {
  await report();
  const out = resolve(opt("out") ?? "data/nct");
  await mkdir(out, { recursive: true });
  const read = async (f: string) => Papa.parse<Record<string, string>>((await readFile(join(dir, f), "utf8")).replace(/^﻿/, ""), { header: true, skipEmptyLines: true }).data;
  const pick = (rows: Record<string, string>[], cols: string[]) => "﻿" + Papa.unparse(rows.map((r) => Object.fromEntries(cols.map((c) => [c, r[c] ?? ""]))), { columns: cols });
  await writeFile(
    join(out, "products.csv"),
    pick(await read("products.csv"), [
      "product_id", "article", "name", "article_kind", "status", "photo_status", "photo_grade", "photo_nct_url", "photo_image_url", "photo_image_count",
      "photo_manufacturer", "photo_manufacturer_bin", "best_grade", "best_match_method", "best_nct_url", "best_nct_name", "best_nct_gtin", "best_reasons",
      "candidates", "rights_status", "review_status", "error", "checked_at",
    ]),
  );
  await writeFile(
    join(out, "candidates.csv"),
    pick(await read("candidates.csv"), [
      "product_id", "article", "name", "rank", "nct_id", "nct_url", "nct_name", "nct_gtin", "nct_ntin", "nct_kztin", "image_url", "image_count",
      "manufacturer", "manufacturer_bin", "form", "dosage", "volume", "pack", "match_method", "grade", "name_coverage", "comparison", "reasons",
    ]),
  );
  await writeFile(join(out, "permission-requests.csv"), (await readFile(join(dir, "permission-requests.csv"), "utf8")));
  console.log(`Экспорт: ${out}`);
}

const commands: Record<string, () => Promise<void>> = { run, report, export: exportData };
if (!commands[command]) {
  console.error("Команды: run | report");
  process.exit(2);
}
mkdir(dir, { recursive: true })
  .then(() => commands[command]())
  .catch((e) => {
    console.error(e.stack ?? e);
    process.exit(1);
  });

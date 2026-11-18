// Download, check and convert product photos. Output: WebP and AVIF at 400 and 800 px on the long side,
// original proportions, never upscaled, transparent areas on white, EXIF orientation applied, metadata stripped.
import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp, { type Metadata } from "sharp";
import type { ImageCheck } from "../../src/lib/catalog-photos/match";
import type { Http } from "./http";

export const VARIANT_WIDTHS = [400, 800] as const;
export const VARIANT_FORMATS = ["webp", "avif"] as const;
export type VariantKey = `${(typeof VARIANT_WIDTHS)[number]}.${(typeof VARIANT_FORMATS)[number]}`;

const MAX_DOWNLOAD = 15_000_000;
const ALLOWED_TYPES = new Set(["jpeg", "png", "webp", "avif", "heif", "gif", "tiff"]);
/** Below this long side the package text is unreadable: blocked. */
const MIN_LONG_SIDE = 300;
/** Below this a person should check readability. */
const GOOD_LONG_SIDE = 600;

export interface ProcessedImage {
  check: ImageCheck;
  /** Local files of the variants (only when the check passed). */
  variants: Partial<Record<VariantKey, { path: string; bytes: number; width: number; height: number }>>;
  originalBytes: number;
  originalFormat: string | null;
}

async function exists(p: string) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

/** Gets the original bytes: https URL through the polite client, or a local file from the SALAMAT inbox. */
export async function loadOriginal(location: string, http: Http): Promise<{ bytes: Buffer; contentType: string | null }> {
  if (/^https:\/\//.test(location)) {
    const res = await http.fetchBytes(location, { maxBytes: MAX_DOWNLOAD, timeoutMs: 60_000, headers: { Accept: "image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8" } });
    if (res.status !== 200) throw Object.assign(new Error(`HTTP ${res.status}`), { code: res.status === 404 ? "not_found" : "unavailable" });
    return { bytes: res.body, contentType: res.headers.get("content-type") };
  }
  if (/^[a-z]+:\/\//i.test(location)) throw Object.assign(new Error("only https or local files"), { code: "insecure_url" });
  const bytes = await readFile(location);
  if (bytes.length > MAX_DOWNLOAD) throw Object.assign(new Error("file too large"), { code: "too_large" });
  return { bytes, contentType: null };
}

/** Checks the file and, when it is usable, writes the variants into workDir/images/<sha256>/. Cached by content hash. */
export async function processImage(bytes: Buffer, contentType: string | null, workDir: string): Promise<ProcessedImage> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  if (contentType && !/^image\//i.test(contentType) && !/octet-stream/i.test(contentType)) errors.push(`not_image:${contentType.split(";")[0]}`);

  let meta: Metadata;
  try {
    meta = await sharp(bytes, { failOn: "error", limitInputPixels: 80_000_000 }).metadata();
  } catch {
    return { check: { ok: false, errors: [...errors, "corrupt"], warnings, sha256 }, variants: {}, originalBytes: bytes.length, originalFormat: null };
  }
  if (!meta.format || !ALLOWED_TYPES.has(meta.format)) errors.push(`unsupported_type:${meta.format ?? "unknown"}`);
  // Dimensions after EXIF rotation.
  const swap = (meta.orientation ?? 1) >= 5;
  const width = (swap ? meta.height : meta.width) ?? 0;
  const height = (swap ? meta.width : meta.height) ?? 0;
  const long = Math.max(width, height);
  if (long < MIN_LONG_SIDE) errors.push(`too_small:${width}x${height}`);
  else if (long < GOOD_LONG_SIDE) warnings.push(`low_resolution:${width}x${height}`);
  const ratio = long / Math.max(1, Math.min(width, height));
  if (ratio > 3) warnings.push(`unusual_proportions:${width}x${height}`);

  if (!errors.length) {
    // Content check: a blank or single-colour picture (placeholder, failed scan) is not a product photo.
    const stats = await sharp(bytes).rotate().flatten({ background: "#ffffff" }).resize(64, 64, { fit: "inside" }).stats();
    const spread = Math.max(...stats.channels.slice(0, 3).map((c) => c.stdev));
    if (spread < 6) errors.push("blank");
  }
  const check: ImageCheck = { ok: errors.length === 0, errors, warnings, width, height, sha256 };
  if (!check.ok) return { check, variants: {}, originalBytes: bytes.length, originalFormat: meta.format ?? null };

  const dir = join(workDir, "images", sha256.slice(0, 2), sha256);
  await mkdir(dir, { recursive: true });
  const variants: ProcessedImage["variants"] = {};
  for (const w of VARIANT_WIDTHS) {
    for (const f of VARIANT_FORMATS) {
      const key = `${w}.${f}` as VariantKey;
      const path = join(dir, key);
      if (!(await exists(path))) {
        let pipeline = sharp(bytes).rotate().flatten({ background: "#ffffff" }).resize(w, w, { fit: "inside", withoutEnlargement: true });
        // Mild sharpening keeps small print on the package legible after downscaling.
        if (long > w) pipeline = pipeline.sharpen({ sigma: 0.5 });
        const out = f === "webp" ? pipeline.webp({ quality: 82, effort: 5 }) : pipeline.avif({ quality: 55, effort: 4 });
        await writeFile(path, await out.toBuffer());
      }
      const m = await sharp(path).metadata();
      variants[key] = { path, bytes: (await stat(path)).size, width: m.width ?? 0, height: m.height ?? 0 };
    }
  }
  return { check, variants, originalBytes: bytes.length, originalFormat: meta.format ?? null };
}

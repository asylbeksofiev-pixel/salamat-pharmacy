// Polite HTTP client for the photo pipeline: one queue per host with a minimum pause between requests,
// retries with backoff for temporary failures (honours Retry-After), response size limit and an on-disk cache
// for JSON lookups so that a resumed run does not ask the sources again.
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

/** Minimum pause between requests to one host, in ms. Unknown hosts get DEFAULT_INTERVAL. */
export const HOST_INTERVAL_MS: Record<string, number> = {
  // Open Food Facts documents up to 100 product reads per minute, but answered 429 at ~60/min in the dry run;
  // 2.5 s (24/min) is sustainable. On 429 the interval grows further (see adaptive slow-down below).
  "world.openfoodfacts.org": 2500,
  "world.openbeautyfacts.org": 2500,
  "world.openproductsfacts.org": 2500,
  "images.openfoodfacts.org": 300,
  "images.openbeautyfacts.org": 300,
  "images.openproductsfacts.org": 300,
  // NCT publishes no limit for the public site; stay well below what a person clicking through would cause.
  "nct.gov.kz": 2000,
  // Our own public catalogue API (240 requests/min per IP).
  "salamat-pharmacy.vercel.app": 500,
};
const DEFAULT_INTERVAL = 1000;
const RETRY_STATUSES = new Set([408, 425, 429, 502, 503, 504]);

export class HttpError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

export interface HttpOptions {
  userAgent: string;
  cacheDir?: string;
  /** Cache lifetime for JSON lookups. */
  cacheTtlMs?: number;
  maxRetries?: number;
  log?: (event: Record<string, unknown>) => void;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class Http {
  private nextSlot = new Map<string, number>();
  /** Per-host interval; starts from HOST_INTERVAL_MS and grows ×1.5 (up to 30 s) every time the host answers 429. */
  private interval = new Map<string, number>();
  private chains = new Map<string, Promise<void>>();
  private stats = new Map<string, { requests: number; retries: number; failures: number; bytes: number }>();
  constructor(private readonly opts: HttpOptions) {}

  /** Waits for this host's turn. Requests to one host are serialised; different hosts run in parallel. */
  private async turn(host: string): Promise<void> {
    const prev = this.chains.get(host) ?? Promise.resolve();
    let release!: () => void;
    const mine = new Promise<void>((r) => (release = r));
    this.chains.set(host, prev.then(() => mine));
    await prev;
    const wait = (this.nextSlot.get(host) ?? 0) - Date.now();
    if (wait > 0) await sleep(wait);
    this.nextSlot.set(host, Date.now() + (this.interval.get(host) ?? HOST_INTERVAL_MS[host] ?? DEFAULT_INTERVAL));
    release();
  }

  private stat(host: string) {
    let s = this.stats.get(host);
    if (!s) this.stats.set(host, (s = { requests: 0, retries: 0, failures: 0, bytes: 0 }));
    return s;
  }

  summary() {
    return Object.fromEntries(this.stats);
  }

  /** Fetches a URL and returns the body (at most maxBytes). Retries temporary failures with exponential backoff. */
  async fetchBytes(url: string, init: RequestInit & { timeoutMs?: number; maxBytes?: number } = {}): Promise<{ status: number; headers: Headers; body: Buffer }> {
    const u = new URL(url);
    if (u.protocol !== "https:") throw new HttpError(`only https is allowed: ${url}`, null, false);
    const host = u.hostname;
    const maxRetries = this.opts.maxRetries ?? 4;
    const maxBytes = init.maxBytes ?? 5_000_000;
    for (let attempt = 0; ; attempt++) {
      await this.turn(host);
      const s = this.stat(host);
      s.requests++;
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), init.timeoutMs ?? 30_000);
      try {
        const res = await fetch(url, {
          ...init,
          signal: ctrl.signal,
          redirect: "follow",
          headers: { "User-Agent": this.opts.userAgent, Accept: "application/json, image/*;q=0.9, */*;q=0.1", ...(init.headers ?? {}) },
        });
        if (RETRY_STATUSES.has(res.status) && attempt < maxRetries) {
          if (res.status === 429) {
            const cur = this.interval.get(host) ?? HOST_INTERVAL_MS[host] ?? DEFAULT_INTERVAL;
            this.interval.set(host, Math.min(30_000, Math.round(cur * 1.5)));
          }
          const ra = Number(res.headers.get("retry-after"));
          const delay = Number.isFinite(ra) && ra > 0 ? Math.min(ra * 1000, 300_000) : 2000 * 2 ** attempt;
          s.retries++;
          this.opts.log?.({ event: "http_retry", url, status: res.status, delayMs: delay });
          await res.body?.cancel();
          await sleep(delay);
          continue;
        }
        // Adaptive pacing: server errors slow this host down (×1.25, up to 30 s); successes slowly return to the base pace.
        const base = HOST_INTERVAL_MS[host] ?? DEFAULT_INTERVAL;
        const cur = this.interval.get(host) ?? base;
        if (res.status >= 500) this.interval.set(host, Math.min(30_000, Math.round(cur * 1.25)));
        else if (res.status < 400 && cur > base) this.interval.set(host, Math.max(base, Math.round(cur * 0.97)));
        const declared = Number(res.headers.get("content-length"));
        if (declared > maxBytes) {
          await res.body?.cancel();
          throw new HttpError(`response too large: ${declared} bytes`, res.status, false);
        }
        const chunks: Buffer[] = [];
        let size = 0;
        if (res.body) {
          for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
            size += chunk.byteLength;
            if (size > maxBytes) {
              ctrl.abort();
              throw new HttpError(`response too large: >${maxBytes} bytes`, res.status, false);
            }
            chunks.push(Buffer.from(chunk));
          }
        }
        s.bytes += size;
        return { status: res.status, headers: res.headers, body: Buffer.concat(chunks) };
      } catch (e) {
        if (e instanceof HttpError) {
          s.failures++;
          throw e;
        }
        // Network error or timeout: temporary.
        if (attempt < maxRetries) {
          s.retries++;
          const delay = 2000 * 2 ** attempt;
          this.opts.log?.({ event: "http_retry", url, error: String((e as Error).message ?? e), delayMs: delay });
          await sleep(delay);
          continue;
        }
        s.failures++;
        throw new HttpError(`network error: ${(e as Error).message ?? e}`, null, true);
      } finally {
        clearTimeout(timer);
      }
    }
  }

  /**
   * JSON request with an on-disk cache keyed by method + URL + body. 404 is a valid answer ("not in this source")
   * and is cached too; other errors are not cached.
   */
  async json<T>(url: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<{ status: number; data: T | null; cached: boolean }> {
    const key = createHash("sha256").update(`${init.method ?? "GET"} ${url} ${typeof init.body === "string" ? init.body : ""}`).digest("hex");
    const file = this.opts.cacheDir ? join(this.opts.cacheDir, key.slice(0, 2), `${key}.json`) : null;
    if (file) {
      try {
        const hit = JSON.parse(await readFile(file, "utf8")) as { at: number; status: number; data: T | null };
        if (Date.now() - hit.at < (this.opts.cacheTtlMs ?? 14 * 86_400_000)) return { status: hit.status, data: hit.data, cached: true };
      } catch {
        /* not cached */
      }
    }
    const res = await this.fetchBytes(url, { ...init, maxBytes: 8_000_000 });
    if (res.status >= 500) throw new HttpError(`HTTP ${res.status} from ${new URL(url).hostname}`, res.status, true);
    let data: T | null = null;
    if (res.status < 300 || res.status === 404) {
      try {
        data = JSON.parse(res.body.toString("utf8")) as T;
      } catch {
        if (res.status < 300) throw new HttpError(`invalid JSON from ${new URL(url).hostname}`, res.status, false);
      }
    } else if (res.status !== 400) {
      throw new HttpError(`HTTP ${res.status} from ${new URL(url).hostname}`, res.status, false);
    }
    if (file) {
      await mkdir(join(this.opts.cacheDir!, key.slice(0, 2)), { recursive: true });
      await writeFile(file, JSON.stringify({ at: Date.now(), url, status: res.status, data }));
    }
    return { status: res.status, data, cached: false };
  }
}

// Data providers feed raw catalogue records into the same validation/import pipeline.
// A provider must use an authorised source (file from SALAMAT, accounting-system API) — never scraping.
import type { RawRecord } from "./validate";
import { normalizeHeader } from "./validate";
import { parseImportFile } from "./parse";

export interface DataProvider {
  /** Short code stored as DataSource.code */
  readonly code: string;
  readonly name: string;
  readonly kind: "FILE_IMPORT" | "API";
  fetchRecords(): Promise<{ headers: string[]; records: RawRecord[]; truncated: boolean }>;
}

export class FileDataProvider implements DataProvider {
  readonly kind = "FILE_IMPORT" as const;
  constructor(
    readonly code: string,
    readonly name: string,
    private fileName: string,
    private buffer: Buffer,
  ) {}
  async fetchRecords() {
    const parsed = await parseImportFile(this.fileName, this.buffer);
    return { headers: parsed.headers, records: parsed.records, truncated: parsed.truncated };
  }
}

/**
 * Generic JSON feed from SALAMAT's accounting system. The endpoint must return
 * { "rows": [ { "external_id": "...", "product_name": "...", ... } ] } using the import column names
 * (docs/data-import.md). Configured with CATALOG_API_URL and CATALOG_API_TOKEN.
 */
export class HttpJsonDataProvider implements DataProvider {
  readonly kind = "API" as const;
  constructor(
    readonly code: string,
    readonly name: string,
    private url: string,
    private token?: string,
    private timeoutMs = 30_000,
  ) {}
  async fetchRecords() {
    const res = await fetch(this.url, {
      headers: { Accept: "application/json", ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}) },
      signal: AbortSignal.timeout(this.timeoutMs),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Источник ответил ${res.status}`);
    const body = (await res.json()) as { rows?: unknown };
    if (!Array.isArray(body.rows)) throw new Error("Ответ источника не содержит массив rows");
    const records: RawRecord[] = body.rows.map((r) => {
      const out: RawRecord = {};
      for (const [k, v] of Object.entries(r as Record<string, unknown>)) out[normalizeHeader(k)] = v == null ? "" : String(v);
      return out;
    });
    const headers = Array.from(new Set(records.flatMap((r) => Object.keys(r))));
    return { headers, records, truncated: false };
  }
}

export function apiProviderFromEnv(): HttpJsonDataProvider | null {
  const url = process.env.CATALOG_API_URL;
  if (!url) return null;
  return new HttpJsonDataProvider("salamat-api", process.env.CATALOG_API_NAME || "Учётная система SALAMAT (API)", url, process.env.CATALOG_API_TOKEN);
}

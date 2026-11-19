// RFC 4180 CSV: fields with a comma, quote, CR/LF or edge spaces are quoted, quotes are doubled.
// Used for review reports (written with a UTF-8 BOM so spreadsheet apps detect the encoding) and for reading
// small hand-edited files such as manual category overrides.

export type CsvValue = string | number | bigint | boolean | null | undefined;

export function csvField(value: CsvValue): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  return /[",\r\n]|^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(header: readonly string[], rows: Iterable<readonly CsvValue[]>, { bom = true } = {}): string {
  const lines = [header.map(csvField).join(",")];
  for (const row of rows) lines.push(row.map(csvField).join(","));
  return (bom ? "﻿" : "") + lines.join("\r\n") + "\r\n";
}

/** Parses CSV text into rows of strings (quoted fields may contain commas, quotes and line breaks). */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"' && field === "") quoted = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((f) => f.trim() !== ""));
}

/** Rows as objects keyed by the header row (extra cells are ignored, missing cells are ""). */
export function parseCsvObjects(text: string): Record<string, string>[] {
  const [header, ...rows] = parseCsv(text);
  if (!header) return [];
  const keys = header.map((h) => h.trim());
  return rows.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? "").trim()])));
}

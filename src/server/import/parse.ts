// File parsing for catalogue imports: CSV (UTF-8 or Windows-1251, "," or ";") and XLSX (first sheet).
import Papa from "papaparse";
import type { RawRecord } from "./validate";
import { normalizeHeader } from "./validate";

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_ROWS = 50_000;

export interface ParsedFile {
  headers: string[];
  records: RawRecord[];
  fileType: "csv" | "xlsx";
  truncated: boolean;
}

export class ImportFileError extends Error {}

function decodeText(buf: Buffer): string {
  const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(buf);
  // Many Excel exports in Kazakhstan are Windows-1251: fall back when UTF-8 decoding produced replacement chars.
  if (utf8.includes("�")) {
    try {
      return new TextDecoder("windows-1251").decode(buf);
    } catch {
      return utf8;
    }
  }
  return utf8.replace(/^﻿/, "");
}

export function parseCsv(buf: Buffer): ParsedFile {
  const text = decodeText(buf);
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const delimiter = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const res = Papa.parse<Record<string, string>>(text, {
    header: true,
    delimiter,
    skipEmptyLines: "greedy",
    transformHeader: normalizeHeader,
  });
  const fatal = res.errors.find((e) => e.type === "Quotes");
  if (fatal) throw new ImportFileError(`Ошибка CSV в строке ${(fatal.row ?? 0) + 2}: незакрытые кавычки`);
  const headers = (res.meta.fields ?? []).map(normalizeHeader);
  const truncated = res.data.length > MAX_ROWS;
  return { headers, records: res.data.slice(0, MAX_ROWS), fileType: "csv", truncated };
}

function cellToString(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    const v = value as { text?: string; richText?: { text: string }[]; result?: unknown; hyperlink?: string };
    if (v.richText) return v.richText.map((t) => t.text).join("");
    if (v.text !== undefined) return String(v.text);
    if (v.result !== undefined) return cellToString(v.result);
    if (v.hyperlink) return v.hyperlink;
    return "";
  }
  return String(value);
}

export async function parseXlsx(buf: Buffer): Promise<ParsedFile> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
  } catch {
    throw new ImportFileError("Не удалось прочитать XLSX-файл");
  }
  const ws = wb.worksheets[0];
  if (!ws) throw new ImportFileError("В файле нет листов");
  const headerRow = ws.getRow(1);
  const headers: string[] = [];
  headerRow.eachCell({ includeEmpty: true }, (cell, col) => {
    headers[col - 1] = normalizeHeader(cellToString(cell.value));
  });
  const records: RawRecord[] = [];
  let truncated = false;
  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    if (records.length >= MAX_ROWS) {
      truncated = true;
      return;
    }
    const rec: RawRecord = {};
    headers.forEach((h, i) => {
      if (h) rec[h] = cellToString(row.getCell(i + 1).value);
    });
    records.push(rec);
  });
  return { headers: headers.filter(Boolean), records, fileType: "xlsx", truncated };
}

export async function parseImportFile(fileName: string, buf: Buffer): Promise<ParsedFile> {
  if (buf.length === 0) throw new ImportFileError("Файл пустой");
  if (buf.length > MAX_FILE_BYTES) throw new ImportFileError("Файл больше 10 МБ — разделите его или используйте CLI-импорт");
  const lower = fileName.toLowerCase();
  const isZip = buf[0] === 0x50 && buf[1] === 0x4b;
  if (lower.endsWith(".xlsx") || isZip) return parseXlsx(buf);
  if (lower.endsWith(".csv") || lower.endsWith(".txt")) return parseCsv(buf);
  if (lower.endsWith(".xls")) throw new ImportFileError("Старый формат .xls не поддерживается — сохраните файл как .xlsx или .csv");
  throw new ImportFileError("Поддерживаются файлы .csv и .xlsx");
}

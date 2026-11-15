// Pure validation of catalogue rows (no database access) — unit tested in tests/import.test.ts.

export const IMPORT_COLUMNS = [
  "external_id",
  "salamat_sku",
  "barcode",
  "product_name",
  "full_variant_name",
  "category_path",
  "brand",
  "manufacturer",
  "dosage",
  "form",
  "package_size",
  "volume",
  "prescription_status",
  "pharmacy_code",
  "price_kzt",
  "stock_quantity",
  "image_url",
  "source_name",
  "updated_at",
] as const;

/** Optional extra columns understood by the importer. */
export const OPTIONAL_COLUMNS = ["old_price_kzt", "stock_status", "product_name_kk", "search_aliases"] as const;

export const REQUIRED_COLUMNS = ["product_name", "full_variant_name"] as const;
export const IDENTIFIER_COLUMNS = ["external_id", "salamat_sku", "barcode"] as const;

export type RawRecord = Record<string, string>;

export interface NormalizedRow {
  rowNumber: number;
  externalId: string | null;
  salamatSku: string | null;
  barcode: string | null;
  productName: string;
  productNameKk: string | null;
  fullName: string;
  categoryPath: string[];
  brand: string | null;
  manufacturer: string | null;
  dosage: string | null;
  form: string | null;
  packageSize: string | null;
  packageQuantity: number | null;
  volume: string | null;
  prescriptionStatus: "PRESCRIPTION" | "NON_PRESCRIPTION" | "UNKNOWN";
  pharmacyCode: string | null;
  priceKzt: number | null;
  oldPriceKzt: number | null;
  stockQuantity: number | null;
  stockStatus: "IN_STOCK" | "LOW_STOCK" | "OUT_OF_STOCK" | "ON_REQUEST" | "UNKNOWN" | null;
  imageUrl: string | null;
  sourceName: string | null;
  updatedAt: string | null; // ISO
  searchAliases: string[];
}

export interface RowIssue {
  rowNumber: number;
  column: string | null;
  code: string;
  message: string;
  rawValue: string | null;
  severity: "ERROR" | "WARNING";
}

export interface ValidationResult {
  rows: NormalizedRow[];
  rejected: Set<number>;
  issues: RowIssue[];
  missingColumns: string[];
  unknownColumns: string[];
}

const LIMITS = { name: 300, short: 120, url: 1000 };

/** Header normalisation: "Product Name " -> "product_name". */
export function normalizeHeader(h: string): string {
  return h.replace(/^﻿/, "").trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function clean(v: string | undefined | null): string | null {
  if (v === undefined || v === null) return null;
  const s = String(v).replace(/ /g, " ").replace(/\s+/g, " ").trim();
  return s === "" ? null : s;
}

/** "1 250", "1250.00", "1250,00" -> 1250. Fractions of a tenge are rejected. */
export function parseKzt(v: string | null): number | null | "invalid" {
  if (v === null) return null;
  const s = v.replace(/[\s ₸]|тг\.?|kzt/gi, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return "invalid";
  const n = Number(s);
  if (!Number.isFinite(n) || n <= 0 || n > 10_000_000) return "invalid";
  if (Math.round(n) !== n) return "invalid";
  return n;
}

export function parseQuantity(v: string | null): number | null | "invalid" {
  if (v === null) return null;
  const s = v.replace(/\s/g, "").replace(",", ".");
  if (!/^\d+(\.0+)?$/.test(s)) return "invalid";
  const n = Math.round(Number(s));
  return n > 1_000_000 ? "invalid" : n;
}

export function parsePrescription(v: string | null): { value: NormalizedRow["prescriptionStatus"]; recognized: boolean } {
  if (v === null) return { value: "UNKNOWN", recognized: true };
  const s = v.toLowerCase().replace(/[_-]/g, " ").trim();
  if (["rx", "prescription", "рецептурный", "по рецепту", "рецепт", "да", "yes", "true", "1", "рецепт бойынша"].includes(s))
    return { value: "PRESCRIPTION", recognized: true };
  if (["otc", "non prescription", "без рецепта", "безрецептурный", "нет", "no", "false", "0", "рецептсіз"].includes(s))
    return { value: "NON_PRESCRIPTION", recognized: true };
  if (["unknown", "неизвестно", "не указано", ""].includes(s)) return { value: "UNKNOWN", recognized: true };
  return { value: "UNKNOWN", recognized: false };
}

export function parseStockStatus(v: string | null): NormalizedRow["stockStatus"] | "invalid" {
  if (v === null) return null;
  const s = v.toLowerCase().replace(/[\s-]/g, "_");
  const map: Record<string, NormalizedRow["stockStatus"]> = {
    in_stock: "IN_STOCK",
    есть: "IN_STOCK",
    в_наличии: "IN_STOCK",
    low_stock: "LOW_STOCK",
    мало: "LOW_STOCK",
    out_of_stock: "OUT_OF_STOCK",
    нет: "OUT_OF_STOCK",
    нет_в_наличии: "OUT_OF_STOCK",
    on_request: "ON_REQUEST",
    под_заказ: "ON_REQUEST",
    unknown: "UNKNOWN",
  };
  return map[s] ?? "invalid";
}

/** ISO 8601 or "DD.MM.YYYY[ HH:mm[:ss]]" (Astana time, UTC+5). */
export function parseDate(v: string | null): string | null | "invalid" {
  if (v === null) return null;
  const ru = v.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  let d: Date;
  if (ru) {
    const [, dd, mm, yyyy, hh = "0", mi = "0", ss = "0"] = ru;
    d = new Date(Date.UTC(+yyyy, +mm - 1, +dd, +hh - 5, +mi, +ss));
  } else if (/^\d{4}-\d{2}-\d{2}/.test(v)) {
    d = new Date(/[zZ]|[+-]\d{2}:?\d{2}$/.test(v) || v.length === 10 ? v : `${v}+05:00`);
  } else return "invalid";
  if (Number.isNaN(d.getTime())) return "invalid";
  return d.toISOString();
}

function packageQuantityFrom(packageSize: string | null): number | null {
  if (!packageSize) return null;
  const m = packageSize.match(/(\d+)/);
  return m ? Number(m[1]) : null;
}

export function splitCategoryPath(v: string | null): string[] {
  if (!v) return [];
  return v
    .split(/\s*(?:>|\/|\|)\s*/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 4);
}

export function validateRecords(
  records: RawRecord[],
  opts: { knownPharmacyCodes: Set<string>; now?: Date; headerRow?: string[] },
): ValidationResult {
  const now = opts.now ?? new Date();
  const issues: RowIssue[] = [];
  const rejected = new Set<number>();
  const rows: NormalizedRow[] = [];
  const headers = new Set((opts.headerRow ?? Object.keys(records[0] ?? {})).map(normalizeHeader));
  const missingColumns = REQUIRED_COLUMNS.filter((c) => !headers.has(c)) as string[];
  if (!IDENTIFIER_COLUMNS.some((c) => headers.has(c))) missingColumns.push("external_id | salamat_sku | barcode");
  const known = new Set<string>([...IMPORT_COLUMNS, ...OPTIONAL_COLUMNS]);
  const unknownColumns = [...headers].filter((h) => h && !known.has(h));
  if (missingColumns.length) return { rows, rejected, issues, missingColumns, unknownColumns };

  const seenKeys = new Map<string, number>();
  const skuToExternal = new Map<string, string>();

  records.forEach((rec, idx) => {
    const rowNumber = idx + 2; // header is row 1
    const r: RawRecord = {};
    for (const [k, v] of Object.entries(rec)) r[normalizeHeader(k)] = v;
    const err = (column: string | null, code: string, message: string, raw?: string | null) => {
      issues.push({ rowNumber, column, code, message, rawValue: raw ?? null, severity: "ERROR" });
      rejected.add(rowNumber);
    };
    const warn = (column: string | null, code: string, message: string, raw?: string | null) =>
      issues.push({ rowNumber, column, code, message, rawValue: raw ?? null, severity: "WARNING" });

    if (Object.values(r).every((v) => clean(v) === null)) return; // fully empty line

    const externalId = clean(r.external_id);
    const salamatSku = clean(r.salamat_sku);
    const barcode = clean(r.barcode)?.replace(/\s/g, "") ?? null;
    const productName = clean(r.product_name);
    const fullName = clean(r.full_variant_name);

    if (!productName) err("product_name", "EMPTY_REQUIRED", "Пустое название товара");
    else if (productName.length > LIMITS.name) err("product_name", "TOO_LONG", "Название длиннее 300 символов", productName.slice(0, 50));
    if (!fullName) err("full_variant_name", "EMPTY_REQUIRED", "Пустое полное наименование варианта (SKU)");
    else if (fullName.length > LIMITS.name) err("full_variant_name", "TOO_LONG", "Наименование длиннее 300 символов", fullName.slice(0, 50));
    if (!externalId && !salamatSku && !barcode)
      err("external_id", "NO_IDENTIFIER", "Нет идентификатора: заполните external_id, salamat_sku или barcode");
    if (barcode && !/^\d{8,14}$/.test(barcode)) warn("barcode", "BARCODE_FORMAT", "Штрихкод не похож на EAN/GTIN (8–14 цифр)", barcode);

    const pharmacyCode = clean(r.pharmacy_code);
    if (pharmacyCode && !opts.knownPharmacyCodes.has(pharmacyCode))
      err("pharmacy_code", "UNKNOWN_PHARMACY", "Неизвестный код аптеки — добавьте филиал или исправьте код", pharmacyCode);

    const price = parseKzt(clean(r.price_kzt));
    if (price === "invalid") err("price_kzt", "INVALID_PRICE", "Некорректная цена: нужно целое положительное число тенге", clean(r.price_kzt));
    const oldPrice = parseKzt(clean(r.old_price_kzt));
    if (oldPrice === "invalid") err("old_price_kzt", "INVALID_PRICE", "Некорректная прежняя цена", clean(r.old_price_kzt));
    if (typeof oldPrice === "number" && typeof price === "number" && oldPrice <= price)
      warn("old_price_kzt", "OLD_PRICE_NOT_HIGHER", "Прежняя цена не выше текущей — не будет показана", String(oldPrice));
    const qty = parseQuantity(clean(r.stock_quantity));
    if (qty === "invalid") err("stock_quantity", "INVALID_QUANTITY", "Некорректный остаток: нужно целое число ≥ 0", clean(r.stock_quantity));
    const stockStatus = parseStockStatus(clean(r.stock_status));
    if (stockStatus === "invalid") err("stock_status", "INVALID_STOCK_STATUS", "Неизвестный статус наличия", clean(r.stock_status));

    if ((price !== null || qty !== null || (stockStatus !== null && stockStatus !== "invalid")) && !pharmacyCode)
      err("pharmacy_code", "PHARMACY_REQUIRED", "Цена или остаток указаны без кода аптеки");

    const updated = parseDate(clean(r.updated_at));
    if (updated === "invalid") err("updated_at", "INVALID_DATE", "Некорректная дата: ISO 8601 или ДД.ММ.ГГГГ ЧЧ:ММ", clean(r.updated_at));
    else if (updated && new Date(updated).getTime() > now.getTime() + 3600_000)
      err("updated_at", "FUTURE_DATE", "Дата обновления в будущем", clean(r.updated_at));
    else if (!updated && (price !== null || qty !== null))
      warn("updated_at", "NO_DATE", "Нет даты обновления — будет использовано время импорта");

    const rx = parsePrescription(clean(r.prescription_status));
    if (!rx.recognized) warn("prescription_status", "UNKNOWN_RX_VALUE", "Значение не распознано — статус будет «не подтверждён»", clean(r.prescription_status));

    let imageUrl = clean(r.image_url);
    if (imageUrl) {
      try {
        const u = new URL(imageUrl);
        if (u.protocol !== "https:" || imageUrl.length > LIMITS.url) throw new Error();
      } catch {
        warn("image_url", "INVALID_URL", "Ссылка на изображение должна начинаться с https:// — поле пропущено", imageUrl.slice(0, 80));
        imageUrl = null;
      }
    }

    // Duplicates inside the file: same identity + same pharmacy.
    const identity = externalId ? `ext:${externalId}` : salamatSku ? `sku:${salamatSku}` : barcode ? `bar:${barcode}` : null;
    if (identity) {
      const key = `${identity}|${pharmacyCode ?? "-"}`;
      const first = seenKeys.get(key);
      if (first !== undefined)
        err(null, "DUPLICATE_ROW", `Дубликат строки ${first}: тот же товар и та же аптека`, identity.slice(4));
      else seenKeys.set(key, rowNumber);
    }
    if (salamatSku && externalId) {
      const prev = skuToExternal.get(salamatSku);
      if (prev && prev !== externalId)
        err("salamat_sku", "SKU_CONFLICT", `Артикул уже указан с другим external_id (${prev})`, salamatSku);
      else skuToExternal.set(salamatSku, externalId);
    }

    for (const col of ["brand", "manufacturer", "dosage", "form", "package_size", "volume", "source_name"] as const) {
      const v = clean(r[col]);
      if (v && v.length > LIMITS.short) err(col, "TOO_LONG", `Значение длиннее ${LIMITS.short} символов`, v.slice(0, 50));
    }

    if (rejected.has(rowNumber)) return;
    const packageSize = clean(r.package_size);
    rows.push({
      rowNumber,
      externalId,
      salamatSku,
      barcode,
      productName: productName!,
      productNameKk: clean(r.product_name_kk),
      fullName: fullName!,
      categoryPath: splitCategoryPath(clean(r.category_path)),
      brand: clean(r.brand),
      manufacturer: clean(r.manufacturer),
      dosage: clean(r.dosage),
      form: clean(r.form)?.toLowerCase() ?? null,
      packageSize,
      packageQuantity: packageQuantityFrom(packageSize),
      volume: clean(r.volume),
      prescriptionStatus: rx.value,
      pharmacyCode,
      priceKzt: typeof price === "number" ? price : null,
      oldPriceKzt: typeof oldPrice === "number" ? oldPrice : null,
      stockQuantity: typeof qty === "number" ? qty : null,
      stockStatus: stockStatus === "invalid" ? null : stockStatus,
      imageUrl,
      sourceName: clean(r.source_name),
      updatedAt: typeof updated === "string" ? updated : null,
      searchAliases: (clean(r.search_aliases) ?? "")
        .split(/[;|]/)
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 20),
    });
  });

  return { rows, rejected, issues, missingColumns, unknownColumns };
}

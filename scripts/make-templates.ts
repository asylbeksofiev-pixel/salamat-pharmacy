// Builds data/templates/catalog-import-template.{csv,xlsx}: the column layout plus example rows.
// Example rows use fictional products and the "SAL-01"/"SAL-02" pharmacy codes from the seed.
import { mkdir, writeFile } from "node:fs/promises";
import ExcelJS from "exceljs";
import { IMPORT_COLUMNS, OPTIONAL_COLUMNS } from "../src/server/import/validate";

const header = [...IMPORT_COLUMNS, ...OPTIONAL_COLUMNS];
const rows: Record<string, string>[] = [
  { external_id: "1C-000123", salamat_sku: "SAL-000123", barcode: "4870000000017", product_name: "Пример-препарат", full_variant_name: "Пример-препарат 500 мг №20 табл.", category_path: "Лекарственные средства > Обезболивающие и жаропонижающие", brand: "Пример Лаб", manufacturer: "ТОО «Пример Лаб», Казахстан", dosage: "500 мг", form: "таблетки", package_size: "№20", volume: "", prescription_status: "otc", pharmacy_code: "SAL-01", price_kzt: "450", stock_quantity: "25", image_url: "", source_name: "1С SALAMAT", updated_at: "2026-11-14T09:00:00+05:00", old_price_kzt: "", stock_status: "", product_name_kk: "", search_aliases: "пример;primer" },
  { external_id: "1C-000123", salamat_sku: "SAL-000123", barcode: "4870000000017", product_name: "Пример-препарат", full_variant_name: "Пример-препарат 500 мг №20 табл.", category_path: "Лекарственные средства > Обезболивающие и жаропонижающие", brand: "Пример Лаб", manufacturer: "ТОО «Пример Лаб», Казахстан", dosage: "500 мг", form: "таблетки", package_size: "№20", volume: "", prescription_status: "otc", pharmacy_code: "SAL-02", price_kzt: "470", stock_quantity: "0", image_url: "", source_name: "1С SALAMAT", updated_at: "14.11.2026 09:00", old_price_kzt: "", stock_status: "", product_name_kk: "", search_aliases: "" },
  { external_id: "1C-000124", salamat_sku: "SAL-000124", barcode: "4870000000024", product_name: "Пример-препарат", full_variant_name: "Пример-препарат 250 мг/5 мл сироп 100 мл", category_path: "Лекарственные средства > Обезболивающие и жаропонижающие", brand: "Пример Лаб", manufacturer: "ТОО «Пример Лаб», Казахстан", dosage: "250 мг/5 мл", form: "сироп", package_size: "№1", volume: "100 мл", prescription_status: "", pharmacy_code: "SAL-01", price_kzt: "", stock_quantity: "", image_url: "", source_name: "1С SALAMAT", updated_at: "", old_price_kzt: "", stock_status: "on_request", product_name_kk: "", search_aliases: "" },
  { external_id: "1C-000200", salamat_sku: "SAL-000200", barcode: "4870000000031", product_name: "Пример-тонометр", full_variant_name: "Пример-тонометр автоматический на плечо", category_path: "Медицинские приборы и изделия > Тонометры", brand: "Образец Мед", manufacturer: "", dosage: "", form: "прибор", package_size: "№1", volume: "", prescription_status: "otc", pharmacy_code: "", price_kzt: "", stock_quantity: "", image_url: "", source_name: "1С SALAMAT", updated_at: "", old_price_kzt: "", stock_status: "", product_name_kk: "", search_aliases: "" },
];

function csvCell(s: string) {
  return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

async function main() {
  await mkdir("data/templates", { recursive: true });
  const csv = "﻿" + [header.join(","), ...rows.map((r) => header.map((h) => csvCell(r[h] ?? "")).join(","))].join("\r\n") + "\r\n";
  await writeFile("data/templates/catalog-import-template.csv", csv);
  const wb = new ExcelJS.Workbook();
  wb.creator = "SALAMAT";
  const ws = wb.addWorksheet("catalog");
  ws.addRow(header);
  for (const r of rows) ws.addRow(header.map((h) => r[h] ?? ""));
  ws.getRow(1).font = { bold: true };
  ws.columns.forEach((c) => (c.width = 18));
  ws.views = [{ state: "frozen", ySplit: 1 }];
  const help = wb.addWorksheet("columns");
  help.addRow(["column", "required", "description"]);
  const desc: Record<string, [string, string]> = {
    external_id: ["одно из трёх", "ID товара в учётной системе (основной ключ сопоставления)"],
    salamat_sku: ["одно из трёх", "Артикул SALAMAT"],
    barcode: ["одно из трёх", "Штрихкод EAN/GTIN"],
    product_name: ["да", "Основное торговое название"],
    full_variant_name: ["да", "Точное наименование SKU: название + дозировка + форма + упаковка"],
    category_path: ["нет", "Путь категорий через «>»"],
    brand: ["нет", "Бренд"],
    manufacturer: ["нет", "Производитель"],
    dosage: ["нет", "Дозировка"],
    form: ["нет", "Форма выпуска"],
    package_size: ["нет", "Количество в упаковке, например №20"],
    volume: ["нет", "Объём или масса"],
    prescription_status: ["нет", "rx / otc / пусто (не подтверждено)"],
    pharmacy_code: ["для цены и остатка", "Код аптеки (SAL-01 …), см. админку → Филиалы"],
    price_kzt: ["нет", "Цена в тенге, целое число"],
    stock_quantity: ["нет", "Остаток, целое число ≥ 0"],
    image_url: ["нет", "https-ссылка на изображение из разрешённого источника"],
    source_name: ["нет", "Название источника данных"],
    updated_at: ["желательно", "Дата и время актуальности цены/остатка: ISO 8601 или ДД.ММ.ГГГГ ЧЧ:ММ (время Астаны)"],
    old_price_kzt: ["нет", "Подтверждённая прежняя цена (только настоящая)"],
    stock_status: ["нет", "in_stock / low_stock / out_of_stock / on_request"],
    product_name_kk: ["нет", "Подтверждённое казахское название (если есть)"],
    search_aliases: ["нет", "Варианты написания через «;»"],
  };
  for (const h of header) help.addRow([h, ...(desc[h] ?? ["", ""])]);
  help.getRow(1).font = { bold: true };
  help.columns.forEach((c, i) => (c.width = i === 2 ? 80 : 20));
  await wb.xlsx.writeFile("data/templates/catalog-import-template.xlsx");
  // Public copies for download from the admin panel.
  await mkdir("public/templates", { recursive: true });
  await writeFile("public/templates/catalog-import-template.csv", csv);
  await wb.xlsx.writeFile("public/templates/catalog-import-template.xlsx");
  console.log("data/templates/catalog-import-template.csv and .xlsx written");
}

main();

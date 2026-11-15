// Demo catalogue for development and automated tests. Brands are fictional, prices and stock are invented.
// Loaded only by `npm run db:demo` under a DataSource with isDemo=true, hidden unless SHOW_DEMO_DATA=true.
import type { RawRecord } from "../src/server/import/validate";

interface DemoSku {
  ext: string;
  product: string;
  full: string;
  cat: string;
  brand: string;
  dosage?: string;
  form?: string;
  pack?: string;
  volume?: string;
  rx?: "rx" | "otc" | "";
  base: number;
  aliases?: string;
}

const LS = "Лекарственные средства";
export const DEMO_SKUS: DemoSku[] = [
  { ext: "D-0001", product: "Парацетамол", full: "Парацетамол 200 мг №10 табл.", cat: `${LS} > Обезболивающие и жаропонижающие`, brand: "Демо Фарма", dosage: "200 мг", form: "таблетки", pack: "№10", rx: "otc", base: 150, aliases: "paracetamol;парацетомол" },
  { ext: "D-0002", product: "Парацетамол", full: "Парацетамол 500 мг №10 табл.", cat: `${LS} > Обезболивающие и жаропонижающие`, brand: "Демо Фарма", dosage: "500 мг", form: "таблетки", pack: "№10", rx: "otc", base: 260, aliases: "paracetamol;парацетомол" },
  { ext: "D-0003", product: "Парацетамол", full: "Парацетамол 500 мг №20 табл.", cat: `${LS} > Обезболивающие и жаропонижающие`, brand: "Демо Фарма", dosage: "500 мг", form: "таблетки", pack: "№20", rx: "otc", base: 450, aliases: "paracetamol;парацетомол" },
  { ext: "D-0004", product: "Парацетамол", full: "Парацетамол сироп 120 мг/5 мл 100 мл", cat: `${LS} > Обезболивающие и жаропонижающие`, brand: "Демо Фарма", dosage: "120 мг/5 мл", form: "сироп", volume: "100 мл", pack: "№1", rx: "otc", base: 980, aliases: "paracetamol" },
  { ext: "D-0005", product: "Ибупрофен", full: "Ибупрофен 200 мг №20 табл. п.о.", cat: `${LS} > Обезболивающие и жаропонижающие`, brand: "Пример Лаб", dosage: "200 мг", form: "таблетки", pack: "№20", rx: "otc", base: 520, aliases: "ibuprofen" },
  { ext: "D-0006", product: "Ибупрофен", full: "Ибупрофен 400 мг №20 табл. п.о.", cat: `${LS} > Обезболивающие и жаропонижающие`, brand: "Пример Лаб", dosage: "400 мг", form: "таблетки", pack: "№20", rx: "otc", base: 790, aliases: "ibuprofen" },
  { ext: "D-0007", product: "Амоксициллин", full: "Амоксициллин 500 мг №16 капс.", cat: `${LS} > Антибиотики`, brand: "Пример Лаб", dosage: "500 мг", form: "капсулы", pack: "№16", rx: "rx", base: 1450 },
  { ext: "D-0008", product: "Лоратадин", full: "Лоратадин 10 мг №10 табл.", cat: `${LS} > Противоаллергические`, brand: "Демо Фарма", dosage: "10 мг", form: "таблетки", pack: "№10", rx: "", base: 610 },
  { ext: "D-0009", product: "Натрия хлорид", full: "Натрия хлорид спрей назальный 0,9% 30 мл", cat: `${LS} > Средства от простуды`, brand: "Образец Мед", dosage: "0,9%", form: "спрей", volume: "30 мл", pack: "№1", rx: "otc", base: 1290 },
  { ext: "D-0010", product: "Витамин D3", full: "Витамин D3 2000 МЕ №60 капс.", cat: "Витамины и БАДы > Витамины", brand: "Тест Натурал", dosage: "2000 МЕ", form: "капсулы", pack: "№60", rx: "otc", base: 3200, aliases: "холекальциферол;vitamin d" },
  { ext: "D-0011", product: "Витамин C", full: "Витамин C 500 мг №30 табл. жеват.", cat: "Витамины и БАДы > Витамины", brand: "Тест Натурал", dosage: "500 мг", form: "таблетки жевательные", pack: "№30", rx: "otc", base: 1150, aliases: "аскорбиновая кислота;vitamin c" },
  { ext: "D-0012", product: "Магний B6", full: "Магний B6 №50 табл.", cat: "Витамины и БАДы > Минералы", brand: "Тест Натурал", form: "таблетки", pack: "№50", rx: "otc", base: 2100 },
  { ext: "D-0013", product: "Омега-3", full: "Омега-3 1000 мг №60 капс.", cat: "Витамины и БАДы > Жирные кислоты", brand: "Тест Натурал", dosage: "1000 мг", form: "капсулы", pack: "№60", rx: "otc", base: 4300 },
  { ext: "D-0014", product: "Ромашки цветки", full: "Ромашки цветки 50 г", cat: "Травы и сборы", brand: "Тест Натурал", form: "сырьё растительное", volume: "50 г", pack: "№1", rx: "otc", base: 540 },
  { ext: "D-0015", product: "Шалфея листья", full: "Шалфея листья фильтр-пакеты 1,5 г №20", cat: "Травы и сборы", brand: "Тест Натурал", form: "фильтр-пакеты", volume: "1,5 г", pack: "№20", rx: "otc", base: 690 },
  { ext: "D-0016", product: "Тонометр автоматический", full: "Тонометр автоматический на плечо, манжета 22–32 см", cat: "Медицинские приборы и изделия > Тонометры и термометры", brand: "Образец Мед", form: "прибор", pack: "№1", rx: "otc", base: 18900 },
  { ext: "D-0017", product: "Термометр электронный", full: "Термометр электронный с гибким наконечником", cat: "Медицинские приборы и изделия > Тонометры и термометры", brand: "Образец Мед", form: "прибор", pack: "№1", rx: "otc", base: 2490 },
  { ext: "D-0018", product: "Пластырь бактерицидный", full: "Пластырь бактерицидный 1,9 × 7,2 см №10", cat: "Медицинские приборы и изделия > Перевязочные материалы", brand: "Образец Мед", form: "пластырь", pack: "№10", rx: "otc", base: 320 },
  { ext: "D-0019", product: "Бинт стерильный", full: "Бинт марлевый стерильный 7 м × 14 см", cat: "Медицинские приборы и изделия > Перевязочные материалы", brand: "Образец Мед", form: "бинт", pack: "№1", rx: "otc", base: 280 },
  { ext: "D-0020", product: "Батончик злаковый", full: "Батончик злаковый без добавленного сахара 30 г", cat: "Правильное питание", brand: "Тест Натурал", form: "батончик", volume: "30 г", pack: "№1", rx: "otc", base: 450 },
  { ext: "D-0021", product: "Отруби овсяные", full: "Отруби овсяные 200 г", cat: "Правильное питание", brand: "Тест Натурал", form: "отруби", volume: "200 г", pack: "№1", rx: "otc", base: 890 },
  { ext: "D-0022", product: "Подгузники детские", full: "Подгузники детские размер 3 (4–9 кг) №52", cat: "Мама и малыш", brand: "Пример Лаб", form: "подгузники", pack: "№52", rx: "otc", base: 7900 },
  { ext: "D-0023", product: "Крем под подгузник", full: "Крем под подгузник 50 мл", cat: "Мама и малыш", brand: "Пример Лаб", form: "крем", volume: "50 мл", pack: "№1", rx: "otc", base: 2350 },
  { ext: "D-0024", product: "Крем для сухой кожи", full: "Крем для сухой кожи лица 50 мл", cat: "Лечебная косметика", brand: "Образец Мед", form: "крем", volume: "50 мл", pack: "№1", rx: "otc", base: 5600 },
  { ext: "D-0025", product: "Бальзам для губ", full: "Бальзам для губ восстанавливающий 4,8 г", cat: "Лечебная косметика", brand: "Образец Мед", form: "бальзам", volume: "4,8 г", pack: "№1", rx: "otc", base: 1700 },
  { ext: "D-0026", product: "Зубная паста", full: "Зубная паста для чувствительных зубов 75 мл", cat: "Уход за полостью рта", brand: "Пример Лаб", form: "паста", volume: "75 мл", pack: "№1", rx: "otc", base: 1490 },
  { ext: "D-0027", product: "Ополаскиватель для полости рта", full: "Ополаскиватель для полости рта 250 мл", cat: "Уход за полостью рта", brand: "Пример Лаб", form: "раствор", volume: "250 мл", pack: "№1", rx: "otc", base: 1890 },
  { ext: "D-0028", product: "Мыло жидкое антибактериальное", full: "Мыло жидкое антибактериальное 300 мл", cat: "Гигиена", brand: "Образец Мед", form: "жидкое мыло", volume: "300 мл", pack: "№1", rx: "otc", base: 990 },
  { ext: "D-0029", product: "Салфетки влажные антисептические", full: "Салфетки влажные антисептические №15", cat: "Гигиена", brand: "Образец Мед", form: "салфетки", pack: "№15", rx: "otc", base: 420 },
  { ext: "D-0030", product: "Прокладки гигиенические", full: "Прокладки гигиенические ночные №8", cat: "Гигиена", brand: "Пример Лаб", form: "прокладки", pack: "№8", rx: "otc", base: 1100 },
];

/** Deterministic pseudo-random in [0,1) for (i, j). */
function rnd(i: number, j: number, salt = 0): number {
  let h = (i * 374761393 + j * 668265263 + salt * 2147483647) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

type Cell = { price?: number; old?: number; qty?: number | null; status?: string; ageHours: number } | null;

/** Fixed scenarios in the first pharmacies, used by e2e tests. */
const FIXED: Record<string, Record<string, Cell>> = {
  "D-0003": { "SAL-01": { price: 450, qty: 25, ageHours: 2 }, "SAL-02": { price: 470, qty: 10, ageHours: 2 } },
  "D-0002": { "SAL-01": { price: 260, qty: 2, ageHours: 2 }, "SAL-02": { price: 275, qty: 30, ageHours: 2 } },
  "D-0001": { "SAL-01": null, "SAL-02": { price: 160, qty: 12, ageHours: 3 } },
  "D-0005": { "SAL-01": { price: 520, ageHours: 4 }, "SAL-02": { price: 540, qty: 8, ageHours: 4 } },
  "D-0006": { "SAL-01": { price: 790, qty: 0, ageHours: 4 }, "SAL-02": { price: 810, qty: 6, ageHours: 4 } },
  "D-0016": { "SAL-01": { price: 18900, qty: 4, ageHours: 24 * 10 }, "SAL-02": { price: 19500, qty: 2, ageHours: 5 } },
  "D-0007": { "SAL-01": { price: 1450, qty: 9, ageHours: 3 } },
  "D-0012": { "SAL-01": { price: 1890, old: 2100, qty: 14, ageHours: 3 } },
  "D-0010": { "SAL-01": { price: 3200, qty: 7, ageHours: 3 } },
};

export function demoRecords(pharmacyCodes: string[], now = new Date()): RawRecord[] {
  const out: RawRecord[] = [];
  DEMO_SKUS.forEach((s, i) => {
    const base: RawRecord = {
      external_id: s.ext,
      salamat_sku: `DEMO-${s.ext.slice(2)}`,
      barcode: `0000000${String(i + 1).padStart(6, "0")}`,
      product_name: s.product,
      full_variant_name: s.full,
      category_path: s.cat,
      brand: s.brand,
      manufacturer: `${s.brand} (демо)`,
      dosage: s.dosage ?? "",
      form: s.form ?? "",
      package_size: s.pack ?? "",
      volume: s.volume ?? "",
      prescription_status: s.rx ?? "",
      image_url: "",
      source_name: "Демо-набор",
      search_aliases: s.aliases ?? "",
    };
    let wrote = false;
    pharmacyCodes.forEach((code, j) => {
      let cell: Cell;
      if (FIXED[s.ext] && code in FIXED[s.ext]) cell = FIXED[s.ext][code];
      else {
        const r = rnd(i, j);
        const factor = 0.94 + rnd(i, j, 1) * 0.14;
        const price = Math.round((s.base * factor) / 10) * 10;
        if (r < 0.55) cell = { price, qty: 5 + Math.floor(rnd(i, j, 2) * 35), ageHours: 1 + Math.floor(rnd(i, j, 3) * 12) };
        else if (r < 0.65) cell = { price, qty: 1 + Math.floor(rnd(i, j, 2) * 3), ageHours: 3 };
        else if (r < 0.75) cell = { price, qty: 0, ageHours: 3 };
        else if (r < 0.85) cell = { price, ageHours: 6 };
        else if (r < 0.9) cell = { price, qty: 10, ageHours: 24 * 6 };
        else cell = null;
      }
      if (!cell) return;
      wrote = true;
      out.push({
        ...base,
        pharmacy_code: code,
        price_kzt: cell.price !== undefined ? String(cell.price) : "",
        old_price_kzt: cell.old !== undefined ? String(cell.old) : "",
        stock_quantity: cell.qty !== undefined && cell.qty !== null ? String(cell.qty) : "",
        updated_at: new Date(now.getTime() - cell.ageHours * 3600_000).toISOString(),
      });
    });
    if (!wrote) out.push({ ...base, pharmacy_code: "", price_kzt: "", stock_quantity: "", updated_at: "" });
  });
  return out;
}

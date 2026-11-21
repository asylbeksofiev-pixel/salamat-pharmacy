// Product features read literally from a catalogue product name (public.pharmacy_products has only id, article and
// name): the leading word (brand, product line or medicine name), the brand line, the product type, the dosage form,
// volume or weight and the pack count. Nothing is inferred beyond what the name says: no substance, indication or
// compatibility. Used for "Similar products", the home page selection and the product characteristics.
import { parseAttributes, type Form } from "./catalog-photos/attributes";

export interface ProductFeatures {
  /** Leading word of the name: the brand ("биодерма", "tomiko") or the medicine name ("парацетамол"). */
  key: string | null;
  /** Brand line: the first Latin word after the leading word ("sebium", "sensibio"), when there is one. */
  line: string | null;
  /** Product type from a fixed dictionary ("micellar", "nappies", "shampoo"); null when the name does not say. */
  type: string | null;
  /** Dosage or product form as written in the name (tablet, capsule, syrup, cream…). */
  form: Form | null;
  /** The name without sizes, volumes, counts and trailing codes: the same product in another size has the same base. */
  base: string;
}

/** Generic leading words that say nothing about what the product is. */
const GENERIC = new Set(["набор", "комплект", "средство", "товар", "тестовый", "test", "set", "new", "для", "the"]);

export function normalizeProductName(name: string): string {
  return ` ${name} `
    .normalize("NFKC")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/(?<![\p{L}])д[/.](?=\s?\p{L})/gu, "для ")
    .replace(/[«»"“”„'’`]/g, " ")
    .replace(/\s+/g, " ");
}

// Order matters: specific types before general ones ("гель для душа" before "гель", "крем для рук" before "крем").
// The third element: name fragments to look for candidates of the same type in SQL (LIKE, normalised names).
const TYPES: [RegExp, string, string[]][] = [
  [/мицеллярн/u, "micellar", ["мицеллярн"]],
  [/термальн\p{L}* вод/u, "thermal-water", ["термальн"]],
  [/гел\p{L}* для душа|масло для душа|для душа/u, "shower", ["для душа"]],
  [/для интимн|интим/u, "intimate", ["интим"]],
  [/для умывания|гель-мусс|гель-пенк|пенк|мусс/u, "cleanser", ["для умывания", "мусс", "пенк"]],
  [/шампун/u, "shampoo", ["шампун"]],
  [/кондиционер для волос|бальзам для волос|бальзам-ополаскиватель|маска для волос/u, "hair-care", ["для волос", "ополаскиват"]],
  [/для губ|помада/u, "lip", ["для губ", "помада"]],
  [/для рук|для ногтей/u, "hand", ["для рук", "для ногтей"]],
  [/(?<![\p{L}])spf|солнцезащит|после загара/u, "sun", ["spf", "солнцезащит", "загар"]],
  [/вокруг глаз|контура глаз|для век/u, "eye", ["вокруг глаз", "контура глаз", "для век"]],
  [/сыворотк|serum/u, "serum", ["сыворотк", "serum"]],
  [/тоник/u, "toner", ["тоник"]],
  [/дезодорант|антиперспирант/u, "deodorant", ["дезодорант", "антиперспирант"]],
  [/зубн\p{L}* паст|паста зубн|(?<![\p{L}])з п(?![\p{L}])/u, "toothpaste", ["зубн", "паста"]],
  [/зубн\p{L}* щетк|щетка зубн/u, "toothbrush", ["щетк"]],
  [/зубн\p{L}* нит|флосс|floss|ершик|межзубн/u, "floss", ["нит", "флосс", "floss", "ершик", "межзубн"]],
  [/ополаскиват/u, "mouthwash", ["ополаскиват"]],
  [/послеродов|для мам(?![\p{L}])|для рожениц/u, "postpartum", ["послеродов", "для мам", "рожениц"]],
  [/подгузн|трусики|трусы (?:одноразов|впитыва|для плавания)|нижнее белье/u, "nappies", ["подгузн", "трусик", "трусы", "белье"]],
  [/пеленк/u, "underpads", ["пеленк"]],
  [/прокладк/u, "pads", ["прокладк"]],
  [/тампон/u, "tampons", ["тампон"]],
  [/салфетк/u, "wipes", ["салфетк"]],
  [/презерватив/u, "condoms", ["презерватив"]],
  [/пустышк|(?<![\p{L}])соск[аи](?![\p{L}])/u, "pacifier", ["пустышк", "соск"]],
  [/бутылочк|поильник/u, "bottle", ["бутылочк", "поильник"]],
  [/для стирки|стиральн|пятновывод|отбеливатель/u, "laundry", ["стирк", "стиральн", "пятновывод", "отбеливатель"]],
  [/посуд/u, "dishes", ["посуд"]],
  [/(?<![\p{L}])смесь|молочная смесь/u, "formula", ["смесь"]],
  [/(?<![\p{L}])пюре/u, "puree", ["пюре"]],
  [/(?<![\p{L}])каша/u, "porridge", ["каша"]],
  [/(?<![\p{L}])чай|фиточай|(?<![\p{L}])сбор(?![\p{L}])/u, "tea", ["чай", "сбор"]],
  [/мармелад|леденц|конфет|шоколад|батончик|печенье/u, "sweets", ["мармелад", "леденц", "конфет", "шоколад", "батончик", "печенье"]],
  [/тонометр/u, "tonometer", ["тонометр"]],
  [/термометр|градусник/u, "thermometer", ["термометр", "градусник"]],
  [/глюкометр/u, "glucometer", ["глюкометр"]],
  [/тест-полоск|тест полоск/u, "test-strips", ["тест-полоск", "тест полоск"]],
  [/ланцет/u, "lancets", ["ланцет"]],
  [/небулайзер|ингалятор/u, "inhaler-device", ["небулайзер", "ингалятор"]],
  [/(?<![\p{L}])тест(?![\p{L}])|тест-систем|экспресс-тест/u, "test", ["тест"]],
  [/бинт/u, "bandage", ["бинт"]],
  [/пластыр/u, "plaster", ["пластыр"]],
  [/перчатк/u, "gloves", ["перчатк"]],
  [/шприц(?!-ручк)|игл[аы](?![\p{L}])/u, "syringe", ["шприц", "игл"]],
  [/бандаж|корсет|ортез|корректор\p{L}* осанки|пояс/u, "support", ["бандаж", "корсет", "ортез", "корректор", "пояс"]],
  [/компрессионн|чулки|колготки|гольфы/u, "compression", ["компрессионн", "чулки", "колготки", "гольфы"]],
  [/наколенник|налокотник|напалечник|фиксатор/u, "brace", ["наколенник", "налокотник", "напалечник", "фиксатор"]],
  [/(?<![\p{L}])мыло/u, "soap", ["мыло"]],
  [/(?<![\p{L}])маск[аи](?! медицин)/u, "mask", ["маск"]],
  [/скраб|пилинг/u, "scrub", ["скраб", "пилинг"]],
  [/лосьон/u, "lotion", ["лосьон"]],
  [/(?<![\p{L}])крем/u, "cream", ["крем"]],
  [/бальзам/u, "balm", ["бальзам"]],
  [/(?<![\p{L}])гель/u, "gel", ["гель"]],
  [/(?<![\p{L}])масло/u, "oil", ["масло"]],
  [/(?<![\p{L}])спрей/u, "spray", ["спрей"]],
];

const NAPPY_CARE = /(?<![\p{L}])(?:крем|мазь|присыпк|салфетк|масл|лосьон|пенк|гел|бальзам|спрей)/u;

/** Name fragments that find products of this type in SQL (normalised names), for candidate queries. */
export function typeFragments(type: string | null): string[] {
  return type ? (TYPES.find(([, t]) => t === type)?.[2] ?? []) : [];
}

/** "р-р" followed by a size label is a size ("р-р L", "р-р 2"), not "раствор". */
const SIZE_RR = /р-р\s*(?:[xх]{0,4}[smlмл](?![\p{L}])|nb|xs|\d{1,2}(?![\d.,%]|\s?(?:мл|мг|%)))/u;

/** Sizes, volumes, counts, sizes and trailing article-like codes removed: "крем 50 мл 123/456" → "крем". */
export function baseName(name: string): string {
  return normalizeProductName(name)
    .replace(/\([^)]*\)/g, " ")
    .replace(/\d+(?:[.,]\d+)?\s*(?:мл|ml|л|l|гр|г|g|кг|kg|шт|pcs|мг|mg|мкг|mcg|ме|iu|ед|%|см|мм|м)(?![\p{L}])/gu, " ")
    .replace(/(?:№|no)\s*\d+(?:\s*\(\s*\d+\s*\))?/g, " ")
    .replace(/(?:р-р|размер|рост|арт\.?)\s*\S+/g, " ")
    .replace(/(?<![\p{L}])(?:[xх]{0,4}[smlмл]|nb|xs)(?:\/[xх]{0,4}[smlмл])?(?![\p{L}])/gu, " ")
    .replace(/[\d/_*+.,-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function productFeatures(name: string): ProductFeatures {
  const n = normalizeProductName(name ?? "");
  // Words of the name without bracketed aliases: "Биодерма (Bioderma) Sebium …" → биодерма, sebium, …
  const words = n
    .replace(/\([^)]*\)/g, " ")
    .split(/[\s,.;:!?()[\]{}/\\|+*]+/)
    .filter(Boolean);
  const first = words[0];
  const key = first && /^\p{L}[\p{L}-]{3,}$/u.test(first) && !GENERIC.has(first) ? first.replace(/-+$/, "") : null;
  let type: string | null = null;
  for (const [re, t] of TYPES) {
    // A cream, powder or wipes "for nappies" is skin care, not a nappy.
    if (t === "nappies" && NAPPY_CARE.test(n)) continue;
    if (re.test(n)) {
      type = t;
      break;
    }
  }
  const second = words[1];
  const line = key && second && /^[a-z][a-z0-9+-]{2,}$/.test(second) ? second : null;
  const forms = parseAttributes(name).forms.filter((f) => !(f === "solution" && SIZE_RR.test(n) && !/раствор|инъек|иньек|в\/в|в\/м/u.test(n)));
  return { key, line, type, form: forms[0] ?? null, base: baseName(name) };
}

/** Characteristics shown on the product page — only what the name literally contains. */
export interface NameDetails {
  form: Form | null;
  /** Volume or weight as written, e.g. "500 мл", "40 гр". */
  contents: string[];
  /** Pack count, e.g. 10 (from "№ 10", "48 шт"). */
  count: number | null;
  /** Strength as written, e.g. "500 мг", "0,1%". */
  dosages: string[];
}

// Net volume or weight; kilograms are left out (in nappy names "9-14 кг" is the baby's weight, not the pack).
const CONTENT_RE = /(?<![\d.,/-])(\d+(?:[.,]\d+)?)\s*(мл|ml|л|гр|г)(?![\p{L}])/giu;
const DOSE_RE = /(?<![\d.,])(\d+(?:[.,]\d+)?)\s*(мг\/мл|мг\/\s?\d+\s?мл|мг|мкг|ме|ед|%)(?![\p{L}])/giu;

export function nameDetails(name: string): NameDetails {
  const raw = name ?? "";
  const attrs = parseAttributes(raw);
  const n = normalizeProductName(raw);
  const forms = attrs.forms.filter((f) => !(f === "solution" && SIZE_RR.test(n) && !/раствор|инъек|иньек|в\/в|в\/м/u.test(n)));
  // Bracketed parts hold weights, ages and codes ("(9-14 кг)", "(0-6 мес)"), not the pack contents.
  const plain = raw.replace(/\([^)]*\)/g, " ");
  const contents = [...new Set([...plain.matchAll(CONTENT_RE)].map((m) => `${m[1]} ${m[2].toLowerCase()}`))].slice(0, 2);
  const dosages = [...new Set([...plain.matchAll(DOSE_RE)].map((m) => `${m[1]}${m[2] === "%" ? "" : " "}${m[2].toLowerCase()}`))].slice(0, 3);
  // One clear pack count only: "№ 10" or "48 шт"; several different numbers ("№ 6 (№30)") are not shown.
  const counts = [...new Set(attrs.counts)];
  return { form: forms[0] ?? null, contents, count: counts.length === 1 ? counts[0] : null, dosages };
}

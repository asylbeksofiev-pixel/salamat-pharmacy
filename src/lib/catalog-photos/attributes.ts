// Package characteristics parsed from product names ("Парацетамол 500 мг №20 табл.", "NOW. Alpha Lipoic Acid 100 mg 60 vcaps").
// Used to make sure a photo found by barcode shows the same strength, form, volume and pack size.

export type Form =
  | "tablet"
  | "capsule"
  | "solution"
  | "suspension"
  | "syrup"
  | "drops"
  | "spray"
  | "ointment"
  | "cream"
  | "gel"
  | "suppository"
  | "powder"
  | "granules"
  | "ampoule"
  | "lozenge"
  | "patch"
  | "emulsion"
  | "lotion"
  | "shampoo"
  | "balm";

export interface PackAttributes {
  /** Strengths, normalised: "500mg", "120mg/5ml", "20%", "1000iu". */
  dosages: string[];
  forms: Form[];
  /** Net content, normalised to ml or g: "100ml", "35g". */
  contents: string[];
  /** Units in the pack ("№20", "60 caps", "20 шт"). */
  counts: number[];
}

// Order matters: longer/more specific stems first. Stems are matched at a word start.
const FORM_STEMS: [RegExp, Form][] = [
  [/^(табл|таб\b|таб\.|tab|tabs|tablet|драже|dragee)/, "tablet"],
  [/^(капсул|капс|caps|capsul|vcaps|softgel|гелькапс)/, "capsule"],
  [/^(суспенз|сусп|suspens|susp)/, "suspension"],
  [/^(сироп|syrup)/, "syrup"],
  [/^(капли|капл|drops)/, "drops"],
  [/^(спрей|аэроз|spray)/, "spray"],
  [/^(мазь|ointment)/, "ointment"],
  [/^(крем|cream)/, "cream"],
  [/^(гель|gel\b|gel$)/, "gel"],
  [/^(супп|свеч|suppos)/, "suppository"],
  [/^(порош|пор\.|powder|саше|sachet)/, "powder"],
  [/^(гранул|granul)/, "granules"],
  [/^(ампул|амп\b|амп\.|amp\b|ampoule)/, "ampoule"],
  [/^(пастил|леден|lozeng)/, "lozenge"],
  [/^(пластыр|patch)/, "patch"],
  [/^(эмульс|emuls)/, "emulsion"],
  [/^(лосьон|lotion)/, "lotion"],
  [/^(шампун|shampoo)/, "shampoo"],
  [/^(бальзам|balm)/, "balm"],
  [/^(раствор|р-р|рр\b|solution|sol\b|инфуз|д\/ин|для инъек|injection)/, "solution"],
];

function num(s: string): number {
  return Number(s.replace(",", "."));
}

/** 0.5 → "0.5", 500 → "500". */
function fmtNum(n: number): string {
  return String(Math.round(n * 1000) / 1000);
}

const MASS: Record<string, [string, number]> = {
  мг: ["mg", 1],
  mg: ["mg", 1],
  мкг: ["mcg", 1],
  mcg: ["mcg", 1],
  µg: ["mcg", 1],
  мкгр: ["mcg", 1],
  ме: ["iu", 1],
  iu: ["iu", 1],
  ед: ["iu", 1],
  me: ["iu", 1],
};

const CONTENT: Record<string, [string, number]> = {
  мл: ["ml", 1],
  ml: ["ml", 1],
  л: ["ml", 1000],
  l: ["ml", 1000],
  г: ["g", 1],
  гр: ["g", 1],
  g: ["g", 1],
  кг: ["g", 1000],
  kg: ["g", 1000],
};

function normalise(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFC")
    .replace(/ё/g, "е")
    .replace(/\s+/g, " ");
}

export function parseAttributes(text: string | null | undefined): PackAttributes {
  const s = normalise(text ?? "");
  const dosages = new Set<string>();
  const contents = new Set<string>();
  const counts = new Set<number>();
  const forms = new Set<Form>();
  const N = String.raw`(\d+(?:[.,]\d+)?)`;

  // Strength per volume: "120 мг/5 мл", "4mg/ml".
  const perVolume = new RegExp(String.raw`${N}\s*(мг|mg|мкг|mcg|ме|iu)\s*\/\s*${N}?\s*(мл|ml)`, "g");
  let rest = s.replace(perVolume, (_m, a: string, u: string, b: string | undefined) => {
    dosages.add(`${fmtNum(num(a))}${MASS[u][0]}/${b ? fmtNum(num(b)) : "1"}ml`);
    return " ";
  });
  // Combined strengths: "500мг+150мг", "500 мг + 150 мг".
  rest = rest.replace(new RegExp(String.raw`${N}\s*(мг|mg|мкг|mcg|µg|ме|iu|ед)(?![a-zа-я])`, "g"), (_m, a: string, u: string) => {
    const [unit, k] = MASS[u];
    dosages.add(`${fmtNum(num(a) * k)}${unit}`);
    return " ";
  });
  rest = rest.replace(new RegExp(String.raw`${N}\s*%`, "g"), (_m, a: string) => {
    dosages.add(`${fmtNum(num(a))}%`);
    return " ";
  });
  // Net content: "100 мл", "35 гр", "0,5 л". Not followed by a letter (so "г" in "гель" is not grams).
  rest = rest.replace(new RegExp(String.raw`${N}\s*(мл|ml|л|l|кг|kg|гр|г|g)(?![a-zа-я])\.?`, "g"), (_m, a: string, u: string) => {
    const [unit, k] = CONTENT[u];
    contents.add(`${fmtNum(num(a) * k)}${unit}`);
    return " ";
  });
  // Pack size: "№20", "N 20", "№ 6 (№30)", "20 шт", "60 caps", "120 табл". "×" is left alone: it marks dimensions ("7 м × 14 см").
  for (const m of rest.matchAll(/(?:№|(?<![a-zа-я])n)\s*(\d{1,4})(?!\d)/g)) counts.add(Number(m[1]));
  for (const m of rest.matchAll(/(?<![\d.,])(\d{1,4})\s*(шт|pcs|caps|vcaps|softgels|tabs|tablets|капс|табл|таб|пак|саше|ампул|амп|супп|пластыр)/g)) counts.add(Number(m[1]));

  for (const word of s.split(/[\s,;()]+/)) {
    for (const [re, form] of FORM_STEMS) {
      if (re.test(word)) {
        forms.add(form);
        break;
      }
    }
  }
  return { dosages: [...dosages].sort(), forms: [...forms].sort(), contents: [...contents].sort(), counts: [...counts].sort((a, b) => a - b) };
}

export type AttributeKey = "dosage" | "form" | "content" | "count";

export interface AttributeComparison {
  /** consistent: every characteristic of the product is confirmed by the candidate and none contradicts it. */
  status: "consistent" | "mismatch" | "insufficient";
  /** Characteristics present on both sides that agree. */
  confirmed: AttributeKey[];
  /** Characteristics present on both sides that disagree, with both values. */
  mismatches: { key: AttributeKey; product: string; candidate: string }[];
  /** Characteristics of the product that the candidate does not state (cannot be confirmed). */
  unverified: AttributeKey[];
}

const KEYS: [AttributeKey, keyof PackAttributes][] = [
  ["dosage", "dosages"],
  ["form", "forms"],
  ["content", "contents"],
  ["count", "counts"],
];

/** Liquid forms are often written either way ("раствор" vs "капли", "сироп"), so only solid ↔ liquid conflicts count. */
const FORM_GROUP: Record<Form, string> = {
  tablet: "solid",
  capsule: "solid",
  lozenge: "solid",
  suppository: "suppository",
  powder: "powder",
  granules: "powder",
  solution: "liquid",
  suspension: "liquid",
  syrup: "liquid",
  drops: "liquid",
  emulsion: "liquid",
  ampoule: "liquid",
  spray: "spray",
  ointment: "topical",
  cream: "topical",
  gel: "topical",
  balm: "topical",
  lotion: "topical",
  shampoo: "topical",
  patch: "patch",
};

function overlaps(key: AttributeKey, a: (string | number)[], b: (string | number)[]): boolean {
  if (key === "form") {
    const ga = new Set((a as Form[]).map((f) => FORM_GROUP[f]));
    return (b as Form[]).some((f) => ga.has(FORM_GROUP[f]));
  }
  // Every value stated for the product must be stated by the candidate (both strengths of a combination, etc.).
  // For pack size one common value is enough: "№ 6 (№30)" lists the dispensed and the original pack.
  if (key === "count") return a.some((v) => b.includes(v));
  return a.every((v) => b.includes(v));
}

export function compareAttributes(product: PackAttributes, candidate: PackAttributes): AttributeComparison {
  const confirmed: AttributeKey[] = [];
  const mismatches: AttributeComparison["mismatches"] = [];
  const unverified: AttributeKey[] = [];
  for (const [key, field] of KEYS) {
    const a = product[field] as (string | number)[];
    const b = candidate[field] as (string | number)[];
    if (!a.length) continue;
    if (!b.length) unverified.push(key);
    else if (overlaps(key, a, b)) confirmed.push(key);
    else mismatches.push({ key, product: a.join(", "), candidate: b.join(", ") });
  }
  const status = mismatches.length ? "mismatch" : unverified.length ? "insufficient" : "consistent";
  return { status, confirmed, mismatches, unverified };
}

/** Human-readable summary of characteristics: "500mg; tablet; №20". */
export function describeAttributes(a: PackAttributes): string {
  return [a.dosages.join("+"), a.forms.join("/"), a.contents.join(", "), a.counts.length ? `№${a.counts.join("/")}` : ""].filter(Boolean).join("; ");
}

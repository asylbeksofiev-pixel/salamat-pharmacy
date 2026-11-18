// Name similarity for candidates found by name (not by barcode). Tells "the same product" from "the same brand, another
// variant": every significant word of the SALAMAT name must be present in the candidate (coverage), and the candidate
// must not add many words of its own (reverse coverage) — that is how other flavours, aromas or versions show up.
// Strength, form, volume and pack size are compared separately (attributes.ts).

const STOP = new Set([
  "для", "и", "с", "со", "в", "во", "на", "по", "от", "из", "без", "при", "к", "а", "the", "and", "of", "for", "with",
  "шт", "уп", "упак", "упаковка", "мг", "мкг", "мл", "гр", "г", "л", "кг", "ме", "mg", "mcg", "ml", "g", "pcs",
  "таблетки", "таблетка", "табл", "таб", "капсулы", "капсула", "капс", "caps", "vcaps", "tabs", "tablets", "раствор", "р-р",
  "рр", "порошок", "пор", "суспензия", "сусп", "сироп", "мазь", "крем", "гель", "капли", "спрей", "суппозитории", "супп",
  "свечи", "ампулы", "амп", "инъекций", "иньекций", "инфузий", "приготовления", "приема", "внутрь", "наружного",
  "применения", "покрытые", "пленочной", "оболочкой", "оболочкой", "фасовка", "комплект", "ассортименте", "ассортимент",
  "№", "n", "x", "д", "тов", "товар", "фарм", "pharm", "pharma", "farm", "лаб", "lab", "veg", "vcap", "softgels", "растительных",
]);

const CYR_TO_LAT: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ж: "zh", з: "z", и: "i", й: "i", к: "k", л: "l", м: "m", н: "n", о: "o",
  п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "c", ч: "ch", ш: "sh", щ: "sh", ъ: "", ы: "y", ь: "", э: "e",
  ю: "yu", я: "ya", ә: "a", ғ: "g", қ: "k", ң: "n", ө: "o", ұ: "u", ү: "u", һ: "h", і: "i",
};

/** A word that carries meaning for search: letters, at least 3 of them, not a preposition/unit/form word. */
export function isSignificantWord(word: string): boolean {
  const w = word.toLowerCase().replace(/ё/g, "е");
  return (w.match(/\p{L}/gu) ?? []).length >= 3 && !STOP.has(w);
}

/** Latin skeleton of a word so that "Бюбхен" and "Bubchen", "Алфавит" and "Alfavit" can be compared. */
export function translit(word: string): string {
  return [...word.toLowerCase().replace(/ё/g, "е")]
    .map((c) => CYR_TO_LAT[c] ?? c)
    .join("")
    // One spelling for sounds written differently across alphabets: Бюбхен / Bubchen / Buebchen → "bubhen".
    .replace(/ph/g, "f")
    .replace(/ck/g, "k")
    .replace(/ue/g, "u")
    .replace(/yu/g, "u")
    .replace(/ya/g, "a")
    .replace(/[ck]h/g, "h")
    .replace(/c(?=[aou])/g, "k")
    .replace(/w/g, "v")
    .replace(/x/g, "ks")
    .replace(/y/g, "i")
    .replace(/(.)\1+/g, "$1")
    .replace(/[^a-z0-9]/g, "");
}

const LATIN_LOOKALIKE: Record<string, string> = { A: "А", B: "В", C: "С", E: "Е", H: "Н", K: "К", M: "М", O: "О", P: "Р", T: "Т", X: "Х", Y: "У", a: "а", c: "с", e: "е", o: "о", p: "р", x: "х", y: "у" };

/**
 * Latin letters typed instead of identical-looking Cyrillic ones ("BKУCOM AHAHACA" → "ВКУСОМ АНАНАСА"). Only in names
 * written mostly in Cyrillic, and only in words that mix alphabets or consist entirely of look-alike capitals.
 */
export function fixHomoglyphs(name: string): string {
  const cyr = (name.match(/\p{Script=Cyrillic}/gu) ?? []).length;
  const lat = (name.match(/\p{Script=Latin}/gu) ?? []).length;
  return name.replace(/[\p{L}]+/gu, (w) => {
    // A word mixing alphabets with only look-alike Latin letters is always Cyrillic ("BKУCOM").
    const mixed = /\p{Script=Cyrillic}/u.test(w) && /\p{Script=Latin}/u.test(w) && [...w].every((ch) => /\p{Script=Cyrillic}/u.test(ch) || ch in LATIN_LOOKALIKE);
    // A word of look-alike capitals only ("AHAHACA") — only when the name is mostly Cyrillic.
    const allCapsLookalike = cyr > lat && w.length >= 4 && /^[ABCEHKMOPTXY]+$/.test(w);
    return mixed || allCapsLookalike ? [...w].map((ch) => LATIN_LOOKALIKE[ch] ?? ch).join("") : w;
  });
}

/** Significant words: letters (or letters+digits like "b12", "d3"), without units, forms, packaging and stop words. */
export function significantWords(name: string): string[] {
  const words = fixHomoglyphs(name)
    .toLowerCase()
    .normalize("NFC")
    .replace(/ё/g, "е")
    .replace(/\d+([.,]\d+)?\s*(мг|мкг|мл|г|гр|л|кг|ме|%|mg|mcg|ml|g|iu|шт)(?![\p{L}])/gu, " ")
    .replace(/[№#]\s*\d+/g, " ")
    .split(/[^\p{L}\d-]+/u)
    .flatMap((w) => w.split("-"))
    .map((w) => w.replace(/^\d+(?=\p{L}{3,})/u, "")) // "7JELLY" → "jelly"; "b12", "d3" stay
    .filter((w) => w.length >= 2 && /\p{L}/u.test(w) && !STOP.has(w));
  return [...new Set(words)];
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

/** Same word allowing transliteration, abbreviation ("детс" ↔ "детский") and small spelling differences. */
export function sameWord(a: string, b: string): boolean {
  if (a === b) return true;
  const ta = translit(a);
  const tb = translit(b);
  if (!ta || !tb) return false;
  if (ta === tb) return true;
  const short = ta.length <= tb.length ? ta : tb;
  const long = ta.length <= tb.length ? tb : ta;
  // Abbreviation: at least 4 letters and a prefix of the other word.
  if (short.length >= 4 && long.startsWith(short)) return true;
  if (short.length < 5) return false;
  return 1 - levenshtein(ta, tb) / long.length >= 0.72;
}

export interface NameSimilarity {
  /** Share of the SALAMAT name's significant words found in the candidate. */
  coverage: number;
  /** Share of the candidate's significant words found in the SALAMAT name. */
  reverse: number;
  /** SALAMAT words the candidate lacks (another flavour, line or version is likely when these are descriptive). */
  missing: string[];
  /** Candidate words absent from the SALAMAT name. */
  extra: string[];
}

export function nameSimilarity(ours: string, theirs: string): NameSimilarity {
  const a = significantWords(ours);
  const b = significantWords(theirs);
  const missing = a.filter((w) => !b.some((x) => sameWord(w, x)));
  const extra = b.filter((w) => !a.some((x) => sameWord(w, x)));
  return {
    coverage: a.length ? Math.round(((a.length - missing.length) / a.length) * 100) / 100 : 0,
    reverse: b.length ? Math.round(((b.length - extra.length) / b.length) * 100) / 100 : 0,
    missing,
    extra,
  };
}

/** True when a manufacturer named on the candidate also appears in the SALAMAT name (e.g. "… Бакстер", "… Эйкос-Фарм"). */
export function manufacturerMentioned(ourName: string, manufacturer: string | null | undefined): boolean {
  if (!manufacturer) return false;
  const words = significantWords(manufacturer).filter((w) => !["тоо", "ао", "ооо", "зао", "оао", "ltd", "llc", "gmbh", "inc", "co", "фарм", "pharma", "компания"].includes(w));
  const ours = significantWords(ourName);
  return words.some((w) => w.length >= 4 && ours.some((o) => sameWord(o, w)));
}

// Words that name a variant of one product line. Two different words of one group (black vs green tea, raspberry vs
// melon, herbs vs oils, adult vs child, XL vs XXL) mean two different products even when everything else matches.
const VARIANT_GROUPS: Record<string, RegExp> = {
  colour: /^(черн|бел(ый|ая|ое|ые|ого|ой)$|красн|зелен|син(ий|яя|ее|ие|его)$|голуб(ой|ая|ое|ые)$|розов|желт|оранжев|фиолет|золот|серебр|black$|white$|red$|green$|blue$|pink$|yellow$|purple$|gold$|silver$)/,
  flavour: new RegExp(
    "^(" +
      [
        "малин", "клубни", "землян", "вишн", "черешн", "яблок", "груш", "банан", "апельсин", "мандарин", "лимон", "лайм", "грейпфрут", "персик",
        "абрикос", "ананас", "манго", "маракуй", "дын", "арбуз", "виноград", "черник", "голубик", "смородин", "клюкв", "брусник", "облепих",
        "кокос", "ванил", "шоколад", "карамел", "кола$", "мят", "ментол", "ромашк", "лаванд", "жасмин", "алоэ", "медов", "имбир", "корица",
        "эвкалипт", "огур", "хвой", "сосн", "пихт", "трав(?!м)", "масл", "пшениц", "овсян", "гречн", "рисов", "кукуруз", "тыкв", "морков",
        "свекл", "сливоч", "творож", "йогурт", "strawberr", "raspberr", "cherr", "apple", "banana", "orange", "lemon", "lime$", "peach",
        "apricot", "pineapple", "mango", "melon", "watermelon", "grape", "blueberr", "blackcurrant", "coconut", "vanill", "chocolat", "caramel",
        "cola$", "mint$", "menthol", "chamomile", "lavender", "aloe", "honey", "ginger", "cinnamon", "eucalypt", "tropical", "berr",
      ].join("|") +
      ")",
  ),
  size: /^(xs|xl|xxl|xxxl|mini|midi|maxi|newborn|junior|детск|взросл|мужск|женск|подрост)$|^(детск|взросл|мужск|женск|подрост)/,
};

/** "flavour:мят" for "мята", "мяты", "мятный": the group and the stem, so that word forms of one variant are equal. */
function variantKey(word: string): { group: string; stem: string } | null {
  const w = word.toLowerCase().replace(/ё/g, "е");
  for (const [group, re] of Object.entries(VARIANT_GROUPS)) {
    const m = re.exec(w);
    if (m) {
      // The stem: the matched alternative without inflection (first 4 letters are enough to tell variants apart).
      return { group, stem: m[0].replace(/(ый|ая|ое|ые|ого|ой|ий|яя|ее|ие|его)$/, "").slice(0, 5) };
    }
  }
  return null;
}

// The same variant written in Russian and English is not a conflict ("черного тмина" = "black seed").
const TRANSLATIONS: [RegExp, RegExp][] = [
  [/^черн/, /^black$/], [/^бел/, /^white$/], [/^красн/, /^red$/], [/^зелен/, /^green$/], [/^син/, /^blue$/], [/^голуб/, /^blue$/],
  [/^розов/, /^pink$/], [/^фиолет/, /^purple$/],
  [/^желт/, /^yellow$/], [/^золот/, /^gold$/], [/^серебр/, /^silver$/], [/^малин/, /^raspberr/], [/^клубни/, /^strawberr/],
  [/^вишн/, /^cherr/], [/^яблок/, /^apple/], [/^банан/, /^banana/], [/^апельсин/, /^orange/], [/^лимон/, /^lemon/],
  [/^персик/, /^peach/], [/^ананас/, /^pineapple/], [/^манго/, /^mango/], [/^дын/, /^melon/], [/^арбуз/, /^watermelon/],
  [/^виноград/, /^grape/], [/^черник/, /^blueberr/], [/^кокос/, /^coconut/], [/^ванил/, /^vanill/], [/^шоколад/, /^chocolat/],
  [/^карамел/, /^caramel/], [/^кола$/, /^cola$/], [/^мят/, /^mint$/], [/^ромашк/, /^chamomile/], [/^лаванд/, /^lavender/],
  [/^алоэ/, /^aloe/], [/^медов/, /^honey/], [/^имбир/, /^ginger/], [/^корица/, /^cinnamon/], [/^эвкалипт/, /^eucalypt/],
  [/^ментол/, /^menthol/], [/^апельсин/, /^orange/], [/^смородин/, /^blackcurrant/],
];

function translationOf(a: string, b: string): boolean {
  const x = a.toLowerCase().replace(/ё/g, "е");
  const y = b.toLowerCase().replace(/ё/g, "е");
  return TRANSLATIONS.some(([ru, en]) => (ru.test(x) && en.test(y)) || (ru.test(y) && en.test(x)));
}

/**
 * A variant word of the SALAMAT name is absent from the candidate, and the candidate has another word of the same
 * group instead ("черный" vs "зеленый", "травы" vs "масла"): another product of the line.
 */
export function variantConflict(similarity: NameSimilarity): { ours: string; theirs: string } | null {
  const extra = similarity.extra.map((e) => ({ word: e, key: variantKey(e) }));
  for (const m of similarity.missing) {
    const k = variantKey(m);
    if (!k) continue;
    // The candidate states the same variant in another word form ("мята"/"мяты") or language ("черного"/"black").
    if (extra.some((e) => (e.key && e.key.group === k.group && e.key.stem === k.stem) || translationOf(m, e.word))) continue;
    const other = extra.find(
      (e) => e.key && e.key.group === k.group && e.key.stem !== k.stem && !similarity.missing.some((x) => translationOf(x, e.word) || variantKey(x)?.stem === e.key!.stem),
    );
    if (other) return { ours: m, theirs: other.word };
  }
  return null;
}

/** The SALAMAT name's brand (its first significant word) appears in the candidate's name or manufacturer. */
export function brandConfirmed(ourName: string, theirName: string, manufacturer: string | null | undefined): boolean {
  const brand = significantWords(ourName)[0];
  if (!brand) return true;
  return [...significantWords(theirName), ...significantWords(manufacturer ?? "")].some((w) => sameWord(brand, w));
}

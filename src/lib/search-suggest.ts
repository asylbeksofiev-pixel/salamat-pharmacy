// "Did you mean …?" for catalogue search: a typo or the wrong keyboard layout in a word of the query is matched
// against the words that really occur in public product names. Pure functions (the vocabulary is loaded by the server).
// Limits: at most 8 words per query, words of 4–30 letters only; a word with digits (article, dose, size) is never
// changed, so an article search stays exact; one suggestion per query.
import { fixKeyboardLayout, fixKeyboardLayoutToLatin } from "./search-normalize";

export interface Vocabulary {
  /** Distinct words of public product names (lower-case, ё→е), most frequent first. */
  words: string[];
  freq: Map<string, number>;
}

export function buildVocabulary(entries: Iterable<[string, number]>): Vocabulary {
  const list = [...entries].filter(([w]) => w.length >= 3).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return { words: list.map(([w]) => w), freq: new Map(list) };
}

/** Optimal string alignment distance (Damerau–Levenshtein with adjacent swaps); stops early above `max`. */
export function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const prev2 = new Array<number>(b.length + 1).fill(0);
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = new Array<number>(b.length + 1);
    cur[0] = i;
    let rowMin = cur[0];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    for (let j = 0; j <= b.length; j++) prev2[j] = prev[j];
    prev = cur;
  }
  return prev[b.length];
}

const WORD = /^[a-zа-яёәғқңөұүһі]+$/;

/** The closest real word for one query word, or null when the word already occurs or nothing is close enough. */
export function correctWord(word: string, vocab: Vocabulary): string | null {
  if (word.length < 4 || word.length > 30 || !WORD.test(word)) return null;
  if (vocab.words.some((w) => w.includes(word))) return null;
  for (const alt of [fixKeyboardLayout(word), fixKeyboardLayoutToLatin(word)]) {
    if (alt && alt.length >= 3 && vocab.words.some((w) => w.includes(alt))) return alt;
  }
  const max = word.length <= 5 ? 1 : 2;
  let best: { w: string; d: number; f: number } | null = null;
  for (const w of vocab.words) {
    let d = editDistance(word, w, max);
    // A word typed only partly, with a typo: "парацетом" → "парацетамол".
    if (d > max && word.length >= 5 && w.length > word.length) d = editDistance(word, w.slice(0, word.length), max - 1 > 0 ? max - 1 : 1) + 0.5;
    if (d > max) continue;
    const f = vocab.freq.get(w) ?? 0;
    if (!best || d < best.d || (d === best.d && f > best.f)) best = { w, d, f };
  }
  return best?.w ?? null;
}

/** A corrected query, or null when no word needed (or could get) a correction. Words with digits stay as typed. */
export function suggestCorrection(tokens: string[], vocab: Vocabulary): string | null {
  if (!tokens.length || tokens.every((t) => /\d/.test(t))) return null;
  let changed = false;
  const out = tokens.slice(0, 8).map((t) => {
    if (/\d/.test(t)) return t;
    const c = correctWord(t, vocab);
    if (c && c !== t) {
      changed = true;
      return c;
    }
    return t;
  });
  return changed ? out.join(" ") : null;
}

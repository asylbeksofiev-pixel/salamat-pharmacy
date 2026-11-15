// Transliteration for URL slugs (Russian + Kazakh letters). Slugs are identifiers for URLs only;
// uniqueness is enforced in the database, never by product name.
const map: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "y", к: "k",
  л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "ts",
  ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
  ә: "a", ғ: "g", қ: "q", ң: "n", ө: "o", ұ: "u", ү: "u", һ: "h", і: "i",
};

export function slugify(input: string, maxLength = 80): string {
  const lower = input.toLowerCase();
  let out = "";
  for (const ch of lower) {
    if (map[ch] !== undefined) out += map[ch];
    else if (/[a-z0-9]/.test(ch)) out += ch;
    else if (ch === "," || ch === ".") out += "-";
    else out += "-";
  }
  out = out.replace(/-+/g, "-").replace(/^-|-$/g, "");
  if (out.length > maxLength) out = out.slice(0, maxLength).replace(/-[^-]*$/, "") || out.slice(0, maxLength);
  return out || "item";
}

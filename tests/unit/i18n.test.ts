import { describe, expect, it } from "vitest";
import ru from "@/lib/i18n/ru";
import kk from "@/lib/i18n/kk";

type Tree = { [k: string]: string | Tree };
function flatten(t: Tree, prefix = ""): Record<string, string> {
  return Object.entries(t).reduce<Record<string, string>>((acc, [k, v]) => {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "string") acc[key] = v;
    else Object.assign(acc, flatten(v, key));
    return acc;
  }, {});
}

const fr = flatten(ru as unknown as Tree);
const fk = flatten(kk as unknown as Tree);

describe("translations", () => {
  it("have the same keys in Russian and Kazakh", () => {
    expect(Object.keys(fk).sort()).toEqual(Object.keys(fr).sort());
  });
  it("have no empty strings", () => {
    for (const [k, v] of Object.entries({ ...fr, ...fk })) expect(v.trim(), k).not.toBe("");
  });
  it("use the same placeholders", () => {
    for (const k of Object.keys(fr)) {
      const ph = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join(",");
      expect(ph(fk[k]), k).toBe(ph(fr[k]));
    }
  });
  it("Kazakh strings use Kazakh letters", () => {
    const all = Object.values(fk).join(" ");
    for (const letter of ["ә", "ғ", "қ", "ң", "ө", "ұ", "ү", "і"]) expect(all.includes(letter), letter).toBe(true);
  });
  it("Kazakh UI is actually translated (not copied from Russian)", () => {
    // Identical on purpose: "Бонус" is the same word in Kazakh; the phone mask is not text.
    const allowed = new Set(["offer.bonus", "checkout.phonePlaceholder"]);
    const same = Object.keys(fr).filter((k) => fr[k] === fk[k] && fr[k].length > 12 && !allowed.has(k));
    expect(same, same.join(", ")).toEqual([]);
  });
});

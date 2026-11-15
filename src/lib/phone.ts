/**
 * Normalises a Kazakhstan phone number to E.164 (+7XXXXXXXXXX).
 * Accepts "8 701 672 76 27", "+7 (701) 672-76-27", "7016727627". Returns null when invalid.
 */
export function normalizeKzPhone(input: string): string | null {
  if (typeof input !== "string" || input.length > 40) return null;
  let digits = input.replace(/\D/g, "");
  if (digits.length === 10) digits = `7${digits}`;
  if (digits.length !== 11) return null;
  if (digits.startsWith("8")) digits = `7${digits.slice(1)}`;
  if (!digits.startsWith("7")) return null;
  // Kazakhstan mobile (7xx) and city codes (7xx/6xx… after the country code start with 7 or 6).
  const area = digits[1];
  if (area !== "7" && area !== "6") return null;
  return `+${digits}`;
}

/** Masks a phone for lists and logs: +7 701 *** ** 27 */
export function maskPhone(e164: string): string {
  const d = e164.replace(/\D/g, "");
  if (d.length !== 11) return "***";
  return `+${d[0]} ${d.slice(1, 4)} *** ** ${d.slice(9)}`;
}

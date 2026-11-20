// Images a promotion may use: a file from the site's own public/promo/ folder ("/promo/promo-1.jpg") or an
// https:// address of an allowed source. Anything else (http, other site paths, data: URLs) is rejected.
const LOCAL = /^\/promo\/[A-Za-z0-9][\w.-]*\.(jpe?g|png|webp|avif)$/i;

export function isPromotionImage(value: string): boolean {
  if (LOCAL.test(value)) return !value.includes("..");
  try {
    const u = new URL(value);
    return u.protocol === "https:" && !!u.hostname;
  } catch {
    return false;
  }
}

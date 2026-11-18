import { NextResponse, type NextRequest } from "next/server";

// Russian pages are served at unprefixed URLs (/catalog) and rewritten internally to /ru/...;
// Kazakh pages live under /kk, English pages under /en. /ru/... is redirected to the unprefixed canonical URL.
// /admin is gated by the presence of a session cookie; the session itself is verified on the server.
const LOCALE_COOKIE = "salamat_locale";
const SESSION_COOKIE = "salamat_admin";
/** Must match `locales` in src/lib/i18n/config.ts (the proxy keeps its own copy to stay dependency-free). */
const LOCALES = ["ru", "kk", "en"] as const;
const PREFIXED = ["kk", "en"] as const;
type Prefixed = (typeof PREFIXED)[number];

function prefixOf(pathname: string): Prefixed | null {
  return PREFIXED.find((l) => pathname === `/${l}` || pathname.startsWith(`/${l}/`)) ?? null;
}

export function proxy(req: NextRequest) {
  const { pathname, searchParams } = req.nextUrl;

  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    if (!pathname.startsWith("/admin/login") && !req.cookies.has(SESSION_COOKIE)) {
      const url = req.nextUrl.clone();
      url.pathname = "/admin/login";
      url.search = "";
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  // Explicit language switch (no-JS fallback): remember the choice and drop the parameter.
  const lang = searchParams.get("lang");
  if (lang && (LOCALES as readonly string[]).includes(lang)) {
    const url = req.nextUrl.clone();
    url.searchParams.delete("lang");
    const res = NextResponse.redirect(url);
    res.cookies.set(LOCALE_COOKIE, lang, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
    return res;
  }

  if (pathname === "/ru" || pathname.startsWith("/ru/")) {
    const url = req.nextUrl.clone();
    url.pathname = pathname.slice(3) || "/";
    return NextResponse.redirect(url, 308);
  }

  const prefixed = prefixOf(pathname);
  if (prefixed) {
    const headers = new Headers(req.headers);
    headers.set("x-salamat-locale", prefixed);
    return NextResponse.next({ request: { headers } });
  }

  // Returning Kazakh- or English-language visitors landing on the home page.
  const remembered = req.cookies.get(LOCALE_COOKIE)?.value;
  if (pathname === "/" && remembered && (PREFIXED as readonly string[]).includes(remembered)) {
    const url = req.nextUrl.clone();
    url.pathname = `/${remembered}`;
    return NextResponse.redirect(url);
  }

  const url = req.nextUrl.clone();
  url.pathname = `/ru${pathname === "/" ? "" : pathname}`;
  const headers = new Headers(req.headers);
  headers.set("x-salamat-locale", "ru");
  return NextResponse.rewrite(url, { request: { headers } });
}

export const config = {
  matcher: ["/((?!api|_next|.*\\..*).*)"],
};

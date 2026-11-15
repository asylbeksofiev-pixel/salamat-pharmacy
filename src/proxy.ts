import { NextResponse, type NextRequest } from "next/server";

// Russian pages are served at unprefixed URLs (/catalog) and rewritten internally to /ru/...;
// Kazakh pages live under /kk. /ru/... is redirected to the unprefixed canonical URL.
// /admin is gated by the presence of a session cookie; the session itself is verified on the server.
const LOCALE_COOKIE = "salamat_locale";
const SESSION_COOKIE = "salamat_admin";

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

  // Explicit language switch: remember the choice and drop the parameter.
  const lang = searchParams.get("lang");
  if (lang === "ru" || lang === "kk") {
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

  if (pathname === "/kk" || pathname.startsWith("/kk/")) {
    const headers = new Headers(req.headers);
    headers.set("x-salamat-locale", "kk");
    return NextResponse.next({ request: { headers } });
  }

  // Returning Kazakh-language visitors landing on the home page.
  if (pathname === "/" && req.cookies.get(LOCALE_COOKIE)?.value === "kk") {
    const url = req.nextUrl.clone();
    url.pathname = "/kk";
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

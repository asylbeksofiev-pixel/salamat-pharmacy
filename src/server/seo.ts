import "server-only";
import type { Metadata } from "next";
import { localizedPath, localeTags, locales, type Locale } from "@/lib/i18n";
import { env } from "./env";

/** hreflang alternates for a path in every language; x-default is the Russian (unprefixed) URL. */
export function languageAlternates(path: string, base = ""): Record<string, string> {
  return {
    ...Object.fromEntries(locales.map((l) => [localeTags[l], `${base}${localizedPath(l, path)}`])),
    "x-default": `${base}${localizedPath("ru", path)}`,
  };
}

/** Title, description, canonical and hreflang alternates for a page that exists in every language. */
export function pageMetadata(locale: Locale, path: string, title: string, description?: string | null, opts: { noindex?: boolean; ogType?: "website" | "article" } = {}): Metadata {
  const canonical = localizedPath(locale, path);
  return {
    title,
    description: description ?? undefined,
    alternates: {
      canonical,
      languages: languageAlternates(path),
    },
    openGraph: { title, description: description ?? undefined, url: canonical, locale: localeTags[locale].replace("-", "_"), type: opts.ogType ?? "website" },
    ...(opts.noindex || !env.allowIndexing ? { robots: { index: false, follow: !opts.noindex } } : {}),
  };
}

export function absoluteUrl(path: string): string {
  return `${env.appUrl}${path}`;
}

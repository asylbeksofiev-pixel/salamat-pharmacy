import "server-only";
import type { Metadata } from "next";
import { localizedPath, localeTags, type Locale } from "@/lib/i18n";
import { env } from "./env";

/** Title, description, canonical and hreflang alternates for a page that exists in both languages. */
export function pageMetadata(locale: Locale, path: string, title: string, description?: string | null, opts: { noindex?: boolean; ogType?: "website" | "article" } = {}): Metadata {
  const canonical = localizedPath(locale, path);
  return {
    title,
    description: description ?? undefined,
    alternates: {
      canonical,
      languages: { "ru-KZ": localizedPath("ru", path), "kk-KZ": localizedPath("kk", path), "x-default": localizedPath("ru", path) },
    },
    openGraph: { title, description: description ?? undefined, url: canonical, locale: localeTags[locale].replace("-", "_"), type: opts.ogType ?? "website" },
    ...(opts.noindex || !env.allowIndexing ? { robots: { index: false, follow: !opts.noindex } } : {}),
  };
}

export function absoluteUrl(path: string): string {
  return `${env.appUrl}${path}`;
}

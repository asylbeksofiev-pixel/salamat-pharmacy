import Link from "next/link";
import { Icon } from "../icons";

export interface Crumb {
  label: string;
  href?: string;
}

export function Breadcrumbs({ items, label, baseUrl }: { items: Crumb[]; label: string; baseUrl?: string }) {
  const jsonLd = baseUrl
    ? {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: items.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.label, ...(c.href ? { item: `${baseUrl}${c.href}` } : {}) })),
      }
    : null;
  return (
    <nav aria-label={label} className="text-sm">
      <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-muted">
        {items.map((c, i) => (
          <li key={i} className="flex min-w-0 items-center gap-1.5">
            {i > 0 ? <Icon name="chevronRight" size={14} className="shrink-0 text-line-strong" /> : null}
            {c.href && i < items.length - 1 ? (
              <Link href={c.href} className="inline-flex min-h-11 items-center rounded hover:text-brand-700 hover:underline md:min-h-0">
                {c.label}
              </Link>
            ) : (
              <span aria-current={i === items.length - 1 ? "page" : undefined} className="truncate text-ink-soft">
                {c.label}
              </span>
            )}
          </li>
        ))}
      </ol>
      {jsonLd ? <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} /> : null}
    </nav>
  );
}

import Link from "next/link";
import { Icon } from "../icons";
import { cn } from "./cn";

/** Server-side pagination with plain links (works without JavaScript, crawlable). */
export function Pagination({
  page,
  pageCount,
  hrefFor,
  labels,
}: {
  page: number;
  pageCount: number;
  hrefFor: (page: number) => string;
  labels: { nav: string; previous: string; next: string; page: string };
}) {
  if (pageCount <= 1) return null;
  const pages: (number | "gap")[] = [];
  const add = (p: number) => {
    if (p >= 1 && p <= pageCount && !pages.includes(p)) pages.push(p);
  };
  add(1);
  if (page - 2 > 2) pages.push("gap");
  for (let p = page - 1; p <= page + 1; p++) add(p);
  if (page + 2 < pageCount - 1) pages.push("gap");
  add(pageCount);
  const item = "grid h-11 min-w-11 place-items-center rounded-[var(--radius-md)] px-3 text-[0.95rem] font-semibold";
  return (
    <nav aria-label={labels.nav} className="mt-10 flex justify-center">
      <ul className="flex flex-wrap items-center gap-1.5">
        <li>
          {page > 1 ? (
            <Link href={hrefFor(page - 1)} className={cn(item, "border border-line-strong hover:border-brand-600")} rel="prev">
              <Icon name="chevronLeft" size={18} />
              <span className="sr-only">{labels.previous}</span>
            </Link>
          ) : null}
        </li>
        {pages.map((p, i) =>
          p === "gap" ? (
            <li key={`g${i}`} className="px-1 text-muted" aria-hidden="true">
              …
            </li>
          ) : (
            <li key={p}>
              {p === page ? (
                <span className={cn(item, "bg-brand-600 text-white")} aria-current="page">
                  <span className="sr-only">{labels.page} </span>
                  {p}
                </span>
              ) : (
                <Link href={hrefFor(p)} className={cn(item, "border border-line-strong hover:border-brand-600")}>
                  <span className="sr-only">{labels.page} </span>
                  {p}
                </Link>
              )}
            </li>
          ),
        )}
        <li>
          {page < pageCount ? (
            <Link href={hrefFor(page + 1)} className={cn(item, "border border-line-strong hover:border-brand-600")} rel="next">
              <Icon name="chevronRight" size={18} />
              <span className="sr-only">{labels.next}</span>
            </Link>
          ) : null}
        </li>
      </ul>
    </nav>
  );
}

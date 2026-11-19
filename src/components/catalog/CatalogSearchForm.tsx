"use client";

import { useId, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "../icons";
import { SearchSubmitLabel } from "../site/SearchSubmitLabel";
import { useSite } from "../site/SiteProvider";

/** `keep`: other catalogue parameters (sections, filters, sort) that a new search keeps; the page goes back to 1. */
export function CatalogSearchForm({ action, q, keep = [] }: { action: string; q: string; keep?: [string, string][] }) {
  const { t } = useSite();
  const id = useId();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <form action={action} method="get" role="search" className="flex w-full max-w-2xl gap-2" onSubmit={(e) => {
      e.preventDefault();
      if (pending) return;
      const query = String(new FormData(e.currentTarget).get("q") ?? "").trim();
      const params = new URLSearchParams(query ? { q: query } : {});
      for (const [k, v] of keep) params.append(k, v);
      const qs = params.toString();
      startTransition(() => router.push(qs ? `${action}?${qs}` : action));
    }}>
      {keep.map(([k, v], i) => (
        <input key={`${k}-${i}`} type="hidden" name={k} value={v} />
      ))}
      <label htmlFor={id} className="sr-only">{t.items.searchLabel}</label>
      <div className="relative min-w-0 flex-1">
        <Icon name="search" size={20} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-muted" />
        <input
          key={q}
          id={id}
          name="q"
          type="search"
          defaultValue={q}
          maxLength={100}
          enterKeyHint="search"
          placeholder={t.items.searchPlaceholder}
          className="sal-search-input h-12 w-full rounded-[var(--radius-lg)] border border-line-strong bg-white pr-3 pl-11 text-[0.98rem] placeholder:text-muted/85 focus:border-brand-600"
        />
      </div>
      <button type="submit" aria-busy={pending || undefined} className="sal-search-submit h-12 shrink-0 rounded-[var(--radius-lg)] bg-brand-600 px-5 font-semibold text-white hover:bg-brand-700">
        <SearchSubmitLabel pending={pending}>{t.header.searchSubmit}</SearchSubmitLabel>
      </button>
    </form>
  );
}

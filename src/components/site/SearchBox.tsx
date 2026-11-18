"use client";
// Search with suggestions (ARIA combobox). The catalogue is never loaded into the browser:
// suggestions come from /api/search/suggest, results from the server-rendered /search page.
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "../icons";
import { cn } from "../ui/cn";
import { SearchSubmitLabel } from "./SearchSubmitLabel";
import { useSite } from "./SiteProvider";
import { fmt } from "@/lib/i18n/config";

interface Suggestion {
  type: "variant" | "category";
  label: string;
  sublabel?: string;
  href: string;
}

export function SearchBox({ defaultValue = "", size = "md", autoFocus = false, idPrefix = "search" }: { defaultValue?: string; size?: "md" | "lg"; autoFocus?: boolean; idPrefix?: string }) {
  const { t, locale, href } = useSite();
  const router = useRouter();
  const uid = useId();
  const listId = `${idPrefix}-${uid}-list`;
  const [value, setValue] = useState(defaultValue);
  const [result, setResult] = useState<{ q: string; locale: string; items: Suggestion[] }>();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [pending, startTransition] = useTransition();
  const wrap = useRef<HTMLFormElement>(null);
  const q = value.trim();
  const showList = open && q.length >= 2;
  const matchingResult = result?.q === q && result.locale === locale ? result : undefined;
  const visible = matchingResult?.items ?? [];
  const total = visible.length + 1; // + "all results"

  useEffect(() => {
    if (!showList) return;
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      let items: Suggestion[] = [];
      try {
        const res = await fetch(`/api/search/suggest?q=${encodeURIComponent(q.slice(0, 100))}&locale=${locale}`, { signal: ctrl.signal });
        if (res.ok) {
          const data = (await res.json()) as { items: Suggestion[] };
          items = data.items;
        }
      } catch {
        /* aborted or offline */
      }
      if (ctrl.signal.aborted) return;
      setResult({ q, locale, items });
      setActive(-1);
    }, 220);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [q, locale, showList]);

  useEffect(() => {
    if (!showList) return;
    const onDoc = (e: PointerEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) {
        setOpen(false);
        setActive(-1);
      }
    };
    document.addEventListener("pointerdown", onDoc);
    return () => document.removeEventListener("pointerdown", onDoc);
  }, [showList]);

  const go = (url: string) => {
    if (pending) return;
    setOpen(false);
    setActive(-1);
    startTransition(() => router.push(url));
  };

  return (
    <form
      ref={wrap}
      role="search"
      action={href("/search")}
      method="get"
      className="relative w-full"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) {
          setOpen(false);
          setActive(-1);
        }
      }}
      onSubmit={(e) => {
        e.preventDefault();
        if (showList && active >= 0 && active < visible.length) return go(visible[active].href);
        if (!q) return;
        go(`${href("/search")}?q=${encodeURIComponent(q.slice(0, 100))}`);
      }}
    >
      <label htmlFor={`${idPrefix}-${uid}`} className="sr-only">
        {t.header.searchLabel}
      </label>
      <div className="relative">
        <Icon name="search" size={20} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-muted" />
        <input
          id={`${idPrefix}-${uid}`}
          name="q"
          type="search"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList && active >= 0 && active < total ? `${listId}-${active}` : undefined}
          autoComplete="off"
          enterKeyHint="search"
          maxLength={100}
          autoFocus={autoFocus}
          value={value}
          placeholder={t.header.searchPlaceholder}
          onChange={(e) => {
            setValue(e.target.value);
            setActive(-1);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (q.length < 2) return;
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setOpen(true);
              setActive((a) => (a + 1) % total);
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setOpen(true);
              setActive((a) => (a <= 0 ? total - 1 : a - 1));
            } else if (e.key === "Escape" && showList) {
              e.preventDefault();
              setOpen(false);
              setActive(-1);
            }
          }}
          className={cn(
            "w-full rounded-[var(--radius-lg)] border border-line-strong bg-white pr-28 pl-11 text-ink placeholder:text-muted/85",
            "sal-search-input focus:border-brand-600",
            size === "lg" ? "h-14 text-[1.05rem]" : "h-12 text-[0.98rem]",
          )}
        />
        <button
          type="submit"
          aria-busy={pending || undefined}
          className={cn(
            "sal-search-submit absolute top-1/2 right-1.5 -translate-y-1/2 rounded-[var(--radius-md)] bg-brand-600 px-4 font-semibold text-white hover:bg-brand-700",
            size === "lg" ? "h-11" : "h-9 text-sm",
          )}
        >
          <SearchSubmitLabel pending={pending}>{t.header.searchSubmit}</SearchSubmitLabel>
        </button>
      </div>
      <div data-open={showList || undefined} inert={!showList} className="sal-dropdown absolute inset-x-0 top-full z-50 mt-2 overflow-hidden rounded-[var(--radius-lg)] border border-line bg-white shadow-[var(--shadow-pop)]">
        <ul id={listId} role="listbox" aria-label={t.search.suggestionsLabel} className="max-h-[60vh] overflow-y-auto py-1.5">
          {matchingResult && visible.length === 0 ? (
            <li className="px-4 py-3 text-sm text-muted" role="presentation">
              {t.search.noSuggestions}
            </li>
          ) : null}
          {visible.map((s, i) => (
            <li
              key={`${s.type}-${s.href}`}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={active === i}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => go(s.href)}
              onMouseEnter={() => setActive(i)}
              className={cn("flex cursor-pointer items-center gap-3 px-4 py-2.5 transition-colors", active === i && "bg-brand-50")}
            >
              <Icon name={s.type === "category" ? "grid" : "search"} size={18} className="shrink-0 text-muted" />
              <span className="min-w-0">
                <span className="block truncate text-[0.95rem] text-ink">{s.label}</span>
                {s.sublabel ? <span className="block truncate text-xs text-muted">{s.sublabel}</span> : null}
              </span>
            </li>
          ))}
          <li
            id={`${listId}-${visible.length}`}
            role="option"
            aria-selected={active === visible.length}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => go(`${href("/search")}?q=${encodeURIComponent(q.slice(0, 100))}`)}
            onMouseEnter={() => setActive(visible.length)}
            className={cn("flex cursor-pointer items-center gap-3 border-t border-line px-4 py-2.5 font-semibold text-brand-700 transition-colors", active === visible.length && "bg-brand-50")}
          >
            <Icon name="chevronRight" size={18} className="shrink-0" />
            <span className="truncate">{fmt(t.search.allResults, { q: q.slice(0, 60) })}</span>
          </li>
        </ul>
      </div>
    </form>
  );
}

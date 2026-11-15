"use client";
// Search with suggestions (ARIA combobox). The catalogue is never loaded into the browser:
// suggestions come from /api/search/suggest, results from the server-rendered /search page.
import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "../icons";
import { cn } from "../ui/cn";
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
  const [items, setItems] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [loading, setLoading] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const wrap = useRef<HTMLFormElement>(null);

  useEffect(() => {
    const q = value.trim();
    if (q.length < 2) return;
    const timer = setTimeout(async () => {
      abort.current?.abort();
      const ctrl = new AbortController();
      abort.current = ctrl;
      setLoading(true);
      try {
        const res = await fetch(`/api/search/suggest?q=${encodeURIComponent(q.slice(0, 100))}&locale=${locale}`, { signal: ctrl.signal });
        if (res.ok) {
          const data = (await res.json()) as { items: Suggestion[] };
          setItems(data.items);
          setActive(-1);
        } else setItems([]);
      } catch {
        /* aborted or offline */
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    }, 220);
    return () => clearTimeout(timer);
  }, [value, locale]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const q = value.trim();
  const showList = open && q.length >= 2;
  const visible = q.length >= 2 ? items : [];
  const total = visible.length + 1; // + "all results"

  const go = (url: string) => {
    setOpen(false);
    router.push(url);
  };

  return (
    <form
      ref={wrap}
      role="search"
      action={href("/search")}
      method="get"
      className="relative w-full"
      onSubmit={(e) => {
        e.preventDefault();
        if (active >= 0 && active < visible.length) return go(visible[active].href);
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
          aria-activedescendant={showList && active >= 0 ? `${listId}-${active}` : undefined}
          autoComplete="off"
          enterKeyHint="search"
          maxLength={100}
          autoFocus={autoFocus}
          value={value}
          placeholder={t.header.searchPlaceholder}
          onChange={(e) => {
            setValue(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setOpen(true);
              setActive((a) => (a + 1) % total);
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => (a <= 0 ? total - 1 : a - 1));
            } else if (e.key === "Escape") {
              setOpen(false);
              setActive(-1);
            }
          }}
          className={cn(
            "w-full rounded-[var(--radius-lg)] border border-line-strong bg-white pr-28 pl-11 text-ink placeholder:text-muted/85",
            "transition-colors focus:border-brand-600 focus:outline-3 focus:outline-offset-0 focus:outline-brand-600/25",
            size === "lg" ? "h-14 text-[1.05rem]" : "h-12 text-[0.98rem]",
          )}
        />
        <button
          type="submit"
          className={cn(
            "absolute top-1/2 right-1.5 -translate-y-1/2 rounded-[var(--radius-md)] bg-brand-600 px-4 font-semibold text-white transition-colors hover:bg-brand-700",
            size === "lg" ? "h-11" : "h-9 text-sm",
          )}
        >
          {t.header.searchSubmit}
        </button>
      </div>
      {showList ? (
        <div className="anim-pop absolute inset-x-0 top-full z-50 mt-2 overflow-hidden rounded-[var(--radius-lg)] border border-line bg-white shadow-[var(--shadow-pop)]">
          <ul id={listId} role="listbox" aria-label={t.search.suggestionsLabel} className="max-h-[60vh] overflow-y-auto py-1.5">
            {visible.length === 0 && !loading ? (
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
                className={cn("flex cursor-pointer items-center gap-3 px-4 py-2.5", active === i && "bg-brand-50")}
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
              className={cn("flex cursor-pointer items-center gap-3 border-t border-line px-4 py-2.5 font-semibold text-brand-700", active === visible.length && "bg-brand-50")}
            >
              <Icon name="chevronRight" size={18} className="shrink-0" />
              <span className="truncate">{fmt(t.search.allResults, { q: q.slice(0, 60) })}</span>
            </li>
          </ul>
        </div>
      ) : null}
    </form>
  );
}

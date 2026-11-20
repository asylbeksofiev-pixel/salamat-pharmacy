"use client";
// Search with suggestions (ARIA combobox). The catalogue is never loaded into the browser:
// suggestions come from /api/search/suggest, results from the server-rendered /search page.
// Search history: every query the visitor submits (Enter, the search button, "all results", a repeat from the
// history) is kept in this browser only (lib/client/search-history.ts). Suggestions that are clicked are product or
// section links, not queries, and are not recorded. With an empty field the dropdown offers the history behind a
// button, so the stored queries are never shown to someone else using the device without an explicit tap.
import { useCallback, useEffect, useId, useRef, useState, useTransition, type MouseEvent } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "../icons";
import { cn } from "../ui/cn";
import { SearchSubmitLabel } from "./SearchSubmitLabel";
import { useSite } from "./SiteProvider";
import { useRecordSearch } from "./useRecordSearch";
import { fmt, localeTags } from "@/lib/i18n/config";
import { searchHistory, useSearchHistory } from "@/lib/client/search-history";
import { formatHistoryTime, SEARCH_HISTORY_LIMIT, SEARCH_QUERY_MAX } from "@/lib/search-history";

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
  const historyId = `${idPrefix}-${uid}-history`;
  const [value, setValue] = useState(defaultValue);
  const [result, setResult] = useState<{ q: string; locale: string; items: Suggestion[] }>();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [pending, startTransition] = useTransition();
  const [historyShown, setHistoryShown] = useState(false);
  const [cleared, setCleared] = useState(false);
  /** "Now" for the times in the list: taken when the visitor opens the history. */
  const [now, setNow] = useState(0);
  const history = useSearchHistory();
  const recordSearch = useRecordSearch();
  const wrap = useRef<HTMLFormElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const q = value.trim();
  const showList = open && q.length >= 2;
  // Empty field: offer the history (or report a storage problem / a just-cleared history).
  const showHistory = open && q.length === 0 && (history.entries.length > 0 || history.status !== "ok" || cleared);
  const panelOpen = showList || showHistory;
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

  const close = useCallback(() => {
    setOpen(false);
    setActive(-1);
    // The history folds away again: next time it is shown only after a new tap.
    setHistoryShown(false);
    setCleared(false);
  }, []);

  useEffect(() => {
    if (!panelOpen) return;
    const onDoc = (e: PointerEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) close();
    };
    document.addEventListener("pointerdown", onDoc);
    return () => document.removeEventListener("pointerdown", onDoc);
  }, [panelOpen, close]);

  const go = (url: string) => {
    if (pending) return;
    close();
    startTransition(() => router.push(url));
  };

  /** A query the visitor actually submitted: remember it, then open the results. */
  const search = (query: string) => {
    const text = query.trim().slice(0, SEARCH_QUERY_MAX);
    if (!text || pending) return;
    recordSearch(text);
    go(`${href("/search")}?q=${encodeURIComponent(text)}`);
  };

  // Buttons inside the dropdown keep the focus in the field (the panel stays open, the phone keyboard stays up).
  const keepFocus = (e: MouseEvent) => e.preventDefault();

  return (
    <form
      ref={wrap}
      role="search"
      action={href("/search")}
      method="get"
      className="relative w-full"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) close();
      }}
      onSubmit={(e) => {
        e.preventDefault();
        if (showList && active >= 0 && active < visible.length) return go(visible[active].href);
        search(q);
      }}
    >
      <label htmlFor={`${idPrefix}-${uid}`} className="sr-only">
        {t.header.searchLabel}
      </label>
      <div className="relative">
        <Icon name="search" size={20} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-muted" />
        <input
          ref={input}
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
            if (e.key === "Escape" && showHistory) {
              e.preventDefault();
              close();
              return;
            }
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
              close();
            }
          }}
          className={cn(
            "w-full rounded-[var(--radius-lg)] border border-line-strong bg-white pr-28 pl-11 text-ink placeholder:text-muted/85",
            "sal-search-input focus:border-brand-600",
            // At least 16px on phones: iOS Safari zooms the page into a field with smaller text and keeps that zoom,
            // after which every vertical swipe also slides the whole page sideways.
            size === "lg" ? "h-14 text-[1.05rem]" : "h-12 text-base md:text-[0.98rem]",
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
              onMouseDown={keepFocus}
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
            onMouseDown={keepFocus}
            onClick={() => search(q)}
            onMouseEnter={() => setActive(visible.length)}
            className={cn("flex cursor-pointer items-center gap-3 border-t border-line px-4 py-2.5 font-semibold text-brand-700 transition-colors", active === visible.length && "bg-brand-50")}
          >
            <Icon name="chevronRight" size={18} className="shrink-0" />
            <span className="truncate">{fmt(t.search.allResults, { q: q.slice(0, 60) })}</span>
          </li>
        </ul>
      </div>
      <div
        data-open={showHistory || undefined}
        inert={!showHistory}
        className="sal-dropdown absolute inset-x-0 top-full z-50 mt-2 overflow-hidden rounded-[var(--radius-lg)] border border-line bg-white shadow-[var(--shadow-pop)]"
      >
        {history.status === "readFailed" || history.status === "saveFailed" || history.status === "clearFailed" ? (
          <p role="status" className="flex items-start gap-2 border-b border-line bg-warn-50 px-4 py-3 text-sm text-warn-700">
            <Icon name="alert" size={18} className="mt-px shrink-0" />
            {history.status === "readFailed" ? t.search.historyReadFailed : history.status === "saveFailed" ? t.search.historySaveFailed : t.search.historyClearFailed}
          </p>
        ) : null}
        {cleared && history.status === "ok" ? (
          <p role="status" className="flex items-center gap-2 px-4 py-3 text-sm text-ink-soft">
            <Icon name="checkCircle" size={18} className="shrink-0 text-brand-600" />
            {t.search.historyCleared}
          </p>
        ) : null}
        {history.entries.length > 0 && !historyShown ? (
          <button
            type="button"
            aria-expanded={false}
            aria-controls={historyId}
            onMouseDown={keepFocus}
            onClick={() => {
              setNow(Date.now());
              setHistoryShown(true);
              setCleared(false);
            }}
            className="flex min-h-12 w-full items-center gap-3 px-4 py-2.5 text-left text-[0.95rem] font-semibold text-brand-700 transition-colors hover:bg-brand-50"
          >
            <Icon name="history" size={18} className="shrink-0" />
            <span className="min-w-0 flex-1">{fmt(t.search.historyShow, { count: history.entries.length })}</span>
            <Icon name="chevronDown" size={18} className="shrink-0" />
          </button>
        ) : null}
        {history.entries.length > 0 && historyShown ? (
          <section id={historyId} aria-label={t.search.historyTitle}>
            <div className="flex items-center justify-between gap-2 border-b border-line py-0.5 pr-1 pl-4">
              <p className="min-w-0 truncate text-sm font-semibold text-ink">{t.search.historyTitle}</p>
              <button
                type="button"
                aria-expanded={true}
                aria-controls={historyId}
                aria-label={t.search.historyHide}
                title={t.search.historyHide}
                onMouseDown={keepFocus}
                onClick={() => setHistoryShown(false)}
                className="grid size-11 shrink-0 place-items-center rounded-[var(--radius-md)] text-ink-soft transition-colors hover:bg-surface hover:text-ink"
              >
                <Icon name="chevronDown" size={18} className="rotate-180" />
              </button>
            </div>
            <ul className="max-h-[50vh] overflow-y-auto overscroll-contain py-1.5">
              {history.entries.map((entry) => (
                <li key={entry.q}>
                  <button
                    type="button"
                    onMouseDown={keepFocus}
                    onClick={() => {
                      setValue(entry.q);
                      search(entry.q);
                    }}
                    className="flex min-h-11 w-full items-center gap-3 px-4 py-2 text-left transition-colors hover:bg-brand-50 focus-visible:bg-brand-50"
                  >
                    <Icon name="clock" size={18} className="shrink-0 text-muted" />
                    <span className="min-w-0 flex-1 truncate text-[0.95rem] text-ink">{entry.q}</span>
                    <time dateTime={new Date(entry.at).toISOString()} className="shrink-0 text-xs text-muted tabular-nums">
                      {formatHistoryTime(entry.at, now, localeTags[locale])}
                    </time>
                  </button>
                </li>
              ))}
            </ul>
            <div className="flex flex-col items-start gap-1 border-t border-line px-4 pt-2.5 pb-1.5">
              <p className="text-xs text-muted">{fmt(t.search.historyNote, { limit: SEARCH_HISTORY_LIMIT })}</p>
              <button
                type="button"
                onMouseDown={keepFocus}
                onClick={() => {
                  const ok = searchHistory.clear();
                  setHistoryShown(false);
                  setCleared(ok);
                  input.current?.focus();
                }}
                className="-ml-2.5 inline-flex min-h-11 items-center gap-1.5 rounded-[var(--radius-md)] px-2.5 text-sm font-semibold text-accent-600 transition-colors hover:bg-accent-50"
              >
                <Icon name="trash" size={16} className="shrink-0" />
                {t.search.historyClear}
              </button>
            </div>
          </section>
        ) : null}
      </div>
    </form>
  );
}

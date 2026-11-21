"use client";
// Catalogue search field (catalogue, section and search pages, home page). A submitted query is saved to this
// browser's search history; an empty focused field shows the recent searches (SearchHistoryPanel).
import { useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "../icons";
import { SearchSubmitLabel } from "../site/SearchSubmitLabel";
import { SearchHistoryPanel } from "../site/SearchHistoryPanel";
import { useSite } from "../site/SiteProvider";
import { searchHistory, useSearchHistory } from "@/lib/client/search-history";

/** `keep`: other catalogue parameters (sections, filters, sort) that a new search keeps; the page goes back to 1. */
export function CatalogSearchForm({ action, q, keep = [] }: { action: string; q: string; keep?: [string, string][] }) {
  // A new query from the server (another page, the back button) resets the field.
  return <CatalogSearchField key={q} action={action} q={q} keep={keep} />;
}

function CatalogSearchField({ action, q, keep }: { action: string; q: string; keep: [string, string][] }) {
  const { t } = useSite();
  const id = useId();
  const historyId = `${id}-history`;
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState(q);
  const [open, setOpen] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const wrap = useRef<HTMLFormElement>(null);
  const history = useSearchHistory();
  const showHistory = open && !value.trim() && history.length > 0;
  // Escape returns focus to the field: that focus must not reopen the panel (a click or typing does).
  const keepClosed = useRef(false);
  const close = () => {
    keepClosed.current = true;
    setOpen(false);
  };

  const submit = (query: string) => {
    if (pending) return;
    const clean = query.trim().slice(0, 100);
    if (clean) searchHistory.add(clean);
    const params = new URLSearchParams(clean ? { q: clean } : {});
    for (const [k, v] of keep) params.append(k, v);
    const qs = params.toString();
    setOpen(false);
    startTransition(() => router.push(qs ? `${action}?${qs}` : action));
  };

  return (
    <form
      ref={wrap}
      action={action}
      method="get"
      role="search"
      className="relative flex w-full max-w-2xl gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        submit(value);
      }}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false);
      }}
    >
      {keep.map(([k, v], i) => (
        <input key={`${k}-${i}`} type="hidden" name={k} value={v} />
      ))}
      <label htmlFor={id} className="sr-only">{t.items.searchLabel}</label>
      <div className="relative min-w-0 flex-1">
        <Icon name="search" size={20} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-muted" />
        <input
          ref={input}
          id={id}
          name="q"
          type="search"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setOpen(true);
          }}
          onFocus={() => {
            if (keepClosed.current) keepClosed.current = false;
            else setOpen(true);
          }}
          onClick={() => setOpen(true)}
          onKeyDown={(e) => {
            if (!showHistory) return;
            if (e.key === "ArrowDown") {
              e.preventDefault();
              wrap.current?.querySelector<HTMLButtonElement>("[data-history-query]")?.focus();
            } else if (e.key === "Escape") {
              e.preventDefault();
              close();
            }
          }}
          autoComplete="off"
          maxLength={100}
          enterKeyHint="search"
          placeholder={t.items.searchPlaceholder}
          className="sal-search-input h-12 w-full rounded-[var(--radius-lg)] border border-line-strong bg-white pr-3 pl-11 text-[0.98rem] placeholder:text-muted/85 focus:border-brand-600"
        />
        <SearchHistoryPanel
          id={historyId}
          open={showHistory}
          inputRef={input}
          onPick={(query) => {
            setValue(query);
            submit(query);
          }}
          onClose={close}
        />
      </div>
      <button type="submit" aria-busy={pending || undefined} className="sal-search-submit h-12 shrink-0 rounded-[var(--radius-lg)] bg-brand-600 px-5 font-semibold text-white hover:bg-brand-700">
        <SearchSubmitLabel pending={pending}>{t.header.searchSubmit}</SearchSubmitLabel>
      </button>
    </form>
  );
}

"use client";
// Recent searches under an empty search field (header, home page, catalogue). A group of buttons, not a listbox:
// each row repeats the search or removes the entry; the last row clears the history. Keyboard: ↓ from the field moves
// into the list, ↑/↓ move between queries, Escape closes the panel and returns to the field, Tab moves as usual.
// The list lives in this browser only (src/lib/client/search-history.ts).
import { useId, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import { fmt } from "@/lib/i18n/config";
import { HISTORY_SHOWN, searchHistory, useSearchHistory } from "@/lib/client/search-history";
import { Icon } from "../icons";
import { cn } from "../ui/cn";
import { useSite } from "./SiteProvider";

export function SearchHistoryPanel({
  id,
  open,
  inputRef,
  onPick,
  onClose,
  className,
}: {
  id: string;
  /** The field is focused and empty (the parent decides). */
  open: boolean;
  inputRef: RefObject<HTMLInputElement | null>;
  onPick: (q: string) => void;
  onClose: () => void;
  className?: string;
}) {
  const { t } = useSite();
  const history = useSearchHistory();
  const [all, setAll] = useState(false);
  const [announce, setAnnounce] = useState("");
  const titleId = useId();
  const listRef = useRef<HTMLUListElement>(null);
  const shown = open && history.length > 0;
  const visible = all ? history : history.slice(0, HISTORY_SHOWN);

  const focusQuery = (index: number) => {
    const buttons = listRef.current?.querySelectorAll<HTMLButtonElement>("[data-history-query]");
    if (!buttons?.length) return inputRef.current?.focus();
    buttons[Math.max(0, Math.min(buttons.length - 1, index))]?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onClose();
      inputRef.current?.focus();
      return;
    }
    const target = e.target as HTMLElement;
    const index = Number(target.closest("li")?.dataset.index ?? -1);
    if (e.key === "ArrowDown" && index >= 0) {
      e.preventDefault();
      focusQuery(index + 1);
    } else if (e.key === "ArrowUp" && index >= 0) {
      e.preventDefault();
      if (index === 0) inputRef.current?.focus();
      else focusQuery(index - 1);
    }
  };

  return (
    <>
      <span className="sr-only" role="status" aria-live="polite">
        {announce}
      </span>
      <div
        id={id}
        role="group"
        aria-labelledby={titleId}
        hidden={!shown}
        data-search-history=""
        onKeyDown={onKeyDown}
        // Keep the field focused when a row is pressed with the mouse (the panel would otherwise close first).
        onMouseDown={(e) => {
          if ((e.target as HTMLElement).closest("button")) e.preventDefault();
        }}
        className={cn("anim-pop absolute inset-x-0 top-full z-50 mt-2 overflow-hidden rounded-[var(--radius-lg)] border border-line bg-white shadow-[var(--shadow-pop)]", className)}
      >
        <p id={titleId} className="px-4 pt-3 pb-1 text-xs font-semibold tracking-wide text-muted uppercase">
          {t.search.historyTitle}
        </p>
        <ul ref={listRef} className="max-h-[50vh] overflow-y-auto pb-1">
          {visible.map((q, i) => (
            <li key={q} data-index={i} className="flex items-center">
              <button
                type="button"
                data-history-query=""
                onClick={() => onPick(q)}
                aria-label={fmt(t.search.historyRepeat, { q })}
                className="flex min-h-11 min-w-0 flex-1 items-center gap-3 px-4 py-2 text-left text-[0.95rem] text-ink hover:bg-brand-50 focus-visible:bg-brand-50 focus-visible:outline-none"
              >
                <Icon name="clock" size={18} className="shrink-0 text-muted" />
                <span className="truncate">{q}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  searchHistory.remove(q);
                  setAnnounce("");
                  // Stay in the list: focus the next query (or the field when the list is empty).
                  requestAnimationFrame(() => (history.length > 1 ? focusQuery(i) : inputRef.current?.focus()));
                }}
                aria-label={fmt(t.search.historyRemove, { q })}
                className="mr-1 grid size-11 shrink-0 place-items-center rounded-[var(--radius-md)] text-muted hover:bg-surface hover:text-ink focus-visible:outline-3 focus-visible:-outline-offset-3 focus-visible:outline-brand-600"
              >
                <Icon name="close" size={16} />
              </button>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap items-center justify-between gap-x-3 border-t border-line px-2 py-1">
          {history.length > HISTORY_SHOWN ? (
            <button type="button" onClick={() => setAll((v) => !v)} aria-expanded={all} className="inline-flex min-h-11 items-center gap-1 rounded-[var(--radius-md)] px-2 text-sm font-semibold text-brand-700 hover:bg-brand-50">
              {all ? t.search.historyLess : fmt(t.search.historyMore, { count: history.length })}
              <Icon name={all ? "chevronUp" : "chevronDown"} size={16} />
            </button>
          ) : (
            <span className="px-2 text-xs text-muted">{t.search.historyNote}</span>
          )}
          <button
            type="button"
            onClick={() => {
              searchHistory.clear();
              setAll(false);
              setAnnounce(t.search.historyCleared);
              onClose();
              inputRef.current?.focus();
            }}
            className="inline-flex min-h-11 items-center rounded-[var(--radius-md)] px-2 text-sm font-semibold text-muted hover:bg-surface hover:text-ink"
          >
            {t.search.historyClear}
          </button>
        </div>
      </div>
    </>
  );
}

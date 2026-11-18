"use client";
// Horizontal product row for the home page. Native scrolling (finger, trackpad, Shift+wheel, keyboard focus)
// with scroll-snap; on tablets and desktops "previous / next" buttons move one visible page at a time and are
// disabled at the ends. When everything fits, the buttons stay hidden and the row is a plain row.
// The cards themselves are server-rendered children; favourites and "Add to cart" keep working inside.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Icon } from "../icons";
import { cn } from "../ui/cn";

interface Edges {
  overflow: boolean;
  atStart: boolean;
  atEnd: boolean;
}

export function ProductCarousel({ children, label, prevLabel, nextLabel, action }: { children: ReactNode; label: string; prevLabel: string; nextLabel: string; action?: ReactNode }) {
  const list = useRef<HTMLUListElement>(null);
  const [edges, setEdges] = useState<Edges>({ overflow: false, atStart: true, atEnd: true });

  useEffect(() => {
    const el = list.current;
    if (!el) return;
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const max = el.scrollWidth - el.clientWidth;
        const next: Edges = { overflow: max > 4, atStart: el.scrollLeft <= 4, atEnd: el.scrollLeft >= max - 4 };
        setEdges((s) => (s.overflow === next.overflow && s.atStart === next.atStart && s.atEnd === next.atEnd ? s : next));
      });
    };
    measure();
    el.addEventListener("scroll", measure, { passive: true });
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener("scroll", measure);
      ro.disconnect();
    };
  }, []);

  const go = (dir: 1 | -1) => {
    const el = list.current;
    if (!el) return;
    const first = el.querySelector("li");
    const gap = parseFloat(getComputedStyle(el).columnGap) || 16;
    const step = first ? first.getBoundingClientRect().width + gap : el.clientWidth;
    const perPage = Math.max(1, Math.floor((el.clientWidth + gap) / step));
    const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollBy({ left: dir * step * perPage, behavior: smooth ? "smooth" : "auto" });
  };

  return (
    <div role="region" aria-roledescription="carousel" aria-label={label}>
      <ul
        ref={list}
        data-at-start={edges.atStart || undefined}
        data-at-end={edges.atEnd || undefined}
        data-overflow={edges.overflow || undefined}
        className="sal-carousel -mx-4 -my-3 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto overscroll-x-contain px-4 py-3 sm:-mx-6 sm:scroll-px-6 sm:gap-4 sm:px-6 lg:-mx-2 lg:scroll-px-2 lg:px-2"
      >
        {children}
      </ul>
      <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        {action}
        <div className={cn("hidden items-center gap-2 md:flex", !edges.overflow && "invisible")} aria-hidden={!edges.overflow || undefined}>
          <button
            type="button"
            onClick={() => go(-1)}
            disabled={edges.atStart}
            aria-label={prevLabel}
            className="sal-carousel-btn grid size-11 place-items-center rounded-full border border-line-strong bg-white text-ink shadow-sm"
          >
            <Icon name="chevronLeft" size={20} />
          </button>
          <button
            type="button"
            onClick={() => go(1)}
            disabled={edges.atEnd}
            aria-label={nextLabel}
            className="sal-carousel-btn grid size-11 place-items-center rounded-full border border-line-strong bg-white text-ink shadow-sm"
          >
            <Icon name="chevronRight" size={20} />
          </button>
        </div>
      </div>
    </div>
  );
}

/** Width of one carousel slide: a clear peek of the next card on phones, exactly four cards on wide screens. */
export const CAROUSEL_ITEM = "min-w-0 shrink-0 snap-start w-[64%] min-[420px]:w-[46%] sm:w-[40%] md:w-[31%] lg:w-[calc((100%-3rem)/4)]";

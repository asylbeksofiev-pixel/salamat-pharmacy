"use client";
// Horizontal product row (home page, "more in this section" on the product page).
// Native scrolling with scroll-snap (finger, trackpad, Shift+wheel, keyboard focus), mouse drag on desktops and
// "previous / next" buttons on every screen size that move by the number of fully visible cards (useCarousel).
// The buttons are disabled at the ends and hidden when everything fits. There is no autoplay: the row moves only
// when the visitor moves it. The cards are server-rendered children; favourites and the cart keep working inside.
import type { ReactNode } from "react";
import { useCarousel } from "@/lib/client/carousel";
import { useSite } from "../site/SiteProvider";
import { Icon } from "../icons";
import { cn } from "../ui/cn";

export function CarouselArrows({
  prevLabel,
  nextLabel,
  atStart,
  atEnd,
  onPrev,
  onNext,
  controls,
  className,
}: {
  prevLabel: string;
  nextLabel: string;
  atStart: boolean;
  atEnd: boolean;
  onPrev: () => void;
  onNext: () => void;
  controls?: string;
  className?: string;
}) {
  const btn = "sal-carousel-btn grid size-11 shrink-0 touch-manipulation place-items-center rounded-full border border-line-strong bg-white text-ink shadow-sm";
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <button type="button" onClick={onPrev} disabled={atStart} aria-label={prevLabel} aria-controls={controls} className={btn}>
        <Icon name="chevronLeft" size={20} />
      </button>
      <button type="button" onClick={onNext} disabled={atEnd} aria-label={nextLabel} aria-controls={controls} className={btn}>
        <Icon name="chevronRight" size={20} />
      </button>
    </div>
  );
}

export function ProductCarousel({
  children,
  label,
  prevLabel,
  nextLabel,
  action,
  id,
}: {
  children: ReactNode;
  label: string;
  prevLabel: string;
  nextLabel: string;
  action?: ReactNode;
  /** Id of the track (for aria-controls); must be unique on the page. */
  id: string;
}) {
  const { t } = useSite();
  const { ref, state, go } = useCarousel<HTMLUListElement>();
  return (
    <div role="region" aria-roledescription={t.home.carouselRole} aria-label={label}>
      <ul
        ref={ref}
        id={id}
        data-at-start={state.atStart || undefined}
        data-at-end={state.atEnd || undefined}
        data-overflow={state.overflow || undefined}
        className="sal-carousel -mx-4 -my-3 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto overscroll-x-contain px-4 py-3 sm:-mx-6 sm:scroll-px-6 sm:gap-4 sm:px-6 lg:-mx-2 lg:scroll-px-2 lg:px-2"
      >
        {children}
      </ul>
      {action || state.overflow ? (
        <div className="mt-5 flex items-center gap-3 sm:mt-6">
          {action ? <div className="min-w-0 flex-1 sm:flex-none">{action}</div> : null}
          {state.overflow ? (
            <CarouselArrows className="ml-auto" prevLabel={prevLabel} nextLabel={nextLabel} atStart={state.atStart} atEnd={state.atEnd} onPrev={() => go(-1)} onNext={() => go(1)} controls={id} />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** Width of one carousel slide: a clear peek of the next card on phones, exactly four cards on wide screens. */
export const CAROUSEL_ITEM = "min-w-0 shrink-0 snap-start w-[64%] min-[420px]:w-[46%] sm:w-[40%] md:w-[31%] lg:w-[calc((100%-3rem)/4)]";

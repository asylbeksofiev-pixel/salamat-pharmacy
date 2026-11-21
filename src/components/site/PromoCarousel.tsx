"use client";
// "SALAMAT services" carousel on the home page: one banner per view. Native swipe with scroll-snap on
// phones, mouse drag on desktops, "previous / next" buttons and dots for the current banner. Keyboard: Tab
// reaches the banner links and the controls; ←/→ on the controls change the banner. There is no autoplay, so
// nothing moves unless the visitor moves it; with prefers-reduced-motion the change is instant.
import { Children, isValidElement, cloneElement, type KeyboardEvent, type ReactElement, type ReactNode } from "react";
import { useCarousel } from "@/lib/client/carousel";
import { fmt } from "@/lib/i18n/config";
import { useSite } from "./SiteProvider";
import { CarouselArrows } from "../catalog/ProductCarousel";
import { cn } from "../ui/cn";

export function PromoCarousel({ children, id, label }: { children: ReactNode; id: string; label: string }) {
  const { t } = useSite();
  const { ref, state, go, goTo } = useCarousel<HTMLDivElement>();
  const slides = Children.toArray(children).filter(isValidElement) as ReactElement<{ "aria-label"?: string }>[];
  const count = slides.length;
  const multiple = count > 1;

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      go(e.key === "ArrowLeft" ? -1 : 1);
    } else if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      goTo(e.key === "Home" ? 0 : count - 1);
    }
  };

  return (
    <div role="region" aria-roledescription={t.home.carouselRole} aria-label={label}>
      <div
        ref={ref}
        id={id}
        className={cn(
          "sal-promo-track flex rounded-[var(--radius-2xl)] border border-line bg-surface",
          multiple ? "snap-x snap-mandatory overflow-x-auto overflow-y-hidden overscroll-x-contain" : "overflow-hidden",
        )}
      >
        {slides.map((slide, i) =>
          cloneElement(slide, {
            "aria-label": fmt(t.home.promoSlide, { index: i + 1, count }),
          }),
        )}
      </div>
      {multiple ? (
        <div className="mt-3 flex items-center justify-between gap-3" onKeyDown={onKey}>
          <div role="group" aria-label={t.home.promoDots} className="-ml-2 flex min-w-0 flex-wrap items-center">
            {slides.map((_, i) => {
              const active = i === state.index;
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => goTo(i)}
                  aria-label={fmt(t.home.promoGoTo, { index: i + 1 })}
                  aria-current={active || undefined}
                  aria-controls={id}
                  className="group grid h-11 min-w-11 touch-manipulation place-items-center px-1.5"
                >
                  <span className={cn("sal-promo-dot block h-2 rounded-full", active ? "w-6 bg-brand-600" : "w-2 bg-line-strong group-hover:bg-brand-300")} aria-hidden="true" />
                </button>
              );
            })}
          </div>
          <CarouselArrows prevLabel={t.home.promoPrev} nextLabel={t.home.promoNext} atStart={state.atStart} atEnd={state.atEnd} onPrev={() => go(-1)} onNext={() => go(1)} controls={id} />
        </div>
      ) : null}
    </div>
  );
}

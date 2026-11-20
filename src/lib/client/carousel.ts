"use client";
// Shared behaviour of the horizontal carousels (products, promotion banners).
// The track is a native scroll container with scroll-snap: fingers, trackpads, Shift+wheel and keyboard focus
// scroll it natively, so vertical page scrolling on phones is never captured. On top of that:
//   • "previous / next" move by the number of fully visible slides and always stop on a slide edge;
//   • a mouse can drag the track (touch and pen keep the native behaviour); a drag never triggers a click;
//   • the state (overflow, ends, current slide) is measured on scroll and resize for buttons and dots;
//   • with prefers-reduced-motion the moves are instant.
import { useCallback, useEffect, useRef, useState } from "react";

export interface CarouselState {
  /** Slides do not fit: navigation makes sense. */
  overflow: boolean;
  atStart: boolean;
  atEnd: boolean;
  /** Slide closest to the start edge. */
  index: number;
  count: number;
}

const EDGE = 4;

export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function slides(el: HTMLElement): HTMLElement[] {
  return Array.from(el.children) as HTMLElement[];
}

/** Scroll positions where each slide's start meets the track's start edge (scroll-padding included). */
function snapPositions(el: HTMLElement): number[] {
  const box = el.getBoundingClientRect();
  const pad = parseFloat(getComputedStyle(el).scrollPaddingLeft) || 0;
  const max = el.scrollWidth - el.clientWidth;
  return slides(el).map((s) => Math.max(0, Math.min(max, s.getBoundingClientRect().left - box.left + el.scrollLeft - pad)));
}

function closestIndex(positions: number[], left: number): number {
  let best = 0;
  positions.forEach((p, i) => {
    if (Math.abs(p - left) < Math.abs(positions[best] - left)) best = i;
  });
  return best;
}

/** Number of slides fully inside the visible part of the track (at least 1). */
function visibleCount(el: HTMLElement): number {
  const box = el.getBoundingClientRect();
  const style = getComputedStyle(el);
  const left = box.left + (parseFloat(style.scrollPaddingLeft) || 0) - 2;
  const right = box.right - (parseFloat(style.scrollPaddingRight) || 0) + 2;
  const n = slides(el).filter((s) => {
    const r = s.getBoundingClientRect();
    return r.left >= left && r.right <= right;
  }).length;
  return Math.max(1, n);
}

export function useCarousel<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [state, setState] = useState<CarouselState>({ overflow: false, atStart: true, atEnd: true, index: 0, count: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const max = el.scrollWidth - el.clientWidth;
        const next: CarouselState = {
          overflow: max > EDGE,
          atStart: el.scrollLeft <= EDGE,
          atEnd: el.scrollLeft >= max - EDGE,
          index: el.scrollLeft >= max - EDGE ? slides(el).length - 1 : closestIndex(snapPositions(el), el.scrollLeft),
          count: el.children.length,
        };
        setState((s) => (s.overflow === next.overflow && s.atStart === next.atStart && s.atEnd === next.atEnd && s.index === next.index && s.count === next.count ? s : next));
      });
    };
    measure();
    el.addEventListener("scroll", measure, { passive: true });
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    const mo = new MutationObserver(measure);
    mo.observe(el, { childList: true });
    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener("scroll", measure);
      ro.disconnect();
      mo.disconnect();
    };
  }, []);

  /** Scroll so that slide `i` starts at the track's start edge. */
  const goTo = useCallback((i: number) => {
    const el = ref.current;
    if (!el) return;
    const positions = snapPositions(el);
    if (!positions.length) return;
    const target = positions[Math.max(0, Math.min(positions.length - 1, i))];
    el.scrollTo({ left: target, behavior: prefersReducedMotion() ? "auto" : "smooth" });
  }, []);

  /** One "page" back or forward: as many slides as are fully visible now, never past the ends. */
  const go = useCallback((dir: 1 | -1) => {
    const el = ref.current;
    if (!el) return;
    const positions = snapPositions(el);
    if (!positions.length) return;
    const max = el.scrollWidth - el.clientWidth;
    const current = closestIndex(positions, el.scrollLeft);
    const step = visibleCount(el);
    let target = positions[Math.max(0, Math.min(positions.length - 1, current + dir * step))];
    // Near the end the next snap position may equal the current one (clamped by the max): finish the move.
    if (dir > 0 && target <= el.scrollLeft + EDGE) target = max;
    if (dir < 0 && target >= el.scrollLeft - EDGE) target = 0;
    el.scrollTo({ left: target, behavior: prefersReducedMotion() ? "auto" : "smooth" });
  }, []);

  // Mouse drag (desktop). Touch and pen are left to native scrolling, so phones keep their normal feel.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let startX = 0;
    let startLeft = 0;
    let pointer: number | null = null;
    let dragging = false;
    let suppressClick = false;

    const onDown = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" || e.button !== 0) return;
      if ((e.target as HTMLElement).closest("input, textarea, select, [data-no-drag]")) return;
      if (el.scrollWidth - el.clientWidth <= EDGE) return;
      pointer = e.pointerId;
      startX = e.clientX;
      startLeft = el.scrollLeft;
      dragging = false;
    };
    const onMove = (e: PointerEvent) => {
      if (pointer !== e.pointerId) return;
      const dx = e.clientX - startX;
      if (!dragging) {
        if (Math.abs(dx) < 6) return;
        dragging = true;
        el.setPointerCapture(e.pointerId);
        el.dataset.dragging = "";
      }
      el.scrollLeft = startLeft - dx;
    };
    const onUp = (e: PointerEvent) => {
      if (pointer !== e.pointerId) return;
      pointer = null;
      if (!dragging) return;
      dragging = false;
      suppressClick = true;
      setTimeout(() => (suppressClick = false), 0);
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
      delete el.dataset.dragging;
      // Settle on a slide: a deliberate drag moves at least one slide in its direction.
      const positions = snapPositions(el);
      const dx = e.clientX - startX;
      let i = closestIndex(positions, el.scrollLeft);
      const dir = dx < 0 ? 1 : -1;
      if (Math.abs(dx) > 40 && (positions[i] - startLeft) * dir <= 0) i = Math.max(0, Math.min(positions.length - 1, closestIndex(positions, startLeft) + dir));
      if (positions.length) el.scrollTo({ left: positions[i], behavior: prefersReducedMotion() ? "auto" : "smooth" });
    };
    const onClick = (e: MouseEvent) => {
      if (!suppressClick) return;
      e.preventDefault();
      e.stopPropagation();
      suppressClick = false;
    };
    // Links and images inside slides must not start the browser's own drag-and-drop.
    const onDragStart = (e: DragEvent) => e.preventDefault();

    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    el.addEventListener("click", onClick, true);
    el.addEventListener("dragstart", onDragStart);
    return () => {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
      el.removeEventListener("click", onClick, true);
      el.removeEventListener("dragstart", onDragStart);
    };
  }, []);

  return { ref, state, go, goTo };
}

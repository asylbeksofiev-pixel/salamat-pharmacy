"use client";
// Visual feedback after "Add to cart": a small dot flies in an arc from the button to the visible cart icon,
// then the icon gives a short bump (HeaderCounters / MobileBottomNav listen for CART_BUMP_EVENT).
// Purely decorative: the item is already in the cart before this runs, nothing waits for it, and with
// prefers-reduced-motion (or no Web Animations support) only the bump event is sent.

export const CART_BUMP_EVENT = "salamat:cart-bump";

function visibleCartTarget(): HTMLElement | null {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const candidates = Array.from(document.querySelectorAll<HTMLElement>("[data-cart-target]")).filter((el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < vh && r.right > 0 && r.left < vw;
  });
  // The bottom navigation (later in the DOM) wins on phones: it is always in view and under the thumb.
  return candidates.at(-1) ?? null;
}

export function flyToCart(from: Element | null): void {
  if (typeof window === "undefined") return;
  const bump = () => window.dispatchEvent(new CustomEvent(CART_BUMP_EVENT));
  const target = visibleCartTarget();
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!from || !target || reduce || typeof document.body.animate !== "function") {
    bump();
    return;
  }
  const a = from.getBoundingClientRect();
  const b = target.getBoundingClientRect();
  const size = 22;
  const startX = a.left + a.width / 2 - size / 2;
  const startY = a.top + a.height / 2 - size / 2;
  const dx = b.left + b.width / 2 - size / 2 - startX;
  const dy = b.top + b.height / 2 - size / 2 - startY;

  // Two nested elements: the outer one moves horizontally at an even pace, the inner one vertically with an
  // "up, then down" easing — together they draw a soft arc.
  const outer = document.createElement("span");
  outer.className = "sal-fly";
  outer.setAttribute("aria-hidden", "true");
  outer.style.left = `${startX}px`;
  outer.style.top = `${startY}px`;
  const inner = document.createElement("span");
  inner.className = "sal-fly-dot";
  outer.appendChild(inner);
  document.body.appendChild(outer);

  const duration = Math.min(720, 420 + Math.hypot(dx, dy) * 0.25);
  outer.animate([{ transform: "translateX(0)" }, { transform: `translateX(${dx}px)` }], { duration, easing: "cubic-bezier(0.33, 0, 0.67, 1)", fill: "forwards" });
  const lift = Math.min(80, Math.abs(dy) * 0.35 + 30);
  const y = inner.animate(
    [
      { transform: "translateY(0) scale(1)", opacity: 1 },
      { transform: `translateY(${dy < 0 ? dy * 0.35 - lift : -lift}px) scale(1.08)`, opacity: 1, offset: 0.35 },
      { transform: `translateY(${dy}px) scale(0.45)`, opacity: 0.85 },
    ],
    { duration, easing: "cubic-bezier(0.45, 0, 0.55, 1)", fill: "forwards" },
  );
  const finish = () => {
    outer.remove();
    bump();
  };
  y.onfinish = finish;
  y.oncancel = finish;
}

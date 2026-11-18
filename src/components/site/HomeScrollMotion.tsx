"use client";

import { useEffect, useRef, type ReactNode } from "react";

export function HomeScrollMotion({ children }: { children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!root.current || !("IntersectionObserver" in window) || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const viewportHeight = document.documentElement.clientHeight;
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add("sal-home-revealed");
        observer.unobserve(entry.target);
      }
    });

    // Keep anything already on screen visible, including on a restored scroll position.
    for (const node of root.current.querySelectorAll("[data-home-reveal]")) {
      if (node.getBoundingClientRect().top >= viewportHeight && !node.classList.contains("sal-home-revealed")) {
        observer.observe(node);
      }
    }
    return () => observer.disconnect();
  }, []);

  return <div ref={root}>{children}</div>;
}

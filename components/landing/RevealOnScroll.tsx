"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Adds a `.reveal-in` class to its child wrapper when the element
 * crosses the viewport. Pure CSS handles the actual animation
 * (see globals.css `.reveal-on` / `.reveal-in`).
 *
 * Why not framer-motion: a single 6-line IntersectionObserver hook is
 * lighter, ships zero JS for the animation itself, and matches the
 * "no fancy deps" feel of the rest of the page.
 */
export function RevealOnScroll({
  children,
  className = "",
  delayMs = 0,
}: {
  children: ReactNode;
  className?: string;
  delayMs?: number;
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const t = window.setTimeout(() => {
              el.classList.add("reveal-in");
            }, delayMs);
            obs.unobserve(el);
            return () => clearTimeout(t);
          }
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -8% 0px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [delayMs]);

  return (
    <div ref={ref} className={`reveal-on ${className}`}>
      {children}
    </div>
  );
}

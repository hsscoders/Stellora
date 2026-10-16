"use client";

import { useEffect, useRef } from "react";

/**
 * Scroll-reveal wrapper: fades/slides children in when they enter the
 * viewport. Content is only hidden when JS is available (html.js class is
 * added inline before paint), so no-JS visitors and non-hydrated previews
 * always see everything.
 *
 * The 2.5s failsafe ONLY applies to elements that are already inside the
 * viewport at mount (above the fold). Below-fold elements keep waiting for
 * the real intersection so scrolling still reveals them with animation —
 * a global timer would kill every scroll animation before the user arrives.
 */
export function Reveal({
  children,
  className = "",
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  /** Stagger delay in milliseconds */
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (delay) el.style.transitionDelay = `${delay}ms`;

    const show = () => {
      el.classList.add("is-visible");
      io.disconnect();
      if (failsafe) window.clearTimeout(failsafe);
    };
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) show();
      },
      { threshold: 0.1, rootMargin: "0px 0px -6% 0px" }
    );
    io.observe(el);

    // Failsafe only for content already on screen at mount — never let a
    // global timer kill below-fold scroll animations.
    const rect = el.getBoundingClientRect();
    const inInitialViewport = rect.top < window.innerHeight && rect.bottom > 0;
    let failsafe: number | undefined;
    if (inInitialViewport) failsafe = window.setTimeout(show, 2500);

    return () => {
      io.disconnect();
      if (failsafe) window.clearTimeout(failsafe);
    };
  }, [delay]);

  return (
    <div ref={ref} className={`reveal ${className}`}>
      {children}
    </div>
  );
}

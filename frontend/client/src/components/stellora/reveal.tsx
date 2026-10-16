"use client";

import { useEffect, useRef } from "react";

/**
 * Scroll-reveal wrapper: fades/slides children in when they enter the
 * viewport. Content is only hidden when JS is available (html.js class is
 * added inline before paint), so no-JS visitors and non-hydrated previews
 * always see everything. A safety timer also forces visibility if the
 * observer never fires.
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

    const show = () => el.classList.add("is-visible");
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          show();
          io.disconnect();
        }
      },
      { threshold: 0.1, rootMargin: "0px 0px -6% 0px" }
    );
    io.observe(el);

    // Fallback: never leave content hidden for more than 2.5s.
    const t = window.setTimeout(show, 2500);
    return () => {
      io.disconnect();
      window.clearTimeout(t);
    };
  }, [delay]);

  return (
    <div ref={ref} className={`reveal ${className}`}>
      {children}
    </div>
  );
}

"use client";

import { useEffect, useRef } from "react";

/**
 * Hairline scroll-progress bar pinned to the very top of the viewport.
 * Transform-only updates (no layout thrash), rAF-throttled, and hidden
 * entirely on short pages where there is nothing to scroll.
 */
export function ScrollProgress() {
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const bar = barRef.current;
    if (!bar) return;

    let raf = 0;
    const update = () => {
      raf = 0;
      const doc = document.documentElement;
      const max = doc.scrollHeight - window.innerHeight;
      const progress = max > 40 ? Math.min(1, window.scrollY / max) : 0;
      bar.style.transform = `scaleX(${progress})`;
      bar.style.opacity = progress > 0.005 ? "1" : "0";
    };
    const onScroll = () => {
      if (!raf) raf = window.requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div
      ref={barRef}
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-[80] h-[2.5px] origin-left scale-x-0 bg-gradient-to-r from-primary via-primary to-primary/60 opacity-0 transition-opacity duration-300"
      style={{ transform: "scaleX(0)" }}
    />
  );
}

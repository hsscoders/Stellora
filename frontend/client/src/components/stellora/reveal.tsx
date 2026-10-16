/**
 * Scroll-reveal wrapper (SSR-only, zero client JS).
 *
 * The reveal ENGINE lives in the inline bootstrap script in app/layout.tsx:
 * an IntersectionObserver (+ MutationObserver for SPA route changes and a
 * viewport insurance timer) flips .is-visible the moment an element enters
 * the viewport — completely independent of React hydration. That is why this
 * component is intentionally hook-free: a slow, delayed or failed hydration
 * can no longer leave sections (Collections / Shop by Category, etc.) blank
 * after a reload. This wrapper only renders the markup shell plus the
 * per-item stagger delay.
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
  return (
    <div
      className={`reveal${className ? ` ${className}` : ""}`}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
      suppressHydrationWarning
    >
      {children}
    </div>
  );
}

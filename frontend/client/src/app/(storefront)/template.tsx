/**
 * Remounts on every client-side navigation, giving each page a soft
 * CSS-only entrance animation (no layout thrash, SSR-safe).
 */
export default function StorefrontTemplate({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="page-enter">{children}</div>;
}

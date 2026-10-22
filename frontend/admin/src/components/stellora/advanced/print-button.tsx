"use client";

import type { ReactNode } from "react";

/** Client island: prints the current page with a clean report stylesheet. */
export function PrintButton({ label = "Print", icon, className }: { label?: string; icon?: ReactNode; className?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className={className ?? "inline-flex h-9 items-center gap-2 rounded-full border border-border px-4 text-sm transition hover:border-primary hover:text-primary"}
      aria-label={label}
    >
      {icon}
      {label}
    </button>
  );
}

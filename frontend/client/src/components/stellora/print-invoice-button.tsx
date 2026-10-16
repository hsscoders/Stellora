"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Branded invoice printing. The page renders a hidden print-only invoice
 * section (Tailwind `print:block`); this button simply triggers the browser
 * print dialog and hides itself plus all screen chrome via `print:hidden`.
 */
export function PrintInvoiceButton({
  label = "Print Invoice",
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      onClick={() => window.print()}
      className={cn("rounded-full", className)}
      aria-label={label}
    >
      <Printer className="h-4 w-4" /> {label}
    </Button>
  );
}

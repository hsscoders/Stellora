"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * PrintInvoiceButton — tiny client island for server-rendered detail pages.
 * Triggers the browser print dialog (used for invoices / order documents).
 */
export function PrintInvoiceButton({
  label = "Print invoice",
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <Button variant="outline" className={className ?? "rounded-full"} onClick={() => window.print()}>
      <Printer className="h-4 w-4" aria-hidden="true" />
      {label}
    </Button>
  );
}

/**
 * CopyAddressButton — copies a multi-line address to the clipboard with a
 * transient "Copied" feedback. Safe no-op when the clipboard is unavailable.
 */
export function CopyAddressButton({
  address,
  label = "Copy address",
  className,
}: {
  address: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  async function copy() {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Button
      variant="outline"
      className={className ?? "rounded-full"}
      onClick={() => void copy()}
      aria-live="polite"
      title="Copy shipping address to clipboard"
    >
      {copied ? (
        <Check className="h-4 w-4 text-emerald-600" aria-hidden="true" />
      ) : (
        <Copy className="h-4 w-4" aria-hidden="true" />
      )}
      {copied ? "Copied" : label}
    </Button>
  );
}

"use client";

import { Ruler } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const HAIR_ROWS = [
  { inch: 14, cm: 35 },
  { inch: 16, cm: 40 },
  { inch: 18, cm: 46 },
  { inch: 20, cm: 51 },
  { inch: 22, cm: 56 },
  { inch: 24, cm: 61 },
];

const BANGLE_ROWS = [
  { inch: "2.4", mm: 60 },
  { inch: "2.6", mm: 66 },
  { inch: "2.8", mm: 71 },
];

const MEASURE_STEPS = [
  "Clip the hair in (or lay it flat on a table) and smooth it out straight.",
  "Measure from the top of the weft down to the longest point of the ends.",
  "Between sizes? Size up — longer extensions can always be trimmed to match.",
];

/**
 * Subtle "Size guide" trigger + dialog for the product page.
 * Renders beside the variant picker (see VariantPicker in
 * product-detail-client.tsx) and covers both hair extensions and bangles.
 */
export function SizeGuideTrigger({ label = "Size guide" }: { label?: string }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-primary"
        >
          <Ruler className="h-3.5 w-3.5" aria-hidden />
          {label}
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl font-medium">
            Size Guide
          </DialogTitle>
          <DialogDescription>
            Measurements are approximate — hand-finished pieces may vary
            slightly.
          </DialogDescription>
        </DialogHeader>
        <div className="stellora-scroll -mx-1 max-h-[62vh] overflow-y-auto px-1">
          {/* Hair extensions */}
          <section aria-labelledby="sg-hair">
            <h3
              id="sg-hair"
              className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary"
            >
              Hair Extensions
            </h3>
            <Table className="mt-2 text-xs">
              <TableHeader>
                <TableRow>
                  <TableHead className="h-8 text-[11px] uppercase tracking-wider text-muted-foreground">
                    Length (in)
                  </TableHead>
                  <TableHead className="h-8 text-[11px] uppercase tracking-wider text-muted-foreground">
                    Length (approx. cm)
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {HAIR_ROWS.map((r) => (
                  <TableRow key={r.inch}>
                    <TableCell className="py-1.5 tnum">{r.inch}&quot;</TableCell>
                    <TableCell className="py-1.5 tnum text-muted-foreground">
                      {r.cm} cm
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <h4 className="mt-4 text-xs font-semibold">How to measure</h4>
            <ol className="mt-1.5 list-decimal space-y-1 pl-4 text-xs leading-relaxed text-muted-foreground">
              {MEASURE_STEPS.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
          </section>

          {/* Bangles & jewellery */}
          <section
            aria-labelledby="sg-bangles"
            className="mt-6 border-t border-border/60 pt-5"
          >
            <h3
              id="sg-bangles"
              className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary"
            >
              Bangles &amp; Jewellery
            </h3>
            <Table className="mt-2 text-xs">
              <TableHeader>
                <TableRow>
                  <TableHead className="h-8 text-[11px] uppercase tracking-wider text-muted-foreground">
                    Bangle size (in)
                  </TableHead>
                  <TableHead className="h-8 text-[11px] uppercase tracking-wider text-muted-foreground">
                    Inner diameter (mm)
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {BANGLE_ROWS.map((r) => (
                  <TableRow key={r.inch}>
                    <TableCell className="py-1.5 tnum">{r.inch}&quot;</TableCell>
                    <TableCell className="py-1.5 tnum text-muted-foreground">
                      {r.mm} mm
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
              Tip: measure the inner diameter of a bangle that already fits — or
              wrap a paper strip around your knuckles, mark where it overlaps,
              and divide that length by 3.14.
            </p>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}

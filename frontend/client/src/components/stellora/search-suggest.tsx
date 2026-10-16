"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Search, TrendingUp, Loader2 } from "lucide-react";
import { formatINR } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Suggestion = {
  id: string;
  slug: string;
  name: string;
  category: { name: string } | null;
  images: { url: string; alt: string | null }[];
  variants: { price: number | string }[];
};

const TRENDING = ["necklace", "handbag", "lipstick", "hair extensions", "serum"];

/**
 * Live search: debounced suggestions straight from /api/products as the user
 * types, full keyboard navigation (↑ ↓ Enter Esc), thumbnail + price rows,
 * and a "view all results" escape hatch to the search page.
 */
export function SearchSuggest({ onNavigate }: { onNavigate?: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(-1);
  const [dropped, setDropped] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Debounced fetch — 250ms after the last keystroke. All state updates run
  // inside the timeout callback (never synchronously in the effect body).
  useEffect(() => {
    const term = q.trim();
    const t = window.setTimeout(async () => {
      if (term.length < 2) {
        setResults([]);
        setDropped(false);
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const res = await fetch(`/api/products?q=${encodeURIComponent(term)}&page=1`);
        const json = await res.json();
        if (json.ok) {
          setResults((json.data.products ?? []).slice(0, 6));
          setDropped(true);
        }
      } catch {
        /* network hiccup — keep previous state */
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => window.clearTimeout(t);
  }, [q]);

  // Close on outside click; keep focus trap free (panel is inside the header).
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setDropped(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const go = (path: string) => {
    setDropped(false);
    onNavigate?.();
    router.push(path);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setDropped(false);
      (e.target as HTMLInputElement).blur();
      return;
    }
    if (!dropped || results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i <= 0 ? results.length - 1 : i - 1));
    } else if (e.key === "Enter" && active >= 0) {
      e.preventDefault();
      go(`/product/${results[active].slug}`);
    }
  };

  const showPanel = dropped && q.trim().length >= 2;

  return (
    <div ref={boxRef} className="relative mx-auto w-full max-w-3xl">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (q.trim()) go(`/search?q=${encodeURIComponent(q.trim())}`);
        }}
        className="flex gap-2"
        role="search"
      >
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={inputRef}
            autoFocus
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setActive(-1);
            }}
            onKeyDown={onKeyDown}
            placeholder="Search jewellery, hair extensions, vanity, handbags…"
            aria-label="Search products"
            className="pl-9"
          />
          {loading && (
            <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-primary" />
          )}
        </div>
        <Button type="submit" className="bg-primary hover:bg-primary/90">
          Search
        </Button>
      </form>

      {showPanel && (
        <div
          className="anim-fade-up absolute inset-x-0 top-full z-50 mt-2 overflow-hidden rounded-lg border border-border bg-popover shadow-xl shadow-primary/10"
          role="listbox"
          aria-label="Search suggestions"
        >
          {results.length > 0 ? (
            <ul className="stellora-scroll max-h-[min(60vh,420px)] overflow-y-auto">
              {results.map((p, i) => (
                <li key={p.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={i === active}
                    className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors ${
                      i === active ? "bg-accent" : "hover:bg-accent/60"
                    }`}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => go(`/product/${p.slug}`)}
                  >
                    <span className="img-frame relative h-12 w-12 shrink-0 overflow-hidden rounded-md border border-border/60">
                      <Image
                        src={p.images[0]?.url ?? "/images/placeholder.svg"}
                        alt={p.images[0]?.alt ?? p.name}
                        fill
                        sizes="48px"
                        className="object-cover"
                      />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{p.name}</span>
                      <span className="block text-xs text-muted-foreground">
                        {p.category?.name ?? "Stellora"}
                      </span>
                    </span>
                    <span className="tnum text-sm font-semibold text-primary">
                      {formatINR(p.variants[0]?.price ?? 0)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            !loading && (
              <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                No matches for “{q.trim()}” — try another word.
              </p>
            )
          )}
          <button
            type="button"
            onClick={() => go(`/search?q=${encodeURIComponent(q.trim())}`)}
            className="flex w-full items-center justify-between border-t border-border px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.14em] text-primary transition hover:bg-accent/60"
          >
            View all results
            <span aria-hidden>→</span>
          </button>
        </div>
      )}

      {!showPanel && q.trim().length === 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            <TrendingUp className="h-3.5 w-3.5" /> Trending
          </span>
          {TRENDING.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => {
                setQ(t);
                inputRef.current?.focus();
              }}
              className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground transition hover:border-primary/50 hover:text-primary"
            >
              {t}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

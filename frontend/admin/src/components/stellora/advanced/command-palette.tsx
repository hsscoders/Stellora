"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight, BarChart3, Barcode, Image as ImageIcon, Layers, LayoutDashboard, Mail,
  MessageCircle, MessageCircleQuestion, Package, RotateCcw, ScrollText, Search, Send,
  Settings, ShieldCheck, Star, Store, Tags, Ticket, TrendingUp, Truck, Users, ShoppingCart,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ============================================================
   CommandPalette — press Ctrl/Cmd+K anywhere in the admin to
   jump to any page or run quick actions. Fully keyboard driven.
   ============================================================ */

type Cmd = {
  id: string;
  label: string;
  hint?: string;
  icon: React.ComponentType<{ className?: string }>;
  keywords?: string;
  to?: string;
  run?: () => void;
};

const NAV: Cmd[] = [
  { id: "dash", label: "Dashboard", icon: LayoutDashboard, to: "/admin", keywords: "home overview kpi stats" },
  { id: "reports", label: "Reports & Analytics", icon: BarChart3, to: "/admin/reports", keywords: "sales revenue charts" },
  { id: "pos", label: "Point of Sale", icon: Store, to: "/admin/pos", keywords: "pos billing counter register" },
  { id: "orders", label: "Orders", icon: ShoppingCart, to: "/admin/orders", keywords: "sales invoices" },
  { id: "products", label: "Products", icon: Package, to: "/admin/products", keywords: "catalog items jewellery" },
  { id: "categories", label: "Categories", icon: Tags, to: "/admin/categories", keywords: "collections" },
  { id: "inventory", label: "Inventory", icon: Layers, to: "/admin/inventory", keywords: "stock warehouse" },
  { id: "barcodes", label: "Print Labels & Barcodes", icon: Barcode, to: "/admin/barcodes", keywords: "labels qr print" },
  { id: "returns", label: "Returns & Exchanges", icon: RotateCcw, to: "/admin/returns", keywords: "refunds rma" },
  { id: "coupons", label: "Coupons", icon: Ticket, to: "/admin/coupons", keywords: "discount promo" },
  { id: "customers", label: "Customers", icon: Users, to: "/admin/customers", keywords: "clients buyers" },
  { id: "chat", label: "Live Chat", icon: MessageCircle, to: "/admin/chat", keywords: "support inbox" },
  { id: "reviews", label: "Reviews", icon: Star, to: "/admin/reviews", keywords: "ratings feedback" },
  { id: "questions", label: "Product Q&A", icon: MessageCircleQuestion, to: "/admin/questions", keywords: "answers enquiries" },
  { id: "newsletter", label: "Newsletter & Alerts", icon: Send, to: "/admin/newsletter", keywords: "subscribers email" },
  { id: "banners", label: "Banners", icon: ImageIcon, to: "/admin/banners", keywords: "homepage slider hero" },
  { id: "shipping", label: "Shipping", icon: Truck, to: "/admin/shipping", keywords: "delivery charges rates" },
  { id: "seo", label: "SEO & Rankings", icon: TrendingUp, to: "/admin/seo", keywords: "meta sitemap rankings" },
  { id: "messages", label: "Messages", icon: Mail, to: "/admin/messages", keywords: "contact enquiries" },
  { id: "settings", label: "Settings", icon: Settings, to: "/admin/settings", keywords: "store config" },
  { id: "users", label: "Admin Users", icon: ShieldCheck, to: "/admin/users", keywords: "staff accounts roles" },
  { id: "audit", label: "Audit Logs", icon: ScrollText, to: "/admin/audit-logs", keywords: "history activity trail" },
];

export function CommandPalette({ extraActions = [] }: { extraActions?: Cmd[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const all = useMemo(() => [...extraActions, ...NAV], [extraActions]);

  const results = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return all;
    return all.filter((c) => `${c.label} ${c.keywords ?? ""}`.toLowerCase().includes(needle));
  }, [all, q]);

  const openPalette = useCallback(() => {
    setQ("");
    setIdx(0);
    setOpen(true);
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => {
          if (!o) {
            setQ("");
            setIdx(0);
          }
          return !o;
        });
      } else if (e.key === "Escape" && open) {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 30);
  }, [open]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-idx="${idx}"]`)?.scrollIntoView({ block: "nearest" });
  }, [idx]);

  function pick(c: Cmd) {
    setOpen(false);
    if (c.run) c.run();
    else if (c.to) router.push(c.to);
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-start justify-center px-4 pt-[12vh]" role="dialog" aria-modal="true" aria-label="Command palette">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={() => setOpen(false)} />
      <div className="relative w-full max-w-lg overflow-hidden rounded-xl border border-border bg-popover shadow-2xl">
        <div className="flex items-center gap-2 border-b border-border px-3.5">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setIdx(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setIdx((i) => Math.min(i + 1, results.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setIdx((i) => Math.max(i - 1, 0));
              } else if (e.key === "Enter" && results[idx]) {
                e.preventDefault();
                pick(results[idx]);
              }
            }}
            placeholder="Jump to a page or action…"
            className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            aria-label="Command palette search"
          />
          <kbd className="hidden shrink-0 rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground sm:block">ESC</kbd>
        </div>
        <ul ref={listRef} className="max-h-80 overflow-y-auto p-1.5">
          {results.length === 0 && <li className="px-3 py-8 text-center text-sm text-muted-foreground">No matches for “{q}”</li>}
          {results.map((c, i) => (
            <li key={c.id}>
              <button
                data-idx={i}
                onMouseEnter={() => setIdx(i)}
                onClick={() => pick(c)}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition",
                  i === idx ? "bg-primary text-primary-foreground" : "hover:bg-accent"
                )}
              >
                <c.icon className={cn("h-4 w-4 shrink-0", i === idx ? "text-primary-foreground" : "text-muted-foreground")} />
                <span className="min-w-0 flex-1 truncate font-medium">{c.label}</span>
                {c.hint && <span className={cn("shrink-0 text-[11px]", i === idx ? "text-primary-foreground/70" : "text-muted-foreground")}>{c.hint}</span>}
                <ArrowRight className={cn("h-3.5 w-3.5 shrink-0", i === idx ? "text-primary-foreground" : "text-muted-foreground/50")} />
              </button>
            </li>
          ))}
        </ul>
        <div className="flex items-center justify-between border-t border-border px-3.5 py-2 text-[10px] text-muted-foreground">
          <span>↑↓ navigate · ↵ open · esc close</span>
          <span>Stellora Command</span>
        </div>
      </div>
    </div>
  );
}

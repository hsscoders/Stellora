"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Pencil, Trash2, Megaphone, Eye, EyeOff, MousePointerClick } from "lucide-react";
import { toast } from "@/components/ui/notify";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AdvancedTable, type Column } from "@/components/stellora/advanced/data-table";
import { PageHeader } from "@/components/stellora/advanced/page-header";
import { StatCard } from "@/components/stellora/advanced/stat-card";
import { ChipRow, EmptyState } from "@/components/stellora/advanced/widgets";

interface Banner {
  id: string;
  title: string;
  subtitle: string | null;
  imageUrl: string;
  ctaLabel: string | null;
  ctaHref: string | null;
  sortOrder: number;
  isActive: boolean;
}

const STATUS_FILTERS = ["ALL", "ACTIVE", "HIDDEN"] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

const ACTIVE_BADGE = "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300";

export default function AdminBannersPage() {
  const [rows, setRows] = useState<Banner[] | null>(null);
  const [editing, setEditing] = useState<Banner | null>(null);
  const [open, setOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");

  const load = () =>
    fetch("/api/admin/banners")
      .then((r) => r.json())
      .then((j) => setRows(j.ok ? j.data : []));

  useEffect(() => {
    load();
  }, []);

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const payload = {
      title: form.get("title"),
      subtitle: form.get("subtitle"),
      imageUrl: form.get("imageUrl"),
      ctaLabel: form.get("ctaLabel"),
      ctaHref: form.get("ctaHref"),
      sortOrder: Number(form.get("sortOrder") || 0),
      isActive: form.get("isActive") === "on",
    };
    const res = await fetch(editing ? `/api/admin/banners/${editing.id}` : "/api/admin/banners", {
      method: editing ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    if (json.ok) {
      toast.success(editing ? "Banner updated" : "Banner created");
      setOpen(false);
      setEditing(null);
      load();
    } else {
      toast.error(json.error?.message ?? "Could not save banner");
    }
  }

  async function remove(id: string) {
    const res = await fetch(`/api/admin/banners/${id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Banner deleted");
      load();
    }
  }

  const list = useMemo(() => rows ?? [], [rows]);

  const filtered = useMemo(
    () =>
      list.filter(
        (b) =>
          statusFilter === "ALL" ||
          (statusFilter === "ACTIVE" ? b.isActive : !b.isActive)
      ),
    [list, statusFilter]
  );

  const stats = useMemo(() => {
    const active = list.filter((b) => b.isActive).length;
    return {
      total: list.length,
      active,
      hidden: list.length - active,
      withCta: list.filter((b) => !!b.ctaLabel).length,
    };
  }, [list]);

  const counts = useMemo<Partial<Record<StatusFilter, number>>>(
    () => ({ ALL: stats.total, ACTIVE: stats.active, HIDDEN: stats.hidden }),
    [stats]
  );

  const columns: Column<Banner>[] = useMemo(
    () => [
      {
        key: "title",
        header: "Banner",
        sortValue: (b) => b.title,
        searchValue: (b) => `${b.title} ${b.subtitle ?? ""} ${b.ctaLabel ?? ""}`,
        cell: (b) => (
          <span className="flex min-w-0 items-center gap-3">
            <img src={b.imageUrl} alt="" className="h-10 w-24 shrink-0 rounded object-cover" />
            <span className="min-w-0">
              <span className="block truncate font-medium">{b.title}</span>
              {b.subtitle && (
                <span className="block max-w-64 truncate text-xs text-muted-foreground">{b.subtitle}</span>
              )}
            </span>
          </span>
        ),
      },
      {
        key: "cta",
        header: "CTA",
        sortValue: (b) => b.ctaLabel ?? "",
        searchValue: (b) => `${b.ctaLabel ?? ""} ${b.ctaHref ?? ""}`,
        hideBelow: "md",
        cell: (b) =>
          b.ctaLabel ? (
            <span className="block text-sm">
              {b.ctaLabel}
              <span className="block max-w-52 truncate text-xs text-muted-foreground">{b.ctaHref}</span>
            </span>
          ) : (
            <span className="text-sm text-muted-foreground">—</span>
          ),
      },
      {
        key: "sortOrder",
        header: "Order",
        align: "right",
        sortValue: (b) => b.sortOrder,
        hideBelow: "sm",
        cell: (b) => <span className="tnum text-sm text-muted-foreground">{b.sortOrder}</span>,
      },
      {
        key: "status",
        header: "Status",
        sortValue: (b) => (b.isActive ? "Active" : "Hidden"),
        searchValue: (b) => (b.isActive ? "active" : "hidden"),
        cell: (b) => (
          <Badge variant="secondary" className={`text-[11px] ${b.isActive ? ACTIVE_BADGE : ""}`}>
            {b.isActive ? "Active" : "Hidden"}
          </Badge>
        ),
      },
      {
        key: "actions",
        header: <span className="sr-only">Actions</span>,
        align: "right",
        cell: (b) => (
          <div className="flex justify-end gap-1">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Edit"
              onClick={() => {
                setEditing(b);
                setOpen(true);
              }}
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" aria-label="Delete" onClick={() => remove(b.id)}>
              <Trash2 className="h-4 w-4 text-muted-foreground" />
            </Button>
          </div>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Megaphone}
        title="Homepage Banners"
        subtitle="Hero slides shown on the storefront homepage — lower sort order appears first."
        actions={
          <Button
            className="rounded-full bg-primary hover:bg-primary/90"
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
          >
            <Plus className="h-4 w-4" /> New banner
          </Button>
        }
      />

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard label="Banners" value={stats.total} icon={Megaphone} />
        <StatCard label="Active" value={stats.active} icon={Eye} accent="text-emerald-600" />
        <StatCard label="Hidden" value={stats.hidden} icon={EyeOff} accent="text-amber-600" />
        <StatCard label="With CTA" value={stats.withCta} icon={MousePointerClick} />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <ChipRow
          label="Banner status"
          value={statusFilter}
          options={STATUS_FILTERS}
          onChange={setStatusFilter}
          counts={counts}
        />
      </div>

      <AdvancedTable
        columns={columns}
        rows={rows}
        getKey={(b) => b.id}
        searchable
        searchPlaceholder="Search title, subtitle or CTA…"
        initialSort={{ key: "sortOrder", dir: "asc" }}
        csvName="banners"
        printTitle="Homepage Banners"
        loading={rows === null}
        emptyMessage={
          <EmptyState
            icon={Megaphone}
            title={list.length === 0 ? "No banners yet" : "No banners match this filter"}
            hint="Banners are the first thing shoppers see — keep them fresh and on-season."
            action={
              <Button
                size="sm"
                className="rounded-full"
                onClick={() => {
                  setEditing(null);
                  setOpen(true);
                }}
              >
                <Plus className="h-3.5 w-3.5" /> New banner
              </Button>
            }
          />
        }
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit banner" : "New banner"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={save} className="space-y-3">
            <div>
              <Label htmlFor="btitle">Title *</Label>
              <Input id="btitle" name="title" defaultValue={editing?.title} required />
            </div>
            <div>
              <Label htmlFor="bsub">Subtitle</Label>
              <Input id="bsub" name="subtitle" defaultValue={editing?.subtitle ?? ""} />
            </div>
            <div>
              <Label htmlFor="bimg">Image URL / path *</Label>
              <Input id="bimg" name="imageUrl" defaultValue={editing?.imageUrl} required placeholder="/images/banners/..." />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="bcta">CTA label</Label>
                <Input id="bcta" name="ctaLabel" defaultValue={editing?.ctaLabel ?? ""} />
              </div>
              <div>
                <Label htmlFor="bhref">CTA link</Label>
                <Input id="bhref" name="ctaHref" defaultValue={editing?.ctaHref ?? ""} placeholder="/category/jewellery" />
              </div>
            </div>
            <div className="flex items-center gap-6">
              <div>
                <Label htmlFor="border">Sort order</Label>
                <Input id="border" name="sortOrder" type="number" min="0" defaultValue={editing?.sortOrder ?? 0} className="w-28" />
              </div>
              <div className="flex items-center gap-2 pt-4">
                <Switch id="bactive" name="isActive" defaultChecked={editing?.isActive ?? true} />
                <Label htmlFor="bactive" className="text-sm font-normal">
                  Active
                </Label>
              </div>
            </div>
            <Button type="submit" className="w-full rounded-full bg-primary hover:bg-primary/90">
              Save banner
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Pencil, Trash2, Tags, Eye, EyeOff, Package } from "lucide-react";
import { toast } from "@/components/ui/notify";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AdvancedTable, type Column } from "@/components/stellora/advanced/data-table";
import { PageHeader } from "@/components/stellora/advanced/page-header";
import { StatCard } from "@/components/stellora/advanced/stat-card";
import { ChipRow, EmptyState } from "@/components/stellora/advanced/widgets";

interface Category {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  sortOrder: number;
  isActive: boolean;
  _count: { products: number };
}

const STATUS_FILTERS = ["ALL", "ACTIVE", "HIDDEN"] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

const ACTIVE_BADGE = "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300";

export default function AdminCategoriesPage() {
  const [cats, setCats] = useState<Category[] | null>(null);
  const [editing, setEditing] = useState<Category | null>(null);
  const [open, setOpen] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");

  const load = () =>
    fetch("/api/admin/categories")
      .then((r) => r.json())
      .then((j) => setCats(j.ok ? j.data : []));

  useEffect(() => {
    load();
  }, []);

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrors({});
    const form = new FormData(e.currentTarget);
    const payload = {
      name: form.get("name"),
      slug: form.get("slug"),
      description: form.get("description"),
      imageUrl: form.get("imageUrl"),
      sortOrder: Number(form.get("sortOrder") || 0),
      isActive: form.get("isActive") === "on",
    };
    const res = await fetch(
      editing ? `/api/admin/categories/${editing.id}` : "/api/admin/categories",
      { method: editing ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }
    );
    const json = await res.json();
    if (json.ok) {
      toast.success(editing ? "Category updated" : "Category created");
      setOpen(false);
      setEditing(null);
      load();
    } else {
      setErrors(json.error?.fields ?? {});
      toast.error(json.error?.message ?? "Could not save category");
    }
  }

  async function remove(id: string) {
    const res = await fetch(`/api/admin/categories/${id}`, { method: "DELETE" });
    const json = await res.json();
    if (json.ok) {
      toast.success("Category deleted");
      load();
    } else {
      toast.error(json.error?.message ?? "Could not delete");
    }
  }

  const list = useMemo(() => cats ?? [], [cats]);

  const filtered = useMemo(
    () =>
      list.filter(
        (c) =>
          statusFilter === "ALL" ||
          (statusFilter === "ACTIVE" ? c.isActive : !c.isActive)
      ),
    [list, statusFilter]
  );

  const stats = useMemo(() => {
    const active = list.filter((c) => c.isActive).length;
    return {
      total: list.length,
      active,
      hidden: list.length - active,
      products: list.reduce((n, c) => n + c._count.products, 0),
    };
  }, [list]);

  const counts = useMemo<Partial<Record<StatusFilter, number>>>(
    () => ({ ALL: stats.total, ACTIVE: stats.active, HIDDEN: stats.hidden }),
    [stats]
  );

  const columns: Column<Category>[] = useMemo(
    () => [
      {
        key: "name",
        header: "Category",
        sortValue: (c) => c.name,
        searchValue: (c) => `${c.name} ${c.slug} ${c.description ?? ""}`,
        cell: (c) => (
          <span className="flex min-w-0 items-center gap-3">
            {c.imageUrl ? (
              <img src={c.imageUrl} alt="" className="h-9 w-9 shrink-0 rounded-md border border-border/60 object-cover" />
            ) : (
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border/60 bg-muted">
                <Tags className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              </span>
            )}
            <span className="min-w-0">
              <span className="block truncate font-medium">{c.name}</span>
              {c.description && (
                <span className="block max-w-72 truncate text-xs text-muted-foreground">{c.description}</span>
              )}
            </span>
          </span>
        ),
      },
      {
        key: "slug",
        header: "Slug",
        sortValue: (c) => c.slug,
        searchValue: (c) => c.slug,
        hideBelow: "md",
        cell: (c) => <span className="text-sm text-muted-foreground">/{c.slug}</span>,
      },
      {
        key: "products",
        header: "Products",
        align: "right",
        sortValue: (c) => c._count.products,
        cell: (c) => (
          <Badge variant="secondary" className="tnum text-[11px]">
            {c._count.products}
          </Badge>
        ),
      },
      {
        key: "sortOrder",
        header: "Order",
        align: "right",
        sortValue: (c) => c.sortOrder,
        hideBelow: "sm",
        cell: (c) => <span className="tnum text-sm text-muted-foreground">{c.sortOrder}</span>,
      },
      {
        key: "status",
        header: "Status",
        sortValue: (c) => (c.isActive ? "Active" : "Hidden"),
        searchValue: (c) => (c.isActive ? "active" : "hidden"),
        cell: (c) => (
          <Badge variant="secondary" className={`text-[11px] ${c.isActive ? ACTIVE_BADGE : ""}`}>
            {c.isActive ? "Active" : "Hidden"}
          </Badge>
        ),
      },
      {
        key: "actions",
        header: <span className="sr-only">Actions</span>,
        align: "right",
        cell: (c) => (
          <div className="flex justify-end gap-1">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Edit"
              onClick={() => {
                setEditing(c);
                setOpen(true);
              }}
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Delete"
              disabled={c._count.products > 0}
              title={c._count.products > 0 ? "Move or delete its products first" : "Delete category"}
              onClick={() => remove(c.id)}
            >
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
        icon={Tags}
        title="Categories"
        subtitle="Group products into storefront collections — ordering here controls the navigation order."
        actions={
          <Button
            className="rounded-full bg-primary hover:bg-primary/90"
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
          >
            <Plus className="h-4 w-4" /> New category
          </Button>
        }
      />

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard label="Categories" value={stats.total} icon={Tags} />
        <StatCard label="Active" value={stats.active} icon={Eye} accent="text-emerald-600" />
        <StatCard label="Hidden" value={stats.hidden} icon={EyeOff} accent="text-amber-600" />
        <StatCard label="Products covered" value={stats.products} icon={Package} />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <ChipRow
          label="Category status"
          value={statusFilter}
          options={STATUS_FILTERS}
          onChange={setStatusFilter}
          counts={counts}
        />
      </div>

      <AdvancedTable
        columns={columns}
        rows={cats}
        getKey={(c) => c.id}
        searchable
        searchPlaceholder="Search name, slug or description…"
        initialSort={{ key: "sortOrder", dir: "asc" }}
        csvName="categories"
        printTitle="Categories"
        loading={cats === null}
        emptyMessage={
          <EmptyState
            icon={Tags}
            title={list.length === 0 ? "No categories yet" : "No categories match this filter"}
            hint="Categories group your products and power storefront navigation."
            action={
              <Button
                size="sm"
                className="rounded-full"
                onClick={() => {
                  setEditing(null);
                  setOpen(true);
                }}
              >
                <Plus className="h-3.5 w-3.5" /> New category
              </Button>
            }
          />
        }
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit category" : "New category"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={save} className="space-y-3">
            <div>
              <Label htmlFor="cname">Name *</Label>
              <Input id="cname" name="name" defaultValue={editing?.name} required minLength={2} />
              {errors.name && <p className="mt-1 text-xs text-destructive">{errors.name}</p>}
            </div>
            <div>
              <Label htmlFor="cslug">Slug (auto if empty)</Label>
              <Input id="cslug" name="slug" defaultValue={editing?.slug} />
              {errors.slug && <p className="mt-1 text-xs text-destructive">{errors.slug}</p>}
            </div>
            <div>
              <Label htmlFor="cdesc">Description</Label>
              <Textarea id="cdesc" name="description" defaultValue={editing?.description ?? ""} rows={3} />
            </div>
            <div>
              <Label htmlFor="cimg">Image URL / path</Label>
              <Input id="cimg" name="imageUrl" defaultValue={editing?.imageUrl ?? ""} placeholder="/images/banners/..." />
            </div>
            <div className="grid grid-cols-2 items-end gap-3">
              <div>
                <Label htmlFor="corder">Sort order</Label>
                <Input id="corder" name="sortOrder" type="number" min="0" defaultValue={editing?.sortOrder ?? 0} />
              </div>
              <div className="flex items-center gap-2 pb-2">
                <Switch id="cactive" name="isActive" defaultChecked={editing?.isActive ?? true} />
                <Label htmlFor="cactive" className="text-sm font-normal">
                  Active
                </Label>
              </div>
            </div>
            <Button type="submit" className="w-full rounded-full bg-primary hover:bg-primary/90">
              Save category
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

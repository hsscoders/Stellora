"use client";

import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

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

export default function AdminCategoriesPage() {
  const [cats, setCats] = useState<Category[] | null>(null);
  const [editing, setEditing] = useState<Category | null>(null);
  const [open, setOpen] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

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

  if (!cats) return <p className="py-16 text-center text-sm text-muted-foreground">Loading…</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-serif text-3xl font-medium">Categories</h1>
        <Button
          className="rounded-full bg-primary hover:bg-primary/90"
          onClick={() => {
            setEditing(null);
            setOpen(true);
          }}
        >
          <Plus className="h-4 w-4" /> New category
        </Button>
      </div>

      <div className="rounded-lg border border-border/70 bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Slug</TableHead>
              <TableHead>Products</TableHead>
              <TableHead>Order</TableHead>
              <TableHead>Active</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {cats.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-medium">{c.name}</TableCell>
                <TableCell className="text-sm text-muted-foreground">/{c.slug}</TableCell>
                <TableCell className="tnum text-sm">{c._count.products}</TableCell>
                <TableCell className="tnum text-sm">{c.sortOrder}</TableCell>
                <TableCell>
                  <Badge variant="secondary" className={c.isActive ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300" : ""}>
                    {c.isActive ? "Active" : "Hidden"}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
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
                      onClick={() => remove(c.id)}
                    >
                      <Trash2 className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

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

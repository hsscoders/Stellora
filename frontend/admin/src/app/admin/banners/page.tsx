"use client";

import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

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

export default function AdminBannersPage() {
  const [rows, setRows] = useState<Banner[] | null>(null);
  const [editing, setEditing] = useState<Banner | null>(null);
  const [open, setOpen] = useState(false);

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

  if (!rows) return <p className="py-16 text-center text-sm text-muted-foreground">Loading…</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-serif text-3xl font-medium">Homepage Banners</h1>
        <Button
          className="rounded-full bg-primary hover:bg-primary/90"
          onClick={() => {
            setEditing(null);
            setOpen(true);
          }}
        >
          <Plus className="h-4 w-4" /> New banner
        </Button>
      </div>

      <div className="rounded-lg border border-border/70 bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Banner</TableHead>
              <TableHead>CTA</TableHead>
              <TableHead>Order</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((b) => (
              <TableRow key={b.id}>
                <TableCell>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={b.imageUrl} alt="" className="h-10 w-24 rounded object-cover" />
                  <p className="mt-1.5 font-medium">{b.title}</p>
                  {b.subtitle && <p className="max-w-64 truncate text-xs text-muted-foreground">{b.subtitle}</p>}
                </TableCell>
                <TableCell className="text-sm">
                  {b.ctaLabel ? (
                    <>
                      {b.ctaLabel}
                      <p className="text-xs text-muted-foreground">{b.ctaHref}</p>
                    </>
                  ) : (
                    "—"
                  )}
                </TableCell>
                <TableCell className="tnum text-sm">{b.sortOrder}</TableCell>
                <TableCell>
                  <Badge variant="secondary" className={b.isActive ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300" : ""}>
                    {b.isActive ? "Active" : "Hidden"}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
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
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                  No banners yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

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

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
import { formatINR } from "@/lib/utils";

interface Coupon {
  id: string;
  code: string;
  description: string | null;
  discountType: string;
  value: string;
  minSubtotal: string | null;
  maxDiscount: string | null;
  startsAt: string | null;
  endsAt: string | null;
  usageLimit: number | null;
  perUserLimit: number | null;
  timesUsed: number;
  isActive: boolean;
  _count: { redemptions: number };
}

export default function AdminCouponsPage() {
  const [rows, setRows] = useState<Coupon[] | null>(null);
  const [editing, setEditing] = useState<Coupon | null>(null);
  const [open, setOpen] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const load = () =>
    fetch("/api/admin/coupons")
      .then((r) => r.json())
      .then((j) => setRows(j.ok ? j.data : []));

  useEffect(() => {
    load();
  }, []);

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrors({});
    const form = new FormData(e.currentTarget);
    const g = (k: string) => String(form.get(k) ?? "").trim();
    const payload = {
      code: g("code").toUpperCase(),
      description: g("description"),
      discountType: g("discountType"),
      value: Number(g("value")),
      minSubtotal: g("minSubtotal") ? Number(g("minSubtotal")) : null,
      maxDiscount: g("maxDiscount") ? Number(g("maxDiscount")) : null,
      startsAt: g("startsAt") || null,
      endsAt: g("endsAt") || null,
      usageLimit: g("usageLimit") ? Number(g("usageLimit")) : null,
      perUserLimit: g("perUserLimit") ? Number(g("perUserLimit")) : null,
      isActive: form.get("isActive") === "on",
    };
    const res = await fetch(editing ? `/api/admin/coupons/${editing.id}` : "/api/admin/coupons", {
      method: editing ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    if (json.ok) {
      toast.success(editing ? "Coupon updated" : "Coupon created");
      setOpen(false);
      setEditing(null);
      load();
    } else {
      setErrors(json.error?.fields ?? {});
      toast.error(json.error?.message ?? "Could not save coupon");
    }
  }

  async function remove(id: string) {
    const res = await fetch(`/api/admin/coupons/${id}`, { method: "DELETE" });
    const json = await res.json();
    if (json.ok) {
      toast.success(json.data.deactivated ? json.data.message : "Coupon deleted");
      load();
    } else {
      toast.error(json.error?.message ?? "Action failed");
    }
  }

  if (!rows) return <p className="py-16 text-center text-sm text-muted-foreground">Loading…</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-serif text-3xl font-medium">Coupons</h1>
        <Button
          className="rounded-full bg-primary hover:bg-primary/90"
          onClick={() => {
            setEditing(null);
            setOpen(true);
          }}
        >
          <Plus className="h-4 w-4" /> New coupon
        </Button>
      </div>

      <div className="rounded-lg border border-border/70 bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Discount</TableHead>
              <TableHead>Conditions</TableHead>
              <TableHead>Used</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((c) => (
              <TableRow key={c.id}>
                <TableCell>
                  <p className="font-mono font-semibold">{c.code}</p>
                  {c.description && <p className="text-xs text-muted-foreground">{c.description}</p>}
                </TableCell>
                <TableCell className="text-sm tnum">
                  {c.discountType === "PERCENT" ? `${Number(c.value)}% off` : `${formatINR(c.value)} off`}
                  {c.maxDiscount && <p className="text-xs text-muted-foreground">max {formatINR(c.maxDiscount)}</p>}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {c.minSubtotal && <p>min {formatINR(c.minSubtotal)}</p>}
                  {c.usageLimit && <p>limit {c.usageLimit}</p>}
                  {c.perUserLimit && <p>per user {c.perUserLimit}</p>}
                  {c.endsAt && <p>ends {new Date(c.endsAt).toLocaleDateString("en-IN")}</p>}
                </TableCell>
                <TableCell className="tnum text-sm">{c.timesUsed}</TableCell>
                <TableCell>
                  <Badge
                    variant="secondary"
                    className={
                      c.isActive
                        ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
                        : ""
                    }
                  >
                    {c.isActive ? "Active" : "Inactive"}
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
                    <Button variant="ghost" size="icon" aria-label="Delete" onClick={() => remove(c.id)}>
                      <Trash2 className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                  No coupons yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit coupon" : "New coupon"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={save} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="code">Code *</Label>
                <Input id="code" name="code" defaultValue={editing?.code} required placeholder="WELCOME10" className="font-mono uppercase" />
                {errors.code && <p className="mt-1 text-xs text-destructive">{errors.code}</p>}
              </div>
              <div>
                <Label htmlFor="discountType">Type *</Label>
                <select
                  id="discountType"
                  name="discountType"
                  defaultValue={editing?.discountType ?? "PERCENT"}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                >
                  <option value="PERCENT">Percent (%)</option>
                  <option value="FIXED">Fixed (₹)</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="value">Value *</Label>
                <Input id="value" name="value" type="number" step="0.01" min="0.01" defaultValue={editing ? Number(editing.value) : ""} required />
                {errors.value && <p className="mt-1 text-xs text-destructive">{errors.value}</p>}
              </div>
              <div>
                <Label htmlFor="maxDiscount">Max discount (₹, optional)</Label>
                <Input id="maxDiscount" name="maxDiscount" type="number" step="0.01" min="0" defaultValue={editing?.maxDiscount ? Number(editing.maxDiscount) : ""} />
              </div>
            </div>
            <div>
              <Label htmlFor="description">Description</Label>
              <Input id="description" name="description" defaultValue={editing?.description ?? ""} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="minSubtotal">Min subtotal (₹)</Label>
                <Input id="minSubtotal" name="minSubtotal" type="number" step="0.01" min="0" defaultValue={editing?.minSubtotal ? Number(editing.minSubtotal) : ""} />
              </div>
              <div>
                <Label htmlFor="perUserLimit">Per-user limit</Label>
                <Input id="perUserLimit" name="perUserLimit" type="number" min="1" defaultValue={editing?.perUserLimit ?? ""} />
              </div>
              <div>
                <Label htmlFor="usageLimit">Total usage limit</Label>
                <Input id="usageLimit" name="usageLimit" type="number" min="1" defaultValue={editing?.usageLimit ?? ""} />
              </div>
              <div>
                <Label htmlFor="endsAt">Ends at</Label>
                <Input id="endsAt" name="endsAt" type="datetime-local" defaultValue={editing?.endsAt ? editing.endsAt.slice(0, 16) : ""} />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch id="isActive" name="isActive" defaultChecked={editing?.isActive ?? true} />
              <Label htmlFor="isActive" className="text-sm font-normal">
                Active
              </Label>
            </div>
            <Button type="submit" className="w-full rounded-full bg-primary hover:bg-primary/90">
              Save coupon
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

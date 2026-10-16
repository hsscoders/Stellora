"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatINR } from "@/lib/utils";

interface Rate {
  id: string;
  name: string;
  baseFee: string;
  freeAbove: string | null;
  isActive: boolean;
  sortOrder: number;
}

export default function AdminShippingPage() {
  const [rows, setRows] = useState<Rate[] | null>(null);

  const load = () =>
    fetch("/api/admin/shipping")
      .then((r) => r.json())
      .then((j) => setRows(j.ok ? j.data : []));

  useEffect(() => {
    load();
  }, []);

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const payload = {
      name: form.get("name"),
      baseFee: Number(form.get("baseFee")),
      freeAbove: form.get("freeAbove") ? Number(form.get("freeAbove")) : null,
      isActive: form.get("isActive") === "on",
      sortOrder: Number(form.get("sortOrder") || 0),
    };
    const res = await fetch("/api/admin/shipping", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    if (json.ok) {
      toast.success("Shipping rate added");
      (e.target as HTMLFormElement).reset();
      load();
    } else {
      toast.error(json.error?.message ?? "Could not save rate");
    }
  }

  async function toggle(r: Rate) {
    const res = await fetch(`/api/admin/shipping/${r.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: r.name,
        baseFee: Number(r.baseFee),
        freeAbove: r.freeAbove ? Number(r.freeAbove) : null,
        isActive: !r.isActive,
        sortOrder: r.sortOrder,
      }),
    });
    if (res.ok) {
      load();
    }
  }

  async function remove(id: string) {
    const res = await fetch(`/api/admin/shipping/${id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Rate removed");
      load();
    }
  }

  if (!rows) return <p className="py-16 text-center text-sm text-muted-foreground">Loading…</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-3xl font-medium">Shipping Configuration</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          The first active rate (by sort order) is applied at checkout. Configure your real rates
          here — the seeded values are samples.
        </p>
      </div>

      <div className="rounded-lg border border-border/70 bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Fee</TableHead>
              <TableHead>Free above</TableHead>
              <TableHead>Order</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.name}</TableCell>
                <TableCell className="tnum text-sm">{formatINR(r.baseFee)}</TableCell>
                <TableCell className="tnum text-sm">
                  {r.freeAbove ? formatINR(r.freeAbove) : "—"}
                </TableCell>
                <TableCell className="tnum text-sm">{r.sortOrder}</TableCell>
                <TableCell>
                  <Badge variant="secondary" className={r.isActive ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300" : ""}>
                    {r.isActive ? "Active" : "Inactive"}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={() => toggle(r)}>
                      {r.isActive ? "Disable" : "Enable"}
                    </Button>
                    <Button variant="ghost" size="icon" aria-label="Delete" onClick={() => remove(r.id)}>
                      <Trash2 className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <form onSubmit={save} className="grid gap-4 rounded-lg border border-border/70 bg-card p-6 sm:grid-cols-5 sm:items-end">
        <div className="sm:col-span-1">
          <Label htmlFor="rname">Name *</Label>
          <Input id="rname" name="name" required placeholder="Standard Delivery" />
        </div>
        <div>
          <Label htmlFor="rfee">Fee (₹) *</Label>
          <Input id="rfee" name="baseFee" type="number" step="0.01" min="0" required />
        </div>
        <div>
          <Label htmlFor="rfree">Free above (₹)</Label>
          <Input id="rfree" name="freeAbove" type="number" step="0.01" min="0" />
        </div>
        <div>
          <Label htmlFor="rorder">Sort order</Label>
          <Input id="rorder" name="sortOrder" type="number" min="0" defaultValue={rows.length} />
        </div>
        <div className="flex items-center gap-3 sm:pb-2">
          <Switch id="ractive" name="isActive" defaultChecked />
          <Label htmlFor="ractive" className="text-sm font-normal">
            Active
          </Label>
          <Button type="submit" className="rounded-full bg-primary hover:bg-primary/90">
            <Plus className="h-4 w-4" /> Add
          </Button>
        </div>
      </form>
    </div>
  );
}

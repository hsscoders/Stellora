"use client";

import { useEffect, useState } from "react";
import { Search, Ban, CheckCircle2, Download } from "lucide-react";
import { toast } from "@/components/ui/notify";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate } from "@/lib/utils";

interface CustomerRow {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  isActive: boolean;
  createdAt: string;
  _count: { orders: number };
}

type CustomerFilter = "ALL" | "ACTIVE" | "DEACTIVATED" | "WITH_ORDERS";

const FILTERS: { key: CustomerFilter; label: string }[] = [
  { key: "ALL", label: "All" },
  { key: "ACTIVE", label: "Active" },
  { key: "DEACTIVATED", label: "Deactivated" },
  { key: "WITH_ORDERS", label: "Has orders" },
];

export default function AdminCustomersPage() {
  const [rows, setRows] = useState<CustomerRow[] | null>(null);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<CustomerFilter>("ALL");

  useEffect(() => {
    fetch("/api/admin/customers-list")
      .then((r) => r.json())
      .then((j) => setRows(j.ok ? j.data : []))
      .catch(() => setRows([]));
  }, []);

  async function toggle(id: string, isActive: boolean) {
    const res = await fetch(`/api/admin/customers/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive }),
    });
    const json = await res.json();
    if (json.ok) {
      toast.success(isActive ? "Customer reactivated" : "Customer deactivated (sessions revoked)");
      setRows((prev) => prev?.map((r) => (r.id === id ? { ...r, isActive } : r)) ?? null);
    } else {
      toast.error(json.error?.message ?? "Action failed");
    }
  }

  const filtered = rows?.filter(
    (r) =>
      (filter === "ALL" ||
        (filter === "ACTIVE" && r.isActive) ||
        (filter === "DEACTIVATED" && !r.isActive) ||
        (filter === "WITH_ORDERS" && r._count.orders > 0)) &&
      (!q ||
        r.name.toLowerCase().includes(q.toLowerCase()) ||
        r.email.toLowerCase().includes(q.toLowerCase()))
  );

  const stats = rows
    ? {
        total: rows.length,
        active: rows.filter((r) => r.isActive).length,
        withOrders: rows.filter((r) => r._count.orders > 0).length,
      }
    : null;

  if (!rows) return <p className="py-16 text-center text-sm text-muted-foreground">Loading…</p>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl font-medium">Customers</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Privacy first: passwords are never displayed or accessible, and records are never deleted
            (orders must remain accurate).
          </p>
        </div>
        <a href="/api/admin/export/customers" className="inline-flex h-9 items-center gap-2 rounded-full border border-border px-4 text-sm transition hover:border-primary hover:text-primary">
          <Download className="h-4 w-4" /> Export CSV
        </a>
      </div>

      {stats && (
        <div className="flex flex-wrap gap-2 text-sm">
          <span className="rounded-full border border-border bg-card px-3 py-1 tnum">{stats.total} total</span>
          <span className="rounded-full border border-border bg-card px-3 py-1 tnum text-emerald-700 dark:text-emerald-400">{stats.active} active</span>
          <span className="rounded-full border border-border bg-card px-3 py-1 tnum">{stats.withOrders} with orders</span>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-sm min-w-52 flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or email…" className="pl-9" />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              aria-pressed={filter === f.key}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                filter === f.key ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:bg-accent"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-border/70 bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Customer</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead>Orders</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered?.map((c) => (
              <TableRow key={c.id}>
                <TableCell>
                  <p className="font-medium">{c.name}</p>
                  <p className="text-xs text-muted-foreground">{c.email}</p>
                </TableCell>
                <TableCell className="text-sm">{formatDate(c.createdAt)}</TableCell>
                <TableCell className="tnum text-sm">{c._count.orders}</TableCell>
                <TableCell>
                  <Badge
                    variant="secondary"
                    className={
                      c.isActive
                        ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
                        : "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300"
                    }
                  >
                    {c.isActive ? "Active" : "Deactivated"}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => toggle(c.id, !c.isActive)}
                  >
                    {c.isActive ? (
                      <>
                        <Ban className="h-3.5 w-3.5" /> Deactivate
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="h-3.5 w-3.5" /> Reactivate
                      </>
                    )}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {filtered?.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                  No customers found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

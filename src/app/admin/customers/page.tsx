"use client";

import { useEffect, useState } from "react";
import { Search, Ban, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
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

export default function AdminCustomersPage() {
  const [rows, setRows] = useState<CustomerRow[] | null>(null);
  const [q, setQ] = useState("");

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
      !q ||
      r.name.toLowerCase().includes(q.toLowerCase()) ||
      r.email.toLowerCase().includes(q.toLowerCase())
  );

  if (!rows) return <p className="py-16 text-center text-sm text-muted-foreground">Loading…</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-3xl font-medium">Customers</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Privacy first: passwords are never displayed or accessible, and records are never deleted
          (orders must remain accurate).
        </p>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or email…" className="pl-9" />
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

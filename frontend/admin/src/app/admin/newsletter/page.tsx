"use client";

import { useEffect, useState } from "react";
import { Download, BellRing, Send, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateTime } from "@/lib/utils";

interface Subscriber {
  id: string;
  email: string;
  source: string;
  subscribed: boolean;
  subscribedAt: string;
}

interface RestockAlert {
  id: string;
  email: string;
  product: { name: string; slug: string } | null;
  notifiedAt: string | null;
  requestedAt: string;
}

export default function AdminNewsletterPage() {
  const [subs, setSubs] = useState<Subscriber[] | null>(null);
  const [alerts, setAlerts] = useState<RestockAlert[]>([]);

  const load = () => {
    fetch("/api/admin/newsletter")
      .then((r) => r.json())
      .then((j) => setSubs(j.ok ? j.data : []))
      .catch(() => setSubs([]));
    fetch("/api/admin/restock-alerts")
      .then((r) => r.json())
      .then((j) => setAlerts(j.ok ? j.data : []))
      .catch(() => setAlerts([]));
  };

  useEffect(() => {
    load();
  }, []);

  async function markNotified(id: string) {
    const res = await fetch(`/api/admin/restock-alerts/${id}/notified`, { method: "POST" });
    if (res.ok) {
      load();
    } else {
      const json = await res.json().catch(() => null);
      alert(json?.error?.message ?? "Update failed");
    }
  }

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl font-medium">Newsletter</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Everyone subscribed through the storefront footer form.
          </p>
        </div>
        <Button asChild variant="outline" className="rounded-full">
          <a href="/api/admin/newsletter/export">
            <Download className="h-4 w-4" /> Export CSV
          </a>
        </Button>
      </div>

      {subs === null ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : subs.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-10 text-center">
          <Send className="mx-auto h-8 w-8 text-muted-foreground/50" />
          <p className="mt-3 text-sm text-muted-foreground">No subscribers yet.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Subscribed</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {subs.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="text-sm font-medium">{s.email}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{s.source}</TableCell>
                  <TableCell className="text-sm">
                    {s.subscribed ? (
                      <span className="text-primary">Active</span>
                    ) : (
                      <span className="text-muted-foreground">Unsubscribed</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatDateTime(s.subscribedAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <div>
        <h2 className="font-serif text-2xl font-medium">Back-in-Stock Alerts</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Customers waiting for sold-out pieces to return. Mark rows once you've emailed them.
        </p>
        {alerts.length === 0 ? (
          <div className="mt-4 rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            No restock alerts requested.
          </div>
        ) : (
          <div className="mt-4 overflow-hidden rounded-lg border border-border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Requested</TableHead>
                  <TableHead className="text-right">Notified</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {alerts.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="text-sm font-medium">{a.email}</TableCell>
                    <TableCell className="text-sm">{a.product?.name ?? "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDateTime(a.requestedAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      {a.notifiedAt ? (
                        <span className="inline-flex items-center gap-1 text-xs text-primary">
                          <Check className="h-3.5 w-3.5" /> {formatDateTime(a.notifiedAt)}
                        </span>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => markNotified(a.id)}
                          className="rounded-full text-xs"
                        >
                          <BellRing className="h-3.5 w-3.5" /> Mark notified
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}

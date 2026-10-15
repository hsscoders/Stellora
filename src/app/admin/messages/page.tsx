"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateTime } from "@/lib/utils";

interface Message {
  id: string;
  name: string;
  email: string;
  subject: string;
  message: string;
  status: string;
  createdAt: string;
}

export default function AdminMessagesPage() {
  const [rows, setRows] = useState<Message[] | null>(null);

  const load = () =>
    fetch("/api/admin/messages-list")
      .then((r) => r.json())
      .then((j) => setRows(j.ok ? j.data : []));

  useEffect(() => {
    load();
  }, []);

  async function markHandled(id: string) {
    const res = await fetch(`/api/admin/messages/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "HANDLED" }),
    });
    if (res.ok) {
      toast.success("Marked as handled");
      load();
    }
  }

  if (!rows) return <p className="py-16 text-center text-sm text-muted-foreground">Loading…</p>;

  return (
    <div className="space-y-6">
      <h1 className="font-serif text-3xl font-medium">Customer Messages</h1>
      <div className="rounded-lg border border-border/70 bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>From</TableHead>
              <TableHead>Subject</TableHead>
              <TableHead>Received</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((m) => (
              <TableRow key={m.id}>
                <TableCell>
                  <p className="font-medium">{m.name}</p>
                  <p className="text-xs text-muted-foreground">{m.email}</p>
                </TableCell>
                <TableCell className="max-w-md text-sm">
                  <p className="font-medium">{m.subject}</p>
                  <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{m.message}</p>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {formatDateTime(m.createdAt)}
                </TableCell>
                <TableCell>
                  <Badge
                    variant="secondary"
                    className={
                      m.status === "NEW"
                        ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
                        : ""
                    }
                  >
                    {m.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  {m.status === "NEW" && (
                    <Button variant="outline" size="sm" onClick={() => markHandled(m.id)}>
                      <Check className="h-3.5 w-3.5" /> Mark handled
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                  No messages yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

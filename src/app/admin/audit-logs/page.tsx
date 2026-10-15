import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const dynamic = "force-dynamic";

export default async function AuditLogsPage() {
  const logs = await db.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-3xl font-medium">Audit Logs</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Sensitive administrative actions, sign-ins and account changes — append-only.
        </p>
      </div>

      <div className="rounded-lg border border-border/70 bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>When</TableHead>
              <TableHead>Actor</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Entity</TableHead>
              <TableHead>Details</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logs.map((l) => (
              <TableRow key={l.id}>
                <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                  {formatDateTime(l.createdAt)}
                </TableCell>
                <TableCell className="text-sm">{l.actorEmail ?? "—"}</TableCell>
                <TableCell>
                  <span className="rounded bg-accent px-2 py-0.5 font-mono text-xs text-accent-foreground">
                    {l.action}
                  </span>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {l.entityType}
                  {l.entityId ? ` · ${l.entityId.slice(0, 10)}…` : ""}
                </TableCell>
                <TableCell className="max-w-72 truncate text-xs text-muted-foreground">
                  {l.metadata ? JSON.stringify(l.metadata) : "—"}
                </TableCell>
              </TableRow>
            ))}
            {logs.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                  No audit entries yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

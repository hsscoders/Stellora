import { db, newId } from "../lib/db";

interface AuditInput {
  actor?: {
    id: string;
    /* Mobile-first shop: accounts may have no email (phone-only users). */
    email: string | null;
    name: string;
    role: string;
    phone: string | null;
  } | null;
  action: string;
  entityType: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
}

export function getIp(req: { headers: Record<string, unknown> }): string {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd.length > 0) return fwd.split(",")[0].trim();
  const real = req.headers["x-real-ip"];
  return (typeof real === "string" && real) || "unknown";
}

/** Persist an audit-log entry for sensitive actions. Never throws to caller. */
export async function audit(
  input: AuditInput,
  req?: { headers: Record<string, unknown> }
): Promise<void> {
  try {
    const { actor, action, entityType, entityId, metadata } = input;
    await db.auditLog.create({
      data: {
        id: newId(),
        actorId: actor?.id ?? null,
        actorEmail: actor?.email ?? null,
        action,
        entityType,
        entityId: entityId ?? null,
        metadata: (metadata ?? null) as never,
        ip: req ? getIp(req) : null,
      },
    });
  } catch (err) {
    console.error("[audit] failed to write audit entry", err);
  }
}

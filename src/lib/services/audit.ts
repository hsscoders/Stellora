import { db } from "@/lib/db";
import { HttpError } from "@/lib/http";
import { getIp } from "@/lib/request-info";
import type { SessionUser } from "@/lib/auth/session";

interface AuditInput {
  actor?: SessionUser | null;
  action: string;
  entityType: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
}

/** Persist an audit-log entry for sensitive actions. Never throws to caller. */
export async function audit(input: AuditInput, req?: Request) {
  try {
    const { actor, action, entityType, entityId, metadata } = input;
    await db.auditLog.create({
      data: {
        actorId: actor?.id,
        actorEmail: actor?.email,
        action,
        entityType,
        entityId,
        metadata: (metadata ?? undefined) as never,
        ip: req ? getIp(req) : undefined,
      },
    });
  } catch (err) {
    console.error("[audit] failed to write audit entry", err);
  }
}

export function assertFound<T>(value: T | null, what: string): T {
  if (!value) throw new HttpError("NOT_FOUND", `${what} not found.`, 404);
  return value;
}

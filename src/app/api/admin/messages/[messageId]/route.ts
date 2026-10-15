import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { handle, ok, assertSameOrigin, requireAdmin } from "@/lib/http";
import { audit } from "@/lib/services/audit";

type Params = { params: Promise<{ messageId: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  return handle(async () => {
    assertSameOrigin(req);
    const admin = await requireAdmin();
    const { messageId } = await params;
    const body = await req.json();
    const status = body?.status === "HANDLED" ? "HANDLED" : "NEW";
    await db.contactMessage.update({ where: { id: messageId }, data: { status } });
    await audit(
      { actor: admin, action: "admin.message.status", entityType: "ContactMessage", entityId: messageId, metadata: { status } },
      req
    );
    return ok({ id: messageId, status });
  });
}

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { handle, ok, fail, assertSameOrigin, requireUser } from "@/lib/http";
import { profileUpdateSchema } from "@/lib/validation/auth";
import { audit } from "@/lib/services/audit";

export async function PUT(req: NextRequest) {
  return handle(async () => {
    assertSameOrigin(req);
    const user = await requireUser();
    const data = profileUpdateSchema.parse(await req.json());
    const updated = await db.user.update({
      where: { id: user.id },
      data: { name: data.name, phone: data.phone || null },
    });
    await audit({ actor: user, action: "account.profile_update", entityType: "User", entityId: user.id }, req);
    return ok({ id: updated.id, name: updated.name, phone: updated.phone, email: updated.email });
  });
}

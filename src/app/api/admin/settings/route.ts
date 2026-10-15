import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { handle, ok, fail, assertSameOrigin, requireAdmin } from "@/lib/http";
import { settingsSchema } from "@/lib/validation/schemas";
import { audit } from "@/lib/services/audit";

export async function GET() {
  return handle(async () => {
    await requireAdmin();
    const rows = await db.siteSetting.findMany({ orderBy: { key: "asc" } });
    return ok(rows);
  });
}

export async function PUT(req: NextRequest) {
  return handle(async () => {
    assertSameOrigin(req);
    const admin = await requireAdmin();
    const data = settingsSchema.parse(await req.json());

    await db.$transaction(
      Object.entries(data).map(([key, value]) =>
        db.siteSetting.upsert({ where: { key }, update: { value }, create: { key, value } })
      )
    );

    await audit(
      {
        actor: admin,
        action: "admin.settings.update",
        entityType: "SiteSetting",
        metadata: { keys: Object.keys(data) },
      },
      req
    );
    return ok({ updated: Object.keys(data).length });
  });
}

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { handle, ok, fail, assertSameOrigin, requireAdmin } from "@/lib/http";
import { bannerSchema } from "@/lib/validation/schemas";
import { audit } from "@/lib/services/audit";

type Params = { params: Promise<{ bannerId: string }> };

export async function PUT(req: NextRequest, { params }: Params) {
  return handle(async () => {
    assertSameOrigin(req);
    const admin = await requireAdmin();
    const { bannerId } = await params;
    const data = bannerSchema.parse(await req.json());
    const banner = await db.homepageBanner.update({
      where: { id: bannerId },
      data: {
        title: data.title,
        subtitle: data.subtitle || null,
        imageUrl: data.imageUrl,
        ctaLabel: data.ctaLabel || null,
        ctaHref: data.ctaHref || null,
        sortOrder: data.sortOrder,
        isActive: data.isActive,
      },
    });
    await audit(
      { actor: admin, action: "admin.banner.update", entityType: "HomepageBanner", entityId: bannerId },
      req
    );
    return ok(banner);
  });
}

export async function DELETE(req: NextRequest, { params }: Params) {
  return handle(async () => {
    assertSameOrigin(req);
    const admin = await requireAdmin();
    const { bannerId } = await params;
    await db.homepageBanner.delete({ where: { id: bannerId } });
    await audit(
      { actor: admin, action: "admin.banner.delete", entityType: "HomepageBanner", entityId: bannerId },
      req
    );
    return ok({ deleted: true });
  });
}

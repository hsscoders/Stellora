import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { handle, ok, fail, assertSameOrigin, requireAdmin } from "@/lib/http";
import { bannerSchema } from "@/lib/validation/schemas";
import { audit } from "@/lib/services/audit";

export async function GET() {
  return handle(async () => {
    await requireAdmin();
    const banners = await db.homepageBanner.findMany({ orderBy: { sortOrder: "asc" } });
    return ok(banners);
  });
}

export async function POST(req: NextRequest) {
  return handle(async () => {
    assertSameOrigin(req);
    const admin = await requireAdmin();
    const data = bannerSchema.parse(await req.json());
    const banner = await db.homepageBanner.create({
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
      { actor: admin, action: "admin.banner.create", entityType: "HomepageBanner", entityId: banner.id, metadata: { title: banner.title } },
      req
    );
    return ok(banner, 201);
  });
}

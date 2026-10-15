import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { handle, ok, fail, assertSameOrigin, requireAdmin } from "@/lib/http";
import { categorySchema } from "@/lib/validation/schemas";
import { slugify } from "@/lib/utils";
import { audit } from "@/lib/services/audit";

export async function GET() {
  return handle(async () => {
    await requireAdmin();
    const categories = await db.category.findMany({
      orderBy: { sortOrder: "asc" },
      include: { _count: { select: { products: true } } },
    });
    return ok(categories);
  });
}

export async function POST(req: NextRequest) {
  return handle(async () => {
    assertSameOrigin(req);
    const admin = await requireAdmin();
    const data = categorySchema.parse(await req.json());
    const slug = data.slug && data.slug.length > 0 ? data.slug : slugify(data.name);
    const clash = await db.category.findUnique({ where: { slug } });
    if (clash) return fail("SLUG_TAKEN", "A category with this slug already exists.", 409, { slug: "Already in use" });

    const category = await db.category.create({
      data: {
        name: data.name,
        slug,
        description: data.description || null,
        imageUrl: data.imageUrl || null,
        sortOrder: data.sortOrder,
        isActive: data.isActive,
      },
    });
    await audit(
      { actor: admin, action: "admin.category.create", entityType: "Category", entityId: category.id, metadata: { name: category.name } },
      req
    );
    return ok(category, 201);
  });
}

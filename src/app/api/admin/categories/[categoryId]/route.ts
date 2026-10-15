import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { handle, ok, fail, assertSameOrigin, requireAdmin } from "@/lib/http";
import { categorySchema } from "@/lib/validation/schemas";
import { audit } from "@/lib/services/audit";

type Params = { params: Promise<{ categoryId: string }> };

export async function PUT(req: NextRequest, { params }: Params) {
  return handle(async () => {
    assertSameOrigin(req);
    const admin = await requireAdmin();
    const { categoryId } = await params;
    const data = categorySchema.parse(await req.json());

    const existing = await db.category.findUnique({ where: { id: categoryId } });
    if (!existing) return fail("NOT_FOUND", "Category not found.", 404);

    const slug = data.slug && data.slug.length > 0 ? data.slug : undefined;
    if (slug && slug !== existing.slug) {
      const clash = await db.category.findUnique({ where: { slug } });
      if (clash) return fail("SLUG_TAKEN", "Slug already in use.", 409, { slug: "Already in use" });
    }

    const category = await db.category.update({
      where: { id: categoryId },
      data: {
        name: data.name,
        ...(slug ? { slug } : {}),
        description: data.description || null,
        imageUrl: data.imageUrl || null,
        sortOrder: data.sortOrder,
        isActive: data.isActive,
      },
    });
    await audit(
      { actor: admin, action: "admin.category.update", entityType: "Category", entityId: categoryId, metadata: { name: category.name } },
      req
    );
    return ok(category);
  });
}

export async function DELETE(req: NextRequest, { params }: Params) {
  return handle(async () => {
    assertSameOrigin(req);
    const admin = await requireAdmin();
    const { categoryId } = await params;
    const count = await db.product.count({ where: { categoryId } });
    if (count > 0) {
      return fail(
        "CATEGORY_IN_USE",
        `This category has ${count} product(s). Move them to another category first.`,
        422
      );
    }
    await db.category.delete({ where: { id: categoryId } });
    await audit(
      { actor: admin, action: "admin.category.delete", entityType: "Category", entityId: categoryId },
      req
    );
    return ok({ deleted: true });
  });
}

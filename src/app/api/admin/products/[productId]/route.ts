import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { handle, ok, fail, assertSameOrigin, requireAdmin } from "@/lib/http";
import { productSchema } from "@/lib/validation/schemas";
import { audit } from "@/lib/services/audit";

type Params = { params: Promise<{ productId: string }> };

export async function PUT(req: NextRequest, { params }: Params) {
  return handle(async () => {
    assertSameOrigin(req);
    const admin = await requireAdmin();
    const { productId } = await params;
    const data = productSchema.parse(await req.json());

    const existing = await db.product.findUnique({ where: { id: productId } });
    if (!existing) return fail("NOT_FOUND", "Product not found.", 404);

    const slug =
      data.slug && data.slug.length > 0 ? data.slug : undefined;
    if (slug && slug !== existing.slug) {
      const clash = await db.product.findUnique({ where: { slug } });
      if (clash) return fail("SLUG_TAKEN", "A product with this slug already exists.", 409, { slug: "Already in use" });
    }

    await db.$transaction(async (tx) => {
      await tx.productImage.deleteMany({ where: { productId } });
      await tx.product.update({
        where: { id: productId },
        data: {
          ...(slug ? { slug } : {}),
          categoryId: data.categoryId,
          name: data.name,
          shortDescription: data.shortDescription,
          description: data.description || null,
          materials: data.materials || null,
          careInstructions: data.careInstructions || null,
          status: data.status,
          isFeatured: data.isFeatured,
          isNewArrival: data.isNewArrival,
          isBestSeller: data.isBestSeller,
          images: {
            create: data.images.map((img, i) => ({
              url: img.url,
              alt: img.alt ?? null,
              sortOrder: i,
            })),
          },
        },
      });

      // Variants: upsert by id, create new, delete removed
      const keepIds: string[] = [];
      for (const v of data.variants) {
        if (v.id) {
          const existingVar = await tx.productVariant.findFirst({
            where: { id: v.id, productId },
          });
          if (existingVar) {
            await tx.productVariant.update({
              where: { id: v.id },
              data: {
                name: v.name,
                sku: v.sku,
                price: v.price,
                compareAtPrice: v.compareAtPrice ?? null,
                lowStockThreshold: v.lowStockThreshold,
                isActive: v.isActive,
              },
            });
            keepIds.push(v.id);
          }
        } else {
          const created = await tx.productVariant.create({
            data: {
              productId,
              name: v.name,
              sku: v.sku,
              price: v.price,
              compareAtPrice: v.compareAtPrice ?? null,
              stock: v.stock,
              lowStockThreshold: v.lowStockThreshold,
              isActive: v.isActive,
            },
          });
          if (created.stock > 0) {
            await tx.stockMovement.create({
              data: {
                variantId: created.id,
                delta: created.stock,
                reason: "INITIAL",
                note: "Stock at variant creation",
                createdById: admin.id,
              },
            });
          }
          keepIds.push(created.id);
        }
      }
      // Delete variants no longer present (only those without order history)
      const existingVariants = await tx.productVariant.findMany({ where: { productId } });
      for (const ev of existingVariants) {
        if (!keepIds.includes(ev.id)) {
          const used = await tx.orderItem.count({ where: { variantId: ev.id } });
          if (used > 0) {
            await tx.productVariant.update({ where: { id: ev.id }, data: { isActive: false } });
          } else {
            await tx.productVariant.delete({ where: { id: ev.id } });
          }
        }
      }
    });

    await audit(
      {
        actor: admin,
        action: "admin.product.update",
        entityType: "Product",
        entityId: productId,
        metadata: { name: data.name },
      },
      req
    );
    const updated = await db.product.findUnique({
      where: { id: productId },
      include: { variants: true, images: true },
    });
    return ok(updated);
  });
}

export async function DELETE(req: NextRequest, { params }: Params) {
  return handle(async () => {
    assertSameOrigin(req);
    const admin = await requireAdmin();
    const { productId } = await params;

    const used = await db.orderItem.count({ where: { productId } });
    if (used > 0) {
      // Safeguard: products with order history are archived, never deleted
      await db.product.update({ where: { id: productId }, data: { status: "ARCHIVED" } });
      await audit(
        {
          actor: admin,
          action: "admin.product.archive",
          entityType: "Product",
          entityId: productId,
          metadata: { reason: "has order history" },
        },
        req
      );
      return ok({ archived: true, message: "Product has order history — archived instead of deleted." });
    }

    await db.product.delete({ where: { id: productId } });
    await audit(
      { actor: admin, action: "admin.product.delete", entityType: "Product", entityId: productId },
      req
    );
    return ok({ deleted: true });
  });
}

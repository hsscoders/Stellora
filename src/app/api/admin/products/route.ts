import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { handle, ok, assertSameOrigin, requireAdmin } from "@/lib/http";
import { productSchema } from "@/lib/validation/schemas";
import { slugify } from "@/lib/utils";
import { audit } from "@/lib/services/audit";
import { Prisma } from "@prisma/client";

export async function GET(req: NextRequest) {
  return handle(async () => {
    await requireAdmin();
    const sp = req.nextUrl.searchParams;
    const q = sp.get("q")?.trim() ?? "";
    const where: Prisma.ProductWhereInput = q
      ? { OR: [{ name: { contains: q } }, { slug: { contains: q } }] }
      : {};
    const products = await db.product.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        category: true,
        images: { orderBy: { sortOrder: "asc" } },
        variants: { orderBy: { price: "asc" } },
      },
    });
    return ok(products);
  });
}

export async function POST(req: NextRequest) {
  return handle(async () => {
    assertSameOrigin(req);
    const admin = await requireAdmin();
    const data = productSchema.parse(await req.json());

    const slug = data.slug && data.slug.length > 0 ? data.slug : slugify(data.name);
    const clash = await db.product.findUnique({ where: { slug } });
    if (clash) {
      return ok(
        { error: "A product with this slug already exists." },
        200
      );
    }

    const product = await db.product.create({
      data: {
        slug,
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
        variants: {
          create: data.variants.map((v) => ({
            name: v.name,
            sku: v.sku,
            price: v.price,
            compareAtPrice: v.compareAtPrice ?? null,
            stock: v.stock,
            lowStockThreshold: v.lowStockThreshold,
            isActive: v.isActive,
          })),
        },
      },
      include: { variants: true },
    });

    // Record initial stock movements
    for (const v of product.variants) {
      if (v.stock > 0) {
        await db.stockMovement.create({
          data: {
            variantId: v.id,
            delta: v.stock,
            reason: "INITIAL",
            note: "Initial stock at product creation",
            createdById: admin.id,
          },
        });
      }
    }

    await audit(
      {
        actor: admin,
        action: "admin.product.create",
        entityType: "Product",
        entityId: product.id,
        metadata: { name: product.name, slug: product.slug },
      },
      req
    );
    return ok(product, 201);
  });
}

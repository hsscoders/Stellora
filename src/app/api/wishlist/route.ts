import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { handle, ok, fail, assertSameOrigin } from "@/lib/http";
import { requireUser } from "@/lib/http";

export async function GET() {
  return handle(async () => {
    const user = await requireUser();
    const items = await db.wishlistItem.findMany({
      where: { userId: user.id },
      include: {
        product: {
          include: {
            category: true,
            images: { orderBy: { sortOrder: "asc" } },
            variants: { where: { isActive: true }, orderBy: { price: "asc" } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
    return ok(items.filter((i) => i.product.status === "ACTIVE"));
  });
}

export async function POST(req: NextRequest) {
  return handle(async () => {
    assertSameOrigin(req);
    const user = await requireUser();
    const body = await req.json();
    const productId = String(body?.productId ?? "");
    if (!productId) return fail("VALIDATION_ERROR", "Product is required.", 422);

    const product = await db.product.findFirst({
      where: { id: productId, status: "ACTIVE" },
    });
    if (!product) return fail("NOT_FOUND", "Product not found.", 404);

    const existing = await db.wishlistItem.findUnique({
      where: { userId_productId: { userId: user.id, productId } },
    });
    if (existing) {
      await db.wishlistItem.delete({ where: { id: existing.id } });
      return ok({ inWishlist: false });
    }
    await db.wishlistItem.create({ data: { userId: user.id, productId } });
    return ok({ inWishlist: true }, 201);
  });
}

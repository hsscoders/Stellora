import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { handle, ok, fail, assertSameOrigin } from "@/lib/http";
import { getCurrentUser, getOrCreateCartKey, readCartKey } from "@/lib/auth/session";
import { resolveCart, getCartView } from "@/lib/services/cart";
import { addToCartSchema } from "@/lib/validation/schemas";

export async function GET() {
  return handle(async () => {
    const user = await getCurrentUser();
    const sessionKey = user ? null : await readCartKey();
    if (!user && !sessionKey) {
      return ok({ items: [], itemCount: 0, subtotal: 0 });
    }
    const cart = await resolveCart(user?.id ?? null, sessionKey);
    const view = await getCartView(cart.id);
    return ok(view);
  });
}

export async function POST(req: NextRequest) {
  return handle(async () => {
    assertSameOrigin(req);
    const user = await getCurrentUser();
    const sessionKey = user ? null : await getOrCreateCartKey();
    const cart = await resolveCart(user?.id ?? null, sessionKey);

    const data = addToCartSchema.parse(await req.json());
    const variant = await db.productVariant.findFirst({
      where: { id: data.variantId, isActive: true, product: { status: "ACTIVE" } },
      include: { product: true },
    });
    if (!variant) {
      return fail("NOT_FOUND", "This product is no longer available.", 404);
    }
    if (variant.stock < 1) {
      return fail("OUT_OF_STOCK", "This item is currently out of stock.", 422);
    }

    const existing = await db.cartItem.findUnique({
      where: { cartId_variantId: { cartId: cart.id, variantId: variant.id } },
    });
    const newQty = Math.min((existing?.quantity ?? 0) + data.quantity, Math.min(variant.stock, 10));
    if (existing) {
      await db.cartItem.update({ where: { id: existing.id }, data: { quantity: newQty } });
    } else {
      await db.cartItem.create({
        data: { cartId: cart.id, variantId: variant.id, quantity: newQty },
      });
    }
    const view = await getCartView(cart.id);
    return ok(view, 201);
  });
}

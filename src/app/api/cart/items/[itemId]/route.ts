import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { handle, ok, fail, assertSameOrigin, HttpError } from "@/lib/http";
import { getCurrentUser, readCartKey } from "@/lib/auth/session";
import { resolveCart, getCartView } from "@/lib/services/cart";
import { updateCartItemSchema } from "@/lib/validation/schemas";

async function currentCart() {
  const user = await getCurrentUser();
  const sessionKey = user ? null : await readCartKey();
  if (!user && !sessionKey) throw new HttpError("UNAUTHENTICATED", "Cart not found.", 404);
  return resolveCart(user?.id ?? null, sessionKey);
}

type Params = { params: Promise<{ itemId: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  return handle(async () => {
    assertSameOrigin(req);
    const { itemId } = await params;
    const cart = await currentCart();
    const data = updateCartItemSchema.parse(await req.json());

    const item = await db.cartItem.findFirst({
      where: { id: itemId, cartId: cart.id },
      include: { variant: true },
    });
    if (!item) return fail("NOT_FOUND", "Cart item not found.", 404);

    if (data.quantity === 0) {
      await db.cartItem.delete({ where: { id: item.id } });
    } else {
      if (data.quantity > item.variant.stock) {
        return fail(
          "OUT_OF_STOCK",
          `Only ${item.variant.stock} available for this item.`,
          422
        );
      }
      await db.cartItem.update({ where: { id: item.id }, data: { quantity: data.quantity } });
    }
    return ok(await getCartView(cart.id));
  });
}

export async function DELETE(req: NextRequest, { params }: Params) {
  return handle(async () => {
    assertSameOrigin(req);
    const { itemId } = await params;
    const cart = await currentCart();
    const deleted = await db.cartItem.deleteMany({ where: { id: itemId, cartId: cart.id } });
    if (deleted.count === 0) return fail("NOT_FOUND", "Cart item not found.", 404);
    return ok(await getCartView(cart.id));
  });
}

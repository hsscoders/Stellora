import { NextRequest } from "next/server";
import { handle, ok, fail, assertSameOrigin, requireUser } from "@/lib/http";
import { validateCoupon } from "@/lib/services/pricing";
import { getCartView, resolveCart } from "@/lib/services/cart";
import { readCartKey, getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db";

export async function POST(req: NextRequest) {
  return handle(async () => {
    assertSameOrigin(req);
    const body = await req.json();
    const code = String(body?.code ?? "");
    if (!code) return fail("VALIDATION_ERROR", "Enter a coupon code.", 422);

    const user = await getCurrentUser();
    const sessionKey = user ? null : await readCartKey();
    if (!user && !sessionKey) return fail("EMPTY_CART", "Your cart is empty.", 422);
    const cart = await resolveCart(user?.id ?? null, sessionKey);
    const view = await getCartView(cart.id);
    if (view.items.length === 0) return fail("EMPTY_CART", "Your cart is empty.", 422);

    try {
      const result = await validateCoupon(code, view.subtotal, user?.id ?? null);
      const payable = Math.max(view.subtotal - result.discount, 0);
      return ok({
        valid: true,
        code: result.coupon.code,
        discount: result.discount,
        payableSubtotal: payable,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "This coupon cannot be applied.";
      return ok({ valid: false, message });
    }
  });
}

import { NextRequest } from "next/server";
import { handle, ok, fail, assertSameOrigin, requireUser } from "@/lib/http";
import { checkoutSchema } from "@/lib/validation/schemas";
import { createOrderFromCart } from "@/lib/services/orders";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  return handle(async () => {
    assertSameOrigin(req);
    const user = await requireUser();
    const rl = rateLimit(`checkout:${user.id}`, 12, 10 * 60 * 1000);
    if (!rl.allowed) {
      return fail("RATE_LIMITED", "Too many attempts. Please wait a moment.", 429);
    }

    const data = checkoutSchema.parse(await req.json());
    const result = await createOrderFromCart({
      userId: user.id,
      addressId: data.addressId,
      couponCode: data.couponCode || undefined,
      idempotencyKey: data.idempotencyKey,
    });

    return ok(result, result.replayed ? 200 : 201);
  });
}

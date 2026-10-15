import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { handle, ok, fail, assertSameOrigin } from "@/lib/http";
import { trackOrderSchema } from "@/lib/validation/schemas";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

/** Truthful, server-backed order tracking. Requires matching order number + email. */
export async function POST(req: NextRequest) {
  return handle(async () => {
    assertSameOrigin(req);
    const ip = getClientIp(req);
    const rl = rateLimit(`track:${ip}`, 20, 10 * 60 * 1000);
    if (!rl.allowed) return fail("RATE_LIMITED", "Too many attempts. Please wait.", 429);

    const data = trackOrderSchema.parse(await req.json());
    const order = await db.order.findFirst({
      where: { orderNumber: data.orderNumber.trim().toUpperCase() },
      include: {
        user: { select: { email: true } },
        events: { orderBy: { createdAt: "asc" } },
        shipment: true,
      },
    });
    if (!order || order.user.email !== data.email) {
      return fail(
        "NOT_FOUND",
        "We could not find an order with that order number and email combination.",
        404
      );
    }
    return ok({
      orderNumber: order.orderNumber,
      status: order.status,
      paymentStatus: order.paymentStatus,
      placedAt: order.createdAt,
      shippedAt: order.shipment?.shippedAt ?? null,
      carrier: order.shipment?.carrier ?? null,
      trackingNumber: order.shipment?.trackingNumber ?? null,
      events: order.events.map((e) => ({ status: e.status, note: e.note, at: e.createdAt })),
    });
  });
}

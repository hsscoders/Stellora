import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { apiMe, apiMyOrder } from "@/lib/server-api";
import { formatINR, formatDateTime } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { OrderActions } from "@/components/stellora/order-actions";

export const dynamic = "force-dynamic";

const FLOW = ["PENDING", "CONFIRMED", "PROCESSING", "SHIPPED", "DELIVERED"];

export async function generateMetadata({ params }: { params: Promise<{ orderNumber: string }> }) {
  const { orderNumber } = await params;
  return { title: `Order ${orderNumber}` };
}

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ orderNumber: string }>;
}) {
  const { orderNumber } = await params;
  const { user } = await apiMe();
  if (!user) redirect(`/login?next=/account/orders/${orderNumber}`);

  let order: Awaited<ReturnType<typeof apiMyOrder>> | null = null;
  try {
    order = await apiMyOrder(orderNumber);
  } catch {
    order = null;
  }
  if (!order) notFound();

  const cancelled = order.status === "CANCELLED";

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl font-medium">{order.orderNumber}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Placed {formatDateTime(order.createdAt)}
          </p>
        </div>
        <Badge className="px-3 py-1.5 text-sm">{order.status.replace("_", " ")}</Badge>
      </div>

      {/* Timeline */}
      <section className="rounded-lg border border-border/70 bg-card p-6">
        <h2 className="font-serif text-xl font-medium">Status Timeline</h2>
        {cancelled ? (
          <p className="mt-4 rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
            This order was cancelled{order.cancelledReason ? `: ${order.cancelledReason}` : "."} Any
            reserved stock has been released.
          </p>
        ) : (
          <ol className="mt-5">
            {FLOW.map((stage, i) => {
              const event = order.events.find((e) => e.status === stage);
              const done = !!event || FLOW.indexOf(order.status) >= i;
              return (
                <li key={stage} className="relative flex gap-4 pb-6 last:pb-0">
                  {i < FLOW.length - 1 && (
                    <span
                      className={`absolute left-[7px] top-4 h-full w-px ${done ? "bg-primary" : "bg-border"}`}
                    />
                  )}
                  <span
                    className={`relative mt-1 flex h-4 w-4 shrink-0 rounded-full border-2 ${
                      done ? "border-primary bg-primary" : "border-border bg-background"
                    }`}
                  />
                  <div>
                    <p className={`text-sm font-medium ${done ? "" : "text-muted-foreground"}`}>
                      {stage === "PENDING"
                        ? "Order Placed"
                        : stage.charAt(0) + stage.slice(1).toLowerCase()}
                    </p>
                    {event && (
                      <p className="text-xs text-muted-foreground">
                        {formatDateTime(event.createdAt)}
                        {event.note ? ` — ${event.note}` : ""}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
        {order.shipment?.trackingNumber && (
          <p className="mt-4 rounded-md bg-accent/50 px-4 py-3 text-sm text-accent-foreground">
            Carrier: {order.shipment.carrier ?? "—"} · Tracking: {order.shipment.trackingNumber}
          </p>
        )}
      </section>

      {/* Items */}
      <section className="rounded-lg border border-border/70 bg-card p-6">
        <h2 className="font-serif text-xl font-medium">Items</h2>
        <ul className="mt-4 divide-y divide-border">
          {order.items.map((item) => (
            <li key={item.id} className="flex items-center gap-4 py-4">
              <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-md border border-border/60">
                <Image
                  src={item.imageUrl ?? "/images/placeholder.svg"}
                  alt=""
                  fill
                  sizes="64px"
                  className="object-cover"
                />
              </div>
              <div className="min-w-0 flex-1 text-sm">
                <p className="font-medium">{item.productName}</p>
                <p className="text-xs text-muted-foreground">
                  {item.variantName} · Qty {item.quantity} · {formatINR(item.unitPrice)} each
                </p>
              </div>
              <p className="text-sm font-medium tnum">{formatINR(item.lineTotal)}</p>
            </li>
          ))}
        </ul>
        <Separator className="my-4" />
        <div className="ml-auto max-w-xs space-y-2 text-sm tnum">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Subtotal</span>
            <span>{formatINR(order.subtotal)}</span>
          </div>
          {Number(order.discountTotal) > 0 && (
            <div className="flex justify-between text-primary">
              <span>Discount {order.couponCode ? `(${order.couponCode})` : ""}</span>
              <span>−{formatINR(order.discountTotal)}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-muted-foreground">Shipping</span>
            <span>{Number(order.shippingFee) === 0 ? "Free" : formatINR(order.shippingFee)}</span>
          </div>
          <div className="flex justify-between text-base font-semibold">
            <span>Total</span>
            <span>{formatINR(order.grandTotal)}</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Payment: {order.paymentMethod === "PAY_ON_CONFIRMATION" ? "Pay on confirmation" : order.paymentMethod} ·{" "}
            {order.paymentStatus}
          </p>
        </div>
      </section>

      {/* Address */}
      <section className="rounded-lg border border-border/70 bg-card p-6 text-sm">
        <h2 className="font-serif text-xl font-medium">Delivery Address</h2>
        <p className="mt-3 text-muted-foreground">
          {order.shipName}
          <br />
          {order.shipLine1}
          {order.shipLine2 ? `, ${order.shipLine2}` : ""}
          <br />
          {order.shipCity}, {order.shipState} — {order.shipPincode}
          <br />
          {order.shipCountry} · {order.shipPhone}
        </p>
      </section>

      <OrderActions
        orderNumber={order.orderNumber}
        status={order.status}
        items={order.items.map((i) => ({
          id: i.id,
          productName: i.productName,
          variantName: i.variantName,
          quantity: i.quantity,
        }))}
      />

      <div className="flex gap-3">
        <Button asChild variant="outline" className="rounded-full">
          <Link href="/account/orders">← All orders</Link>
        </Button>
        <Button asChild variant="ghost" className="rounded-full">
          <Link href="/support">Need help with this order?</Link>
        </Button>
      </div>
    </div>
  );
}

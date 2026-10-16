import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { apiMe, apiMyOrder } from "@/lib/server-api";
import { formatINR, formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

export const dynamic = "force-dynamic";
export const metadata = { title: "Order Confirmed" };

export default async function OrderConfirmationPage({
  params,
}: {
  params: Promise<{ orderNumber: string }>;
}) {
  const { orderNumber } = await params;
  const { user } = await apiMe();
  if (!user) redirect(`/login?next=/order-confirmation/${orderNumber}`);

  let order: Awaited<ReturnType<typeof apiMyOrder>> | null = null;
  try {
    order = await apiMyOrder(orderNumber);
  } catch {
    order = null;
  }
  if (!order) notFound();

  return (
    <div className="mx-auto max-w-2xl px-4 py-14 sm:px-6">
      <div className="text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/15">
          <CheckCircle2 className="h-8 w-8 text-primary" />
        </div>
        <h1 className="mt-6 font-serif text-4xl font-medium">Thank You, {user.name.split(" ")[0]}!</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          Your order <span className="font-semibold text-foreground">{order.orderNumber}</span> has
          been placed on {formatDate(order.createdAt)}. We will contact you shortly on{" "}
          {order.shipPhone} to confirm availability and complete payment.
        </p>
      </div>

      <div className="mt-10 rounded-lg border border-border/70 bg-card p-6">
        <h2 className="font-serif text-xl font-medium">Order Summary</h2>
        <ul className="mt-4 divide-y divide-border">
          {order.items.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-4 py-3 text-sm">
              <div>
                <p className="font-medium">{item.productName}</p>
                <p className="text-xs text-muted-foreground">
                  {item.variantName} · Qty {item.quantity}
                </p>
              </div>
              <p className="font-medium tnum">{formatINR(item.lineTotal)}</p>
            </li>
          ))}
        </ul>
        <Separator className="my-4" />
        <div className="space-y-2 text-sm tnum">
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
            <span>Total ({order.paymentMethod === "PAY_ON_CONFIRMATION" ? "Pay on confirmation" : order.paymentMethod})</span>
            <span>{formatINR(order.grandTotal)}</span>
          </div>
        </div>
        <Separator className="my-4" />
        <div className="text-sm">
          <p className="font-medium">Delivering to</p>
          <p className="mt-1 text-muted-foreground">
            {order.shipName}, {order.shipLine1}
            {order.shipLine2 ? `, ${order.shipLine2}` : ""}, {order.shipCity}, {order.shipState} —{" "}
            {order.shipPincode}
          </p>
        </div>
      </div>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
        <Button asChild className="rounded-full bg-primary hover:bg-primary/90">
          <Link href={`/account/orders/${order.orderNumber}`}>View order status</Link>
        </Button>
        <Button asChild variant="outline" className="rounded-full">
          <Link href="/track-order">Track this order</Link>
        </Button>
        <Button asChild variant="ghost" className="rounded-full">
          <Link href="/shop">Continue shopping</Link>
        </Button>
      </div>
    </div>
  );
}

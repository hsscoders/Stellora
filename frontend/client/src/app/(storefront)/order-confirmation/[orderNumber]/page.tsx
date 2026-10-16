import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { apiMe, apiMyOrder } from "@/lib/server-api";
import { formatINR, formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { PayNowButton } from "@/components/stellora/pay-now-button";
import { Confetti } from "@/components/stellora/confetti";

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
      <Confetti burstKey={order.orderNumber} />
      <div className="text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/15">
          <CheckCircle2 className="h-8 w-8 text-primary" />
        </div>
        <h1 className="mt-6 font-serif text-4xl font-medium">Thank You, {user.name.split(" ")[0]}!</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          Your order <span className="font-semibold text-foreground">{order.orderNumber}</span> has
          been placed on {formatDate(order.createdAt)}.{" "}
          {order.paymentStatus === "PAID"
            ? "Payment received — your order is confirmed and is being prepared for dispatch."
            : `We will contact you shortly on ${order.shipPhone} to confirm availability and complete payment.`}
        </p>
      </div>

      {order.paymentStatus === "PENDING" && order.paymentMethod === "GATEWAY" && (
        <div className="mt-8 rounded-lg border border-primary/40 bg-accent/40 p-5 text-center">
          <p className="text-sm font-medium text-accent-foreground">Your payment is still pending</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Complete it now to confirm your order instantly and speed up dispatch.
          </p>
          <div className="mt-4 flex justify-center">
            <PayNowButton orderNumber={order.orderNumber} amount={Number(order.grandTotal)} />
          </div>
        </div>
      )}

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
            <span>
              Total ({
                order.paymentMethod === "GATEWAY"
                  ? order.paymentStatus === "PAID"
                    ? "Paid online"
                    : "Online payment pending"
                  : "Pay on confirmation"
              })
            </span>
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

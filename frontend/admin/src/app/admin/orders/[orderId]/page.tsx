import { notFound } from "next/navigation";
import { apiAdminOrder } from "@/lib/server-api";
import { formatINR, formatDateTime } from "@/lib/utils";
import { OrderActions } from "@/components/stellora/admin-order-actions";
import { PageHeader } from "@/components/stellora/advanced/page-header";
import {
  CopyAddressButton,
  PrintInvoiceButton,
} from "@/components/stellora/advanced/print-invoice-button";

export const dynamic = "force-dynamic";

export default async function AdminOrderDetailPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  let order;
  try {
    order = await apiAdminOrder(orderId);
  } catch {
    order = null;
  }
  if (!order) notFound();

  // Multi-line shipping address for the copy-to-clipboard island.
  const shippingAddress = [
    `${order.shipName} · ${order.shipPhone}`,
    order.shipLine1 + (order.shipLine2 ? `, ${order.shipLine2}` : ""),
    `${order.shipCity}, ${order.shipState} — ${order.shipPincode}`,
    order.shipCountry,
  ].join("\n");

  return (
    <div className="space-y-6">
      <PageHeader
        title={order.orderNumber}
        subtitle={`${formatDateTime(order.createdAt)} · ${order.user?.name ?? "—"} (${order.user?.email ?? ""}${
          order.user?.phone ? ` · ${order.user?.phone}` : ""
        })`}
        actions={
          <>
            <CopyAddressButton address={shippingAddress} />
            <PrintInvoiceButton />
          </>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[1fr_400px]">
        <div className="space-y-6">
          <section className="rounded-lg border border-border/70 bg-card p-6">
            <h2 className="font-serif text-lg font-medium">Items</h2>
            <ul className="mt-3 divide-y divide-border text-sm">
              {order.items.map((i) => (
                <li key={i.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div>
                    <p className="font-medium">{i.productName}</p>
                    <p className="text-xs text-muted-foreground">
                      {i.variantName} · {i.sku} · Qty {i.quantity} · {formatINR(i.unitPrice)} each
                    </p>
                  </div>
                  <p className="font-medium tnum">{formatINR(i.lineTotal)}</p>
                </li>
              ))}
            </ul>
            <div className="mt-4 ml-auto max-w-xs space-y-1.5 text-sm tnum">
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
                <span>{formatINR(order.shippingFee)}</span>
              </div>
              <div className="flex justify-between text-base font-semibold">
                <span>Total</span>
                <span>{formatINR(order.grandTotal)}</span>
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-border/70 bg-card p-6 text-sm">
            <h2 className="font-serif text-lg font-medium">Delivery address</h2>
            <p className="mt-3 text-muted-foreground">
              {order.shipName} · {order.shipPhone}
              <br />
              {order.shipLine1}
              {order.shipLine2 ? `, ${order.shipLine2}` : ""}
              <br />
              {order.shipCity}, {order.shipState} — {order.shipPincode}, {order.shipCountry}
            </p>
          </section>

          <section className="rounded-lg border border-border/70 bg-card p-6">
            <h2 className="font-serif text-lg font-medium">Status history</h2>
            <ul className="mt-3 space-y-2.5 text-sm">
              {order.events.map((e) => (
                <li key={e.id} className="flex items-start justify-between gap-3">
                  <span className="font-medium">{e.status}</span>
                  <span className="text-right text-xs text-muted-foreground">
                    {formatDateTime(e.createdAt)}
                    {e.note ? ` — ${e.note}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <OrderActions
          orderId={order.id}
          status={order.status}
          paymentStatus={order.paymentStatus}
          shipment={
            order.shipment
              ? {
                  carrier: order.shipment.carrier,
                  trackingNumber: order.shipment.trackingNumber,
                  status: order.shipment.status,
                }
              : null
          }
        />
      </div>
    </div>
  );
}

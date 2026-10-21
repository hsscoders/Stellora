/**
 * Commerce types (MySQL/Prisma migration).
 * Runtime data layer is Prisma — see lib/db.ts.
 */

/** Order line shape as returned by the API (money fields are numbers). */
export interface OrderItemDoc {
  id: string;
  productId: string | null;
  variantId: string | null;
  productName: string;
  variantName: string;
  sku: string;
  imageUrl: string | null;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
}

export interface OrderPaymentDoc {
  method: "PAY_ON_CONFIRMATION" | "GATEWAY";
  status: "PENDING" | "PAID" | "FAILED" | "REFUNDED";
  amount: number;
  providerRef: string | null;
  verifiedAt: Date | null;
  createdAt: Date;
}

export interface OrderEventDoc {
  id: string;
  status: "PENDING" | "CONFIRMED" | "PROCESSING" | "SHIPPED" | "DELIVERED" | "CANCELLED";
  note: string | null;
  createdAt: Date;
}

export interface OrderShipmentDoc {
  id: string;
  carrier: string | null;
  trackingNumber: string | null;
  status: "PENDING" | "SHIPPED" | "DELIVERED";
  shippedAt: Date | null;
  deliveredAt: Date | null;
}

export interface OrderPaymentIntentDoc {
  provider: "razorpay" | "stripe" | "demo";
  gatewayOrderId: string;
  createdAt: Date;
}

import { Schema, model, Types } from "mongoose";

/* ---------- Cart (one per user or guest session key, items embedded) ---------- */

const CartItemSchema = new Schema(
  {
    variantId: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    quantity: { type: Number, required: true, min: 1 },
  },
  { _id: true, timestamps: true }
);

const CartSchema = new Schema(
  {
    // NOTE: no `default: null` here — a sparse unique index skips documents
    // where the field is ABSENT, but an explicit null still collides.
    userId: { type: Schema.Types.ObjectId, ref: "User", unique: true, sparse: true },
    sessionKey: { type: String, unique: true, sparse: true },
    items: { type: [CartItemSchema], default: [] },
  },
  { timestamps: true, collection: "carts" }
);

export const Cart = model("Cart", CartSchema);

/* ---------- Coupon (redemptions embedded) ---------- */

const RedemptionSchema = new Schema(
  {
    orderId: { type: Schema.Types.ObjectId, ref: "Order", required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    amount: { type: Number, required: true },
  },
  { _id: true, timestamps: { createdAt: true, updatedAt: false } }
);

const CouponSchema = new Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    description: { type: String, default: null },
    discountType: { type: String, enum: ["PERCENT", "FIXED"], required: true },
    value: { type: Number, required: true, min: 0 },
    minSubtotal: { type: Number, default: null, min: 0 },
    maxDiscount: { type: Number, default: null, min: 0 },
    startsAt: { type: Date, default: null },
    endsAt: { type: Date, default: null },
    usageLimit: { type: Number, default: null },
    perUserLimit: { type: Number, default: null },
    timesUsed: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    redemptions: { type: [RedemptionSchema], default: [] },
  },
  { timestamps: true, collection: "coupons" }
);

export const Coupon = model("Coupon", CouponSchema);

/* ---------- Order (items, payment, events and shipment embedded) ---------- */

const OrderItemSchema = new Schema(
  {
    productId: { type: Schema.Types.ObjectId, ref: "Product", default: null },
    variantId: { type: Schema.Types.ObjectId, default: null },
    productName: { type: String, required: true },
    variantName: { type: String, required: true },
    sku: { type: String, required: true },
    imageUrl: { type: String, default: null },
    unitPrice: { type: Number, required: true },
    quantity: { type: Number, required: true, min: 1 },
    lineTotal: { type: Number, required: true },
  },
  { _id: true }
);

const PaymentSchema = new Schema(
  {
    method: { type: String, enum: ["PAY_ON_CONFIRMATION", "GATEWAY"], required: true },
    status: { type: String, enum: ["PENDING", "PAID", "FAILED", "REFUNDED"], default: "PENDING" },
    amount: { type: Number, required: true },
    providerRef: { type: String, default: null },
    verifiedAt: { type: Date, default: null },
  },
  { _id: true, timestamps: { createdAt: true, updatedAt: false } }
);

const OrderEventSchema = new Schema(
  {
    status: {
      type: String,
      enum: ["PENDING", "CONFIRMED", "PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED"],
      required: true,
    },
    note: { type: String, default: null },
  },
  { _id: true, timestamps: { createdAt: true, updatedAt: false } }
);

const ShipmentSchema = new Schema(
  {
    carrier: { type: String, default: null },
    trackingNumber: { type: String, default: null },
    status: { type: String, enum: ["PENDING", "SHIPPED", "DELIVERED"], default: "PENDING" },
    shippedAt: { type: Date, default: null },
    deliveredAt: { type: Date, default: null },
  },
  { _id: true }
);

const OrderSchema = new Schema(
  {
    orderNumber: { type: String, required: true, unique: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    status: {
      type: String,
      enum: ["PENDING", "CONFIRMED", "PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED"],
      default: "PENDING",
    },
    paymentStatus: { type: String, enum: ["PENDING", "PAID", "FAILED", "REFUNDED"], default: "PENDING" },
    paymentMethod: { type: String, enum: ["PAY_ON_CONFIRMATION", "GATEWAY"], default: "PAY_ON_CONFIRMATION" },
    subtotal: { type: Number, required: true },
    discountTotal: { type: Number, default: 0 },
    shippingFee: { type: Number, default: 0 },
    grandTotal: { type: Number, required: true },
    currency: { type: String, default: "INR" },
    couponCode: { type: String, default: null },
    // Stellora Rewards: points spent at checkout (each = ₹1 off) and points
    // credited when the order was confirmed. Ledger-backed, refundable on cancel.
    pointsRedeemed: { type: Number, default: 0, min: 0 },
    pointsEarned: { type: Number, default: 0, min: 0 },
    idempotencyKey: { type: String, required: true, unique: true },
    shipName: { type: String, required: true },
    shipPhone: { type: String, required: true },
    shipLine1: { type: String, required: true },
    shipLine2: { type: String, default: null },
    shipCity: { type: String, required: true },
    shipState: { type: String, required: true },
    shipPincode: { type: String, required: true },
    shipCountry: { type: String, default: "India" },
    cancelledReason: { type: String, default: null },
    adminNote: { type: String, default: null },
    // ONLINE = website checkout · POS = in-store point-of-sale billing
    source: { type: String, enum: ["ONLINE", "POS"], default: "ONLINE" },
    items: { type: [OrderItemSchema], default: [] },
    payment: { type: PaymentSchema, default: null },
    paymentIntent: {
      type: new Schema(
        {
          provider: { type: String, enum: ["razorpay", "stripe", "demo"], required: true },
          gatewayOrderId: { type: String, required: true },
          createdAt: { type: Date, default: Date.now },
        },
        { _id: false }
      ),
      default: null,
    },
    events: { type: [OrderEventSchema], default: [] },
    shipment: { type: ShipmentSchema, default: null },
  },
  { timestamps: true, collection: "orders" }
);

OrderSchema.index({ userId: 1, createdAt: -1 });
OrderSchema.index({ status: 1, createdAt: -1 });

export const Order = model("Order", OrderSchema);

/* ---------- ShippingRate ---------- */

const ShippingRateSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    baseFee: { type: Number, required: true, min: 0 },
    freeAbove: { type: Number, default: null, min: 0 },
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true, collection: "shippingrates" }
);

export const ShippingRate = model("ShippingRate", ShippingRateSchema);

/* ---------- Counter (atomic sequences) ---------- */

const CounterSchema = new Schema(
  {
    key: { type: String, required: true, unique: true },
    seq: { type: Number, default: 0 },
  },
  { collection: "counters" }
);

CounterSchema.statics.nextVal = async function (key: string): Promise<number> {
  const doc = (await this.findOneAndUpdate(
    { key },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  ).lean()) as { seq: number } | null;
  return doc?.seq ?? 0;
};

export const Counter = model("Counter", CounterSchema);
export type { Types };

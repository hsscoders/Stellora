import { Schema, model } from "mongoose";

/* ================= Review (product ratings & reviews) ================= */

const ReviewSchema = new Schema(
  {
    productId: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    authorName: { type: String, required: true, trim: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    title: { type: String, trim: true, default: "" },
    body: { type: String, required: true, trim: true },
    isVerifiedPurchase: { type: Boolean, default: false },
    status: { type: String, enum: ["PENDING", "APPROVED", "REJECTED"], default: "PENDING" },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: "reviews" }
);
ReviewSchema.index({ productId: 1, userId: 1 }, { unique: true });
ReviewSchema.index({ productId: 1, status: 1, createdAt: -1 });

export const Review = model("Review", ReviewSchema);

/* ================= Newsletter subscriber ================= */

const NewsletterSubscriberSchema = new Schema(
  {
    email: { type: String, required: true, lowercase: true, trim: true },
    source: { type: String, default: "footer" },
    unsubscribedAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: "newslettersubscribers" }
);
NewsletterSubscriberSchema.index({ email: 1 }, { unique: true });

export const NewsletterSubscriber = model("NewsletterSubscriber", NewsletterSubscriberSchema);

/* ================= Back-in-stock alert request ================= */

const RestockAlertSchema = new Schema(
  {
    productId: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    variantId: { type: Schema.Types.ObjectId, ref: "Product", default: null },
    email: { type: String, required: true, lowercase: true, trim: true },
    notifiedAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: "restockalerts" }
);
RestockAlertSchema.index({ productId: 1, email: 1 }, { unique: true });

export const RestockAlert = model("RestockAlert", RestockAlertSchema);

/* ================= Return / Exchange request ================= */

const ReturnItemSchema = new Schema(
  {
    orderItemId: { type: String, default: null },
    productName: { type: String, required: true },
    variantName: { type: String, default: "" },
    quantity: { type: Number, required: true, min: 1 },
  },
  { _id: false }
);

const ReturnRequestSchema = new Schema(
  {
    orderNumber: { type: String, required: true, uppercase: true, trim: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    type: { type: String, enum: ["RETURN", "EXCHANGE"], required: true },
    reason: { type: String, required: true },
    details: { type: String, default: "" },
    items: { type: [ReturnItemSchema], default: [] },
    status: {
      type: String,
      enum: ["REQUESTED", "APPROVED", "REJECTED", "COMPLETED"],
      default: "REQUESTED",
    },
    adminNote: { type: String, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: true }, collection: "returnrequests" }
);
ReturnRequestSchema.index({ orderNumber: 1 });
ReturnRequestSchema.index({ status: 1, createdAt: -1 });

export const ReturnRequest = model("ReturnRequest", ReturnRequestSchema);

/* ================= Product Q&A (customer questions, admin answers) ================= */

const ProductQuestionSchema = new Schema(
  {
    productId: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    authorName: { type: String, required: true, trim: true },
    question: { type: String, required: true, trim: true },
    answer: { type: String, default: null, trim: true },
    answeredAt: { type: Date, default: null },
    answeredById: { type: Schema.Types.ObjectId, ref: "User", default: null },
    status: { type: String, enum: ["PENDING", "ANSWERED", "HIDDEN"], default: "PENDING" },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: "productquestions" }
);
ProductQuestionSchema.index({ productId: 1, status: 1, createdAt: -1 });
ProductQuestionSchema.index({ status: 1, createdAt: -1 });

export const ProductQuestion = model("ProductQuestion", ProductQuestionSchema);

/* ================= Loyalty ledger (Stellora Rewards audit trail) =================
 * The user.loyaltyPoints counter is the fast balance; every mutation is also
 * appended here so accruals are idempotent and refunds are traceable. */

const LoyaltyLedgerSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    orderId: { type: Schema.Types.ObjectId, ref: "Order", default: null },
    delta: { type: Number, required: true }, // + earn / − redeem / ± refund-adjust
    reason: {
      type: String,
      enum: ["EARN", "REDEEM", "REFUND_EARN", "REFUND_REDEEM", "ADJUST"],
      required: true,
    },
    note: { type: String, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: "loyaltyledger" }
);
LoyaltyLedgerSchema.index({ userId: 1, createdAt: -1 });
// One earn entry per order keeps accrual idempotent across retries.
LoyaltyLedgerSchema.index({ orderId: 1, reason: 1 });

export const LoyaltyLedger = model("LoyaltyLedger", LoyaltyLedgerSchema);

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

import { Schema, model } from "mongoose";

/* ---------- Category ---------- */

const CategorySchema = new Schema(
  {
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: null },
    imageUrl: { type: String, default: null },
    sortOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true, collection: "categories" }
);

CategorySchema.index({ isActive: 1, sortOrder: 1 });

export const Category = model("Category", CategorySchema);

/* ---------- Product (with embedded variants + images) ---------- */

export interface VariantDoc {
  _id: Schema.Types.ObjectId;
  sku: string;
  name: string;
  price: number;
  compareAtPrice?: number | null;
  stock: number;
  lowStockThreshold: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const VariantSchema = new Schema<VariantDoc>(
  {
    sku: { type: String, required: true, uppercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    price: { type: Number, required: true, min: 0 },
    compareAtPrice: { type: Number, default: null, min: 0 },
    stock: { type: Number, default: 0, min: 0 },
    lowStockThreshold: { type: Number, default: 5 },
    isActive: { type: Boolean, default: true },
  },
  { _id: true, timestamps: true }
);

const ImageSchema = new Schema(
  {
    url: { type: String, required: true },
    alt: { type: String, default: null },
    sortOrder: { type: Number, default: 0 },
  },
  { _id: true }
);

const ProductSchema = new Schema(
  {
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    categoryId: { type: Schema.Types.ObjectId, ref: "Category", required: true },
    name: { type: String, required: true, trim: true },
    shortDescription: { type: String, required: true },
    description: { type: String, default: null },
    materials: { type: String, default: null },
    careInstructions: { type: String, default: null },
    status: { type: String, enum: ["DRAFT", "ACTIVE", "ARCHIVED"], default: "ACTIVE" },
    isFeatured: { type: Boolean, default: false },
    isNewArrival: { type: Boolean, default: false },
    isBestSeller: { type: Boolean, default: false },
    isTrending: { type: Boolean, default: false },
    variants: { type: [VariantSchema], default: [] },
    images: { type: [ImageSchema], default: [] },
    // Product video preview — mp4/webm file URL or YouTube watch/short link
    videoUrl: { type: String, default: null, trim: true },
  },
  { timestamps: true, collection: "products" }
);

ProductSchema.index({ categoryId: 1, status: 1 });
ProductSchema.index({ status: 1, createdAt: -1 });

export const Product = model("Product", ProductSchema);

/* ---------- StockMovement (audit trail for stock changes) ---------- */

const StockMovementSchema = new Schema(
  {
    variantId: { type: Schema.Types.ObjectId, required: true },
    delta: { type: Number, required: true },
    reason: {
      type: String,
      enum: ["INITIAL", "PURCHASE", "ORDER_COMMIT", "ORDER_RELEASE", "MANUAL_ADJUST"],
      required: true,
    },
    reference: { type: String, default: null },
    note: { type: String, default: null },
    createdById: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: "stockmovements" }
);

StockMovementSchema.index({ variantId: 1, createdAt: -1 });

export const StockMovement = model("StockMovement", StockMovementSchema);

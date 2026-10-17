import { Schema, model } from "mongoose";

/** Delivery address — embedded on the user document. */
export interface AddressDoc {
  _id: Schema.Types.ObjectId;
  fullName: string;
  phone: string;
  line1: string;
  line2?: string | null;
  city: string;
  state: string;
  pincode: string;
  country: string;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const AddressSchema = new Schema<AddressDoc>(
  {
    fullName: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    line1: { type: String, required: true, trim: true },
    line2: { type: String, default: null, trim: true },
    city: { type: String, required: true, trim: true },
    state: { type: String, required: true, trim: true },
    pincode: { type: String, required: true, trim: true },
    country: { type: String, default: "India", trim: true },
    isDefault: { type: Boolean, default: false },
  },
  { _id: true, timestamps: true }
);

const WishlistSchema = new Schema(
  {
    productId: { type: Schema.Types.ObjectId, ref: "Product", required: true },
  },
  { _id: true, timestamps: true }
);

const UserSchema = new Schema(
  {
    /* Mobile-first shop: email is now OPTIONAL — customers register with a
       phone number. Uniqueness comes from a sparse unique index, which only
       skips documents where the field is ABSENT — an explicit null still
       collides. So code must omit the email field (undefined), never write
       null (same rule as Cart.userId in models/commerce.ts). */
    email: {
      type: String,
      unique: true,
      sparse: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    phone: { type: String, default: null, trim: true },
    role: { type: String, enum: ["CUSTOMER", "ADMIN"], default: "CUSTOMER" },
    isActive: { type: Boolean, default: true },
    addresses: { type: [AddressSchema], default: [] },
    wishlist: {
      type: [WishlistSchema],
      default: [],
      set: function (this: any, val: any) { return val; },
    },
    // Stellora Rewards — 1 point earned per ₹100 paid, 1 point = ₹1 to redeem.
    // Fast counter; the loyalty ledger collection is the audit source of truth.
    loyaltyPoints: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true, collection: "users" }
);

UserSchema.index({ email: "text" });
UserSchema.index({ phone: 1 }, { sparse: true });

export const User = model("User", UserSchema);

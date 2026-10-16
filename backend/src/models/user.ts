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
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
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
  },
  { timestamps: true, collection: "users" }
);

UserSchema.index({ email: "text" });

export const User = model("User", UserSchema);

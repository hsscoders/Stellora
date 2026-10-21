/**
 * User & auth types (MySQL/Prisma migration).
 * The runtime data layer is Prisma — see lib/db.ts. These interfaces
 * keep the legacy document shapes that services and routes rely on.
 */

export interface AddressDoc {
  id: string; // was _id: ObjectId — 24-hex string, same format
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

export interface WishlistItemDoc {
  id: string;
  productId: string;
  createdAt: Date;
  updatedAt: Date;
}

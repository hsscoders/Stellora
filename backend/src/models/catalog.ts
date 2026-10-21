/**
 * Catalog types (MySQL/Prisma migration).
 * Runtime data layer is Prisma — see lib/db.ts.
 */

/** Variant document shape as the API layer has always consumed it. */
export interface VariantDoc {
  id: string; // was _id: ObjectId
  sku: string;
  /** Optional scannable barcode number (e.g. 13-digit EAN). Null until assigned. */
  barcode: string | null;
  name: string;
  price: number;
  compareAtPrice?: number | null;
  stock: number;
  lowStockThreshold: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ImageDoc {
  id: string;
  url: string;
  alt: string | null;
  sortOrder: number;
}

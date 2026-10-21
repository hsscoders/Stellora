/**
 * Engagement models (MySQL/Prisma migration).
 * Runtime data layer is Prisma — see lib/db.ts.
 */

export interface ReturnItemDoc {
  id: string;
  orderItemId: string | null;
  productName: string;
  variantName: string;
  quantity: number;
}

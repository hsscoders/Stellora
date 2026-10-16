import "server-only";
import { cookies } from "next/headers";

/**
 * Server-side API client for Server Components.
 * Calls the Express backend directly (internal network) and forwards the
 * visitor's cookies so session-scoped endpoints return personalised data.
 */
const BACKEND = process.env.BACKEND_URL ?? "http://127.0.0.1:4000";

export class ServerApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string
  ) {
    super(message);
  }
}

async function serverGet<T>(path: string): Promise<T> {
  const jar = await cookies();
  const cookieHeader = jar
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");

  const res = await fetch(`${BACKEND}${path}`, {
    headers: cookieHeader ? { cookie: cookieHeader } : {},
    cache: "no-store",
  });

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new ServerApiError(res.status, "BAD_RESPONSE", "Backend returned an invalid response.");
  }
  const parsed = body as { ok: boolean; data?: T; error?: { code: string; message: string } };
  if (!res.ok || !parsed.ok) {
    throw new ServerApiError(
      res.status,
      parsed.error?.code ?? "UNKNOWN",
      parsed.error?.message ?? "Request failed."
    );
  }
  return parsed.data as T;
}

/* ---------- Typed shapes (mirror backend contracts) ---------- */

export type ApiCategory = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  _count?: { products: number };
};

export type ApiVariant = {
  id: string;
  sku: string;
  name: string;
  price: number;
  compareAtPrice: number | null;
  stock: number;
  lowStockThreshold: number;
  isActive: boolean;
};

export type ApiProduct = {
  id: string;
  slug: string;
  categoryId: string | null;
  name: string;
  shortDescription: string;
  description: string | null;
  materials: string | null;
  careInstructions: string | null;
  status: string;
  isFeatured: boolean;
  isNewArrival: boolean;
  isBestSeller: boolean;
  createdAt: string;
  updatedAt: string;
  category: ApiCategory | null;
  images: { id: string; url: string; alt: string | null; sortOrder: number }[];
  variants: ApiVariant[];
};

export type ApiBanner = {
  id: string;
  title: string;
  subtitle: string | null;
  imageUrl: string;
  ctaLabel: string | null;
  ctaHref: string | null;
  sortOrder: number;
  isActive: boolean;
};

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: "CUSTOMER" | "ADMIN";
  phone: string | null;
};

/* ---------- Endpoints ---------- */

export async function apiMe(): Promise<{ user: SessionUser | null }> {
  return serverGet<{ user: SessionUser | null }>("/api/auth/me");
}

export async function apiBanners(): Promise<ApiBanner[]> {
  return serverGet<ApiBanner[]>("/api/banners");
}

export async function apiCategories(): Promise<ApiCategory[]> {
  return serverGet<ApiCategory[]>("/api/categories");
}

export async function apiSettings(): Promise<{ key: string; value: string }[]> {
  return serverGet<{ key: string; value: string }[]>("/api/settings");
}

export async function apiProducts(params: Record<string, string | number | undefined>): Promise<{
  products: ApiProduct[];
  total: number;
  page: number;
  pages: number;
}> {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") search.set(k, String(v));
  }
  return serverGet(`/api/products?${search.toString()}`);
}

export async function apiProduct(slug: string): Promise<ApiProduct> {
  return serverGet<ApiProduct>(`/api/products/${encodeURIComponent(slug)}`);
}

export type ApiOrderListItem = ApiOrderDetail & {
  itemCount: number;
  preview: string | null;
};

export type ApiOrderDetail = {
  id: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  paymentMethod: string;
  subtotal: number;
  discountTotal: number;
  shippingFee: number;
  grandTotal: number;
  currency: string;
  couponCode: string | null;
  shipName: string;
  shipPhone: string;
  shipLine1: string;
  shipLine2: string | null;
  shipCity: string;
  shipState: string;
  shipPincode: string;
  shipCountry: string;
  cancelledReason: string | null;
  createdAt: string;
  updatedAt: string;
  items: {
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
  }[];
  payments: { id: string; method: string; status: string; amount: number }[];
  events: { id: string; status: string; note: string | null; createdAt: string }[];
  shipment: {
    id: string;
    carrier: string | null;
    trackingNumber: string | null;
    status: string;
    shippedAt: string | null;
    deliveredAt: string | null;
  } | null;
};

export async function apiMyOrders(): Promise<ApiOrderListItem[]> {
  return serverGet<ApiOrderListItem[]>("/api/orders");
}

export async function apiMyOrder(orderNumber: string): Promise<ApiOrderDetail> {
  return serverGet<ApiOrderDetail>(`/api/orders/${encodeURIComponent(orderNumber)}`);
}

/* ---------- Reviews (server-rendered on the product page) ---------- */

export type ApiReviewSummary = {
  average: number;
  count: number;
  distribution: Record<string, number>;
};

export type ApiReviewItem = {
  id: string;
  authorName: string;
  rating: number;
  title: string;
  body: string;
  isVerifiedPurchase: boolean;
  status: string;
  isMine: boolean;
  createdAt: string;
};

export type ApiReviewsPayload = {
  summary: ApiReviewSummary;
  reviews: ApiReviewItem[];
  myPendingReview: { rating: number; title: string; body: string } | null;
};

export async function apiProductReviews(productId: string): Promise<ApiReviewsPayload> {
  return serverGet<ApiReviewsPayload>(
    `/api/products/${encodeURIComponent(productId)}/reviews`
  );
}

import "server-only";
import { cookies } from "next/headers";
import { headers } from "next/headers";

/**
 * Admin app server-side API client.
 * Calls the Express backend directly and forwards the admin session cookie.
 */
const BACKEND = process.env.BACKEND_URL ?? "http://127.0.0.1:4000";

export type AdminSessionUser = {
  id: string;
  email: string;
  name: string;
  role: "CUSTOMER" | "ADMIN";
  phone: string | null;
};

/** Resolve the storefront URL from the incoming request (works behind the frontend proxy). */
export async function storefrontBaseUrl(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

async function adminGet<T>(path: string): Promise<T> {
  const jar = await cookies();
  const cookieHeader = jar
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");

  const res = await fetch(`${BACKEND}${path}`, {
    headers: cookieHeader ? { cookie: cookieHeader } : {},
    cache: "no-store",
  });
  const parsed = (await res.json()) as {
    ok: boolean;
    data?: T;
    error?: { code: string; message: string };
  };
  if (!res.ok || !parsed.ok) {
    throw new Error(parsed.error?.message ?? "Request failed");
  }
  return parsed.data as T;
}

export async function adminMe(): Promise<{ user: AdminSessionUser | null }> {
  try {
    return await adminGet<{ user: AdminSessionUser | null }>("/api/auth/me");
  } catch {
    return { user: null };
  }
}

export type AdminStats = {
  revenue30d: number;
  orders30d: number;
  revenue24h: number;
  ordersByStatus: Record<string, number>;
  productCount: number;
  lowStock: {
    variantId: string;
    variantName: string;
    sku: string;
    stock: number;
    lowStockThreshold: number;
    product: { name: string; slug: string };
  }[];
  recentOrders: {
    id: string;
    orderNumber: string;
    status: string;
    paymentStatus: string;
    grandTotal: number;
    createdAt: string;
    user: { name: string; email: string } | null;
  }[];
};

export function apiAdminStats(): Promise<AdminStats> {
  return adminGet<AdminStats>("/api/admin/stats");
}

export type AdminReports = {
  days: number;
  daily: { date: string; grandTotal: number }[];
  topItems: { productName: string; quantity: number; lineTotal: number; orders: number }[];
  lowStock: {
    variantName: string;
    sku: string;
    stock: number;
    lowStockThreshold: number;
    product: { name: string; slug: string };
  }[];
  kpi: {
    revenue: number;
    orders: number;
    aov: number;
    prevRevenue: number;
    prevOrders: number;
    prevAov: number;
    revenueDeltaPct: number;
    ordersDeltaPct: number;
    aovDeltaPct: number;
  };
  categories: { category: string; revenue: number; units: number }[];
  paymentSplit: Record<string, { count: number; total: number }>;
  topCoupons: { code: string; orders: number; saved: number }[];
};

export function apiAdminReports(days?: number): Promise<AdminReports> {
  const q = days && [7, 30].includes(days) ? `?days=${days}` : "";
  return adminGet<AdminReports>(`/api/admin/reports${q}`);
}

export type AuditLogRow = {
  id: string;
  actorEmail: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: Record<string, unknown> | null;
  ip: string | null;
  createdAt: string;
};

export function apiAdminAuditLogs(): Promise<AuditLogRow[]> {
  return adminGet<AuditLogRow[]>("/api/admin/audit-logs");
}

/* ---------- Admin detail fetchers (server components) ---------- */

export type AdminProduct = {
  id: string;
  slug: string;
  categoryId: string;
  name: string;
  shortDescription: string;
  description: string | null;
  materials: string | null;
  careInstructions: string | null;
  status: string;
  isFeatured: boolean;
  isNewArrival: boolean;
  isBestSeller: boolean;
  images: { id: string; url: string; alt: string | null; sortOrder: number }[];
  variants: {
    id: string;
    sku: string;
    name: string;
    price: number;
    compareAtPrice: number | null;
    stock: number;
    lowStockThreshold: number;
    isActive: boolean;
  }[];
};

export async function apiAdminProduct(id: string): Promise<AdminProduct> {
  return adminGet<AdminProduct>(`/api/admin/products/${encodeURIComponent(id)}`);
}

export async function apiAdminCategories(): Promise<
  { id: string; slug: string; name: string; isActive: boolean; sortOrder: number }[]
> {
  return adminGet("/api/admin/categories");
}

export type AdminOrderDetail = {
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
  adminNote: string | null;
  createdAt: string;
  updatedAt: string;
  items: {
    id: string;
    productName: string;
    variantName: string;
    sku: string;
    imageUrl: string | null;
    unitPrice: number;
    quantity: number;
    lineTotal: number;
  }[];
  events: { id: string; status: string; note: string | null; createdAt: string }[];
  shipment: {
    carrier: string | null;
    trackingNumber: string | null;
    status: string;
    shippedAt: string | null;
    deliveredAt: string | null;
  } | null;
  user: { id: string; name: string; email: string; phone: string | null } | null;
};

export async function apiAdminOrder(id: string): Promise<AdminOrderDetail> {
  return adminGet<AdminOrderDetail>(`/api/admin/orders/${encodeURIComponent(id)}`);
}

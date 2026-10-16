import { z } from "zod";

/* ---------- Auth ---------- */

export const registerSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(80),
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  phone: z
    .string()
    .trim()
    .regex(/^[0-9+\-\s]{8,15}$/, "Enter a valid phone number")
    .optional()
    .or(z.literal("")),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(72, "Password is too long")
    .regex(/[a-zA-Z]/, "Password must contain a letter")
    .regex(/[0-9]/, "Password must contain a number"),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

export const forgotPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(10, "Invalid reset link"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(72, "Password is too long")
    .regex(/[a-zA-Z]/, "Password must contain a letter")
    .regex(/[0-9]/, "Password must contain a number"),
});

export const profileUpdateSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(80),
  phone: z
    .string()
    .trim()
    .regex(/^[0-9+\-\s]{8,15}$/, "Enter a valid phone number")
    .optional()
    .or(z.literal("")),
});

export const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[a-zA-Z]/, "Password must contain a letter")
    .regex(/[0-9]/, "Password must contain a number"),
});

export const addressSchema = z.object({
  fullName: z.string().trim().min(2, "Full name is required").max(80),
  phone: z
    .string()
    .trim()
    .regex(/^[0-9+\-\s]{8,15}$/, "Enter a valid phone number"),
  line1: z.string().trim().min(5, "Address line 1 is required").max(160),
  line2: z.string().trim().max(160).optional().or(z.literal("")),
  city: z.string().trim().min(2, "City is required").max(80),
  state: z.string().trim().min(2, "State is required").max(80),
  pincode: z.string().trim().regex(/^[0-9]{5,6}$/, "Enter a valid pincode"),
  country: z.string().trim().max(80).default("India"),
  isDefault: z.boolean().default(false),
});

export const contactSchema = z.object({
  name: z.string().trim().min(2, "Name is required").max(80),
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  subject: z.string().trim().min(3, "Subject is required").max(120),
  message: z.string().trim().min(10, "Message must be at least 10 characters").max(2000),
});

/* ---------- Storefront ---------- */

export const addToCartSchema = z.object({
  variantId: z.string().min(1),
  quantity: z.number().int().min(1).max(10),
});

export const updateCartItemSchema = z.object({
  quantity: z.number().int().min(0).max(10),
});

export const checkoutSchema = z.object({
  addressId: z.string().min(1, "Select a delivery address"),
  couponCode: z.string().trim().max(40).optional(),
  idempotencyKey: z.string().min(8).max(64),
  paymentMethod: z.enum(["PAY_ON_CONFIRMATION", "GATEWAY"]).default("PAY_ON_CONFIRMATION"),
});

export const trackOrderSchema = z.object({
  orderNumber: z.string().trim().min(6, "Enter your order number").max(30),
  email: z.string().trim().toLowerCase().email("Enter the email used for the order"),
});

export const productQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  category: z.string().trim().max(80).optional(),
  minPrice: z.coerce.number().min(0).optional(),
  maxPrice: z.coerce.number().min(0).optional(),
  inStock: z.coerce.boolean().optional(),
  sort: z
    .enum(["newest", "price-asc", "price-desc", "name-asc", "name-desc"])
    .default("newest"),
  page: z.coerce.number().int().min(1).default(1),
  featured: z.string().optional(),
  new: z.string().optional(),
  best: z.string().optional(),
});

/* ---------- Admin ---------- */

export const variantSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1, "Variant name is required").max(80),
  sku: z.string().trim().min(2, "SKU is required").max(40),
  price: z.coerce.number().min(0.01, "Price must be greater than 0"),
  compareAtPrice: z.coerce.number().min(0).optional().nullable(),
  stock: z.coerce.number().int().min(0).default(0),
  lowStockThreshold: z.coerce.number().int().min(0).default(5),
  isActive: z.boolean().default(true),
});

export const productSchema = z.object({
  name: z.string().trim().min(2, "Product name is required").max(140),
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9-]*$/, "Slug can contain lowercase letters, numbers and dashes")
    .max(140)
    .optional(),
  categoryId: z.string().min(1, "Select a category"),
  shortDescription: z.string().trim().min(10, "Short description is required").max(300),
  description: z.string().trim().max(5000).optional().or(z.literal("")),
  materials: z.string().trim().max(300).optional().or(z.literal("")),
  careInstructions: z.string().trim().max(500).optional().or(z.literal("")),
  status: z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]).default("ACTIVE"),
  isFeatured: z.boolean().default(false),
  isNewArrival: z.boolean().default(false),
  isBestSeller: z.boolean().default(false),
  isTrending: z.boolean().default(false),
  images: z
    .array(
      z.object({
        url: z.string().min(1),
        alt: z.string().max(200).optional(),
        sortOrder: z.number().int().default(0),
      })
    )
    .max(8)
    .default([]),
  variants: z.array(variantSchema).min(1, "Add at least one variant").max(20),
});

export const categorySchema = z.object({
  name: z.string().trim().min(2, "Name is required").max(80),
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9-]*$/, "Lowercase letters, numbers and dashes only")
    .max(80)
    .optional(),
  description: z.string().trim().max(500).optional().or(z.literal("")),
  imageUrl: z.string().trim().max(300).optional().or(z.literal("")),
  sortOrder: z.coerce.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
});

export const couponSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{3,20}$/, "3-20 letters/numbers"),
  description: z.string().trim().max(200).optional().or(z.literal("")),
  discountType: z.enum(["PERCENT", "FIXED"]),
  value: z.coerce.number().min(0.01, "Value is required"),
  minSubtotal: z.coerce.number().min(0).optional().nullable(),
  maxDiscount: z.coerce.number().min(0).optional().nullable(),
  startsAt: z.string().optional().nullable(),
  endsAt: z.string().optional().nullable(),
  usageLimit: z.coerce.number().int().min(1).optional().nullable(),
  perUserLimit: z.coerce.number().int().min(1).optional().nullable(),
  isActive: z.boolean().default(true),
});

export const bannerSchema = z.object({
  title: z.string().trim().min(2, "Title is required").max(120),
  subtitle: z.string().trim().max(200).optional().or(z.literal("")),
  imageUrl: z.string().trim().min(1, "Image is required").max(300),
  ctaLabel: z.string().trim().max(40).optional().or(z.literal("")),
  ctaHref: z.string().trim().max(200).optional().or(z.literal("")),
  sortOrder: z.coerce.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
});

export const shippingRateSchema = z.object({
  name: z.string().trim().min(2, "Name is required").max(80),
  baseFee: z.coerce.number().min(0, "Fee is required"),
  freeAbove: z.coerce.number().min(0).optional().nullable(),
  isActive: z.boolean().default(true),
  sortOrder: z.coerce.number().int().min(0).default(0),
});

export const inventoryAdjustSchema = z.object({
  delta: z.number().int().refine((v) => v !== 0, "Adjustment cannot be zero"),
  note: z.string().trim().max(200).optional().or(z.literal("")),
});

export const adminUserSchema = z.object({
  name: z.string().trim().min(2, "Name is required").max(80),
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[a-zA-Z]/, "Password must contain a letter")
    .regex(/[0-9]/, "Password must contain a number"),
  role: z.enum(["CUSTOMER", "ADMIN"]),
});

export const settingsSchema = z.record(z.string(), z.string().max(2000));

export const orderStatusSchema = z.object({
  status: z.enum(["CONFIRMED", "PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED"]),
  note: z.string().trim().max(300).optional().or(z.literal("")),
  carrier: z.string().trim().max(80).optional().or(z.literal("")),
  trackingNumber: z.string().trim().max(80).optional().or(z.literal("")),
});

export const paymentStatusSchema = z.object({
  paymentStatus: z.enum(["PENDING", "PAID", "FAILED", "REFUNDED"]),
  providerRef: z.string().trim().max(100).optional().or(z.literal("")),
});

/* ---------- Engagement: reviews, newsletter, restock alerts, returns ---------- */

export const reviewCreateSchema = z.object({
  rating: z.coerce.number().int().min(1, "Select a rating").max(5, "Select a rating"),
  title: z.string().trim().max(120).optional().or(z.literal("")),
  body: z
    .string()
    .trim()
    .min(10, "Please write at least 10 characters")
    .max(2000, "Review is too long"),
});

export const newsletterSubscribeSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  source: z.string().trim().max(40).optional().or(z.literal("")),
});

export const restockAlertSchema = z.object({
  productId: z.string().min(1, "Product is required"),
  variantId: z.string().optional().or(z.literal("")),
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
});

export const returnItemSchema = z.object({
  orderItemId: z.string().optional().or(z.literal("")),
  productName: z.string().trim().min(1),
  variantName: z.string().optional().or(z.literal("")),
  quantity: z.coerce.number().int().min(1).max(99),
});

export const returnRequestSchema = z.object({
  type: z.enum(["RETURN", "EXCHANGE"]),
  reason: z.string().trim().min(3, "Select or enter a reason").max(160),
  details: z.string().trim().max(1000).optional().or(z.literal("")),
  items: z.array(returnItemSchema).min(1, "Select at least one item"),
});

export const returnStatusSchema = z.object({
  status: z.enum(["REQUESTED", "APPROVED", "REJECTED", "COMPLETED"]),
  adminNote: z.string().trim().max(500).optional().or(z.literal("")),
});

export const reviewModerationSchema = z.object({
  status: z.enum(["PENDING", "APPROVED", "REJECTED"]),
});

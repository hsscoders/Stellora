import { Router } from "express";
import { db, newId } from "../lib/db";
import { ok, fail, handle, assertSameOrigin, HttpError } from "../lib/http";
import { getCurrentUser, getOrCreateCartKey, readCartKey, requireUser } from "../lib/auth";
import { resolveCart, getCartView } from "../services/cart";
import { addToCartSchema, updateCartItemSchema } from "../validation";

export const cartRouter = Router();

async function currentCartIdentity(req: import("express").Request) {
  const user = await getCurrentUser(req);
  const sessionKey = user ? null : readCartKey(req);
  return { user, sessionKey };
}

cartRouter.get(
  "/cart",
  handle(async (req, res) => {
    const { user, sessionKey } = await currentCartIdentity(req);
    if (!user && !sessionKey) {
      return ok(res, { items: [], itemCount: 0, subtotal: 0 });
    }
    const cart = await resolveCart(user?.id ?? null, sessionKey);
    const view = await getCartView(cart.id);
    return ok(res, view);
  })
);

cartRouter.post(
  "/cart",
  handle(async (req, res) => {
    assertSameOrigin(req);
    const user = await getCurrentUser(req);
    const sessionKey = user ? null : getOrCreateCartKey(req, res);
    const cart = await resolveCart(user?.id ?? null, sessionKey);

    const data = addToCartSchema.parse(req.body);
    const variant = await db.productVariant.findFirst({
      where: { id: data.variantId, isActive: true, product: { status: "ACTIVE" } },
      select: { id: true, stock: true },
    });
    if (!variant) {
      return fail(res, "NOT_FOUND", "This product is no longer available.", 404);
    }
    if (variant.stock < 1) {
      return fail(res, "OUT_OF_STOCK", "This item is currently out of stock.", 422);
    }

    const items = await db.cartItem.findMany({ where: { cartId: cart.id } });
    const existing = items.find((i) => i.variantId === variant.id);
    const newQty = Math.min((existing?.quantity ?? 0) + data.quantity, Math.min(variant.stock, 10));
    if (existing) {
      await db.cartItem.update({ where: { id: existing.id }, data: { quantity: newQty } });
    } else {
      await db.cartItem.create({
        data: { id: newId(), cartId: cart.id, variantId: variant.id, quantity: newQty },
      });
    }
    const view = await getCartView(cart.id);
    return ok(res, view, 201);
  })
);

cartRouter.patch(
  "/cart/items/:itemId",
  handle(async (req, res) => {
    assertSameOrigin(req);
    const itemId = String(req.params.itemId);
    const user = await getCurrentUser(req);
    const sessionKey = user ? null : readCartKey(req);
    if (!user && !sessionKey) throw new HttpError("UNAUTHENTICATED", "Cart not found.", 404);
    const cart = await resolveCart(user?.id ?? null, sessionKey);
    const data = updateCartItemSchema.parse(req.body);

    const item = await db.cartItem.findFirst({ where: { id: itemId, cartId: cart.id } });
    if (!item) return fail(res, "NOT_FOUND", "Cart item not found.", 404);

    if (data.quantity === 0) {
      await db.cartItem.delete({ where: { id: item.id } });
      return ok(res, await getCartView(cart.id));
    }

    // Stock check against the variant row
    const variant = await db.productVariant.findUnique({
      where: { id: item.variantId },
      select: { stock: true },
    });
    if (variant && data.quantity > variant.stock) {
      return fail(res, "OUT_OF_STOCK", `Only ${variant.stock} available for this item.`, 422);
    }
    await db.cartItem.update({ where: { id: item.id }, data: { quantity: data.quantity } });
    return ok(res, await getCartView(cart.id));
  })
);

cartRouter.delete(
  "/cart/items/:itemId",
  handle(async (req, res) => {
    assertSameOrigin(req);
    const itemId = String(req.params.itemId);
    const user = await getCurrentUser(req);
    const sessionKey = user ? null : readCartKey(req);
    if (!user && !sessionKey) throw new HttpError("UNAUTHENTICATED", "Cart not found.", 404);
    const cart = await resolveCart(user?.id ?? null, sessionKey);
    // Existence pre-check keeps the exact 404 semantics of the old code.
    const exists = await db.cartItem.findFirst({
      where: { id: itemId, cartId: cart.id },
      select: { id: true },
    });
    if (!exists) return fail(res, "NOT_FOUND", "Cart item not found.", 404);
    await db.cartItem.delete({ where: { id: exists.id } });
    return ok(res, await getCartView(cart.id));
  })
);

/* ---------- Wishlist ---------- */

export const wishlistRouter = Router();

wishlistRouter.get(
  "/wishlist",
  handle(async (req, res) => {
    const user = await requireUser(req);
    const rows = await db.wishlistItem.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      include: {
        product: {
          include: {
            category: true,
            images: { orderBy: { sortOrder: "asc" } },
            variants: { where: { isActive: true }, orderBy: { price: "asc" } },
          },
        },
      },
    });

    const items = rows
      .filter((w) => w.product && w.product.status === "ACTIVE")
      .map((w) => {
        const p = w.product;
        return {
          id: w.id,
          productId: p.id,
          createdAt: w.createdAt,
          product: {
            id: p.id,
            slug: p.slug,
            categoryId: p.categoryId,
            name: p.name,
            shortDescription: p.shortDescription,
            description: p.description ?? null,
            materials: p.materials ?? null,
            careInstructions: p.careInstructions ?? null,
            status: p.status,
            isFeatured: !!p.isFeatured,
            isNewArrival: !!p.isNewArrival,
            isBestSeller: !!p.isBestSeller,
            createdAt: p.createdAt,
            updatedAt: p.updatedAt,
            category: p.category
              ? {
                  id: p.category.id,
                  slug: p.category.slug,
                  name: p.category.name,
                  description: p.category.description ?? null,
                  imageUrl: p.category.imageUrl ?? null,
                  sortOrder: p.category.sortOrder,
                  isActive: p.category.isActive,
                  createdAt: p.category.createdAt,
                  updatedAt: p.category.updatedAt,
                }
              : null,
            images: (p.images ?? []).map((i) => ({
              id: i.id,
              url: i.url,
              alt: i.alt ?? null,
              sortOrder: i.sortOrder ?? 0,
            })),
            variants: (p.variants ?? []).map((v) => ({
              id: v.id,
              sku: v.sku,
              name: v.name,
              price: v.price,
              compareAtPrice: v.compareAtPrice ?? null,
              stock: v.stock,
              lowStockThreshold: v.lowStockThreshold,
              isActive: v.isActive,
              createdAt: v.createdAt,
              updatedAt: v.updatedAt,
            })),
          },
        };
      });
    return ok(res, items);
  })
);

wishlistRouter.post(
  "/wishlist",
  handle(async (req, res) => {
    assertSameOrigin(req);
    const user = await requireUser(req);
    const productId = String(req.body?.productId ?? "");
    if (!productId) return fail(res, "VALIDATION_ERROR", "Product is required.", 422);

    const product = await db.product.findFirst({
      where: { id: productId, status: "ACTIVE" },
      select: { id: true },
    });
    if (!product) return fail(res, "NOT_FOUND", "Product not found.", 404);

    const existing = await db.wishlistItem.findFirst({
      where: { userId: user.id, productId },
      select: { id: true },
    });
    if (existing) {
      await db.wishlistItem.delete({ where: { id: existing.id } });
      return ok(res, { inWishlist: false });
    }
    await db.wishlistItem.create({
      data: { id: newId(), userId: user.id, productId: product.id },
    });
    return ok(res, { inWishlist: true }, 201);
  })
);

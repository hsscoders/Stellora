import { Router } from "express";
import { Product } from "../models";
import { ok, fail, handle, assertSameOrigin, HttpError } from "../lib/http";
import { getCurrentUser, getOrCreateCartKey, readCartKey, requireUser } from "../lib/auth";
import { resolveCart, getCartView } from "../services/cart";
import { addToCartSchema, updateCartItemSchema } from "../validation";
import type { Types } from "mongoose";

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
    const view = await getCartView(String(cart._id));
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
    const product = await Product.findOne({
      "variants._id": data.variantId,
      status: "ACTIVE",
    }).lean<{
      _id: any;
      variants: { _id: any; isActive: boolean; stock: number }[];
    } | null>();
    const variant = product?.variants.find(
      (v) => String(v._id) === String(data.variantId) && v.isActive
    );
    if (!product || !variant) {
      return fail(res, "NOT_FOUND", "This product is no longer available.", 404);
    }
    if (variant.stock < 1) {
      return fail(res, "OUT_OF_STOCK", "This item is currently out of stock.", 422);
    }

    const existing = (await CartRaw(cart._id)).items.find(
      (i: { variantId: Types.ObjectId }) => String(i.variantId) === String(variant._id)
    );
    const newQty = Math.min((existing?.quantity ?? 0) + data.quantity, Math.min(variant.stock, 10));
    if (existing) {
      await ProductUpdateCartQuantity(cart._id, String(existing._id), newQty);
    } else {
      await PushCartItem(cart._id, String(variant._id), newQty);
    }
    const view = await getCartView(String(cart._id));
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

    const { Cart } = await import("../models");
    const cartDoc = await Cart.findById(cart._id).lean<{
      items: { _id: any; variantId: any; quantity: number }[];
    } | null>();
    const item = cartDoc?.items.find((i) => String(i._id) === itemId);
    if (!item) return fail(res, "NOT_FOUND", "Cart item not found.", 404);

    if (data.quantity === 0) {
      await Cart.updateOne({ _id: cart._id }, { $pull: { items: { _id: item._id } } });
      return ok(res, await getCartView(String(cart._id)));
    }

    // Stock check against embedded variant
    const prod = await Product.findOne({ "variants._id": item.variantId })
      .select("variants")
      .lean<{ variants: { _id: any; stock: number }[] } | null>();
    const variant = prod?.variants.find((v) => String(v._id) === String(item.variantId));
    if (variant && data.quantity > variant.stock) {
      return fail(res, "OUT_OF_STOCK", `Only ${variant.stock} available for this item.`, 422);
    }
    await Cart.updateOne(
      { _id: cart._id, "items._id": item._id },
      { $set: { "items.$.quantity": data.quantity } }
    );
    return ok(res, await getCartView(String(cart._id)));
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
    const { Cart } = await import("../models");
    const updated = await Cart.updateOne(
      { _id: cart._id },
      { $pull: { items: { _id: itemId } } }
    );
    if (updated.modifiedCount === 0) return fail(res, "NOT_FOUND", "Cart item not found.", 404);
    return ok(res, await getCartView(String(cart._id)));
  })
);

/* helpers to keep the handler above readable */
import { Cart } from "../models";
async function CartRaw(cartId: Types.ObjectId | string) {
  return (await Cart.findById(cartId).select("items").lean<{ items: { _id: Types.ObjectId; variantId: Types.ObjectId; quantity: number }[] } | null>())!;
}
async function ProductUpdateCartQuantity(cartId: Types.ObjectId | string, itemId: string, qty: number) {
  await Cart.updateOne({ _id: cartId, "items._id": itemId }, { $set: { "items.$.quantity": qty } });
}
async function PushCartItem(cartId: Types.ObjectId | string, variantId: string, qty: number) {
  await Cart.updateOne({ _id: cartId }, { $push: { items: { variantId, quantity: qty } } });
}

/* ---------- Wishlist ---------- */

export const wishlistRouter = Router();

wishlistRouter.get(
  "/wishlist",
  handle(async (req, res) => {
    const user = await requireUser(req);
    const { User, Product } = await import("../models");
    const doc = await User.findById(user.id)
      .select("wishlist")
      .populate({
        path: "wishlist.productId",
        select: "-__v",
        populate: { path: "categoryId", select: "-__v" },
      })
      .lean<{
        wishlist: { _id: any; productId: any; createdAt: Date }[];
      } | null>();

    const items = (doc?.wishlist ?? [])
      .filter((w) => w.productId && (w.productId as any).status === "ACTIVE")
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .map((w) => {
        const p = w.productId as any;
        return {
          id: String(w._id),
          productId: String(p._id),
          createdAt: w.createdAt,
          product: {
            id: String(p._id),
            slug: p.slug,
            categoryId: p.categoryId ? String(p.categoryId._id ?? p.categoryId) : null,
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
            category: p.categoryId
              ? {
                  id: String(p.categoryId._id ?? p.categoryId),
                  slug: p.categoryId.slug,
                  name: p.categoryId.name,
                  description: p.categoryId.description ?? null,
                  imageUrl: p.categoryId.imageUrl ?? null,
                  sortOrder: p.categoryId.sortOrder,
                  isActive: p.categoryId.isActive,
                  createdAt: p.categoryId.createdAt,
                  updatedAt: p.categoryId.updatedAt,
                }
              : null,
            images: (p.images ?? [])
              .sort((a: any, b: any) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
              .map((i: any) => ({ id: String(i._id), url: i.url, alt: i.alt ?? null, sortOrder: i.sortOrder ?? 0 })),
            variants: (p.variants ?? [])
              .filter((v: any) => v.isActive)
              .sort((a: any, b: any) => a.price - b.price)
              .map((v: any) => ({
                id: String(v._id),
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

    const product = await Product.findOne({ _id: productId, status: "ACTIVE" }).select("_id").lean<{ _id: any }>();
    if (!product) return fail(res, "NOT_FOUND", "Product not found.", 404);

    const { User } = await import("../models");
    const doc = await User.findById(user.id).select("wishlist").lean<{ wishlist: { productId: any }[] } | null>();
    const existing = doc?.wishlist?.find((w) => String(w.productId) === productId);
    if (existing) {
      await User.updateOne({ _id: user.id }, { $pull: { wishlist: { productId: product._id } } });
      return ok(res, { inWishlist: false });
    }
    await User.updateOne(
      { _id: user.id },
      { $push: { wishlist: { productId: product._id } } }
    );
    return ok(res, { inWishlist: true }, 201);
  })
);

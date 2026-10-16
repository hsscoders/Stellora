import { Cart, Product } from "../models";
import { HttpError } from "../lib/http";
import { d, money } from "../lib/money";
import type { Types } from "mongoose";

export interface CartLine {
  itemId: string;
  variantId: string;
  productId: string;
  slug: string;
  productName: string;
  variantName: string;
  sku: string;
  imageUrl: string | null;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
  stock: number;
}

export interface CartView {
  items: CartLine[];
  itemCount: number;
  subtotal: number;
}

type CartDoc = {
  _id: Types.ObjectId;
  userId?: Types.ObjectId | null;
  sessionKey?: string | null;
  items: { _id: Types.ObjectId; variantId: Types.ObjectId; quantity: number }[];
};

/** Resolve the active cart for a logged-in user or a guest key (creates one if missing). */
export async function resolveCart(
  userId: string | null,
  sessionKey: string | null
): Promise<CartDoc> {
  const query = userId ? { userId } : sessionKey ? { sessionKey } : null;
  if (!query) throw new HttpError("BAD_REQUEST", "Missing cart identity.", 400);

  const existing = await Cart.findOne(query).lean<CartDoc>();
  if (existing) return existing;
  const created = await Cart.create(query);
  return created.toObject() as unknown as CartDoc;
}

/** Build a fully server-computed view of the cart. */
export async function getCartView(cartId: string): Promise<CartView> {
  const cart = await Cart.findById(cartId).lean<{
    _id: Types.ObjectId;
    items: { _id: Types.ObjectId; variantId: Types.ObjectId; quantity: number }[];
  }>();
  if (!cart) return { items: [], itemCount: 0, subtotal: 0 };

  const variantIds = cart.items.map((i) => i.variantId);
  if (variantIds.length === 0) return { items: [], itemCount: 0, subtotal: 0 };

  // Variants are embedded in products — fetch every product containing a wanted variant
  const products = await Product.find({ "variants._id": { $in: variantIds } })
    .select("slug name status images variants")
    .lean<{
      _id: Types.ObjectId;
      slug: string;
      name: string;
      status: string;
      images: { url: string; alt?: string | null; sortOrder: number }[];
      variants: VariantDocLite[];
    }[]>();

  const variantMap = new Map<string, { v: VariantDocLite; p: (typeof products)[number] }>();
  for (const p of products) {
    for (const v of p.variants ?? []) {
      variantMap.set(String(v._id), { v, p });
    }
  }

  const items: CartLine[] = [];
  let subtotal = d(0);
  for (const item of [...cart.items].sort(
    (a, b) => a._id.getTimestamp().getTime() - b._id.getTimestamp().getTime()
  )) {
    const entry = variantMap.get(String(item.variantId));
    if (!entry) continue;
    const { v, p } = entry;
    if (!v.isActive || p.status !== "ACTIVE") continue; // hide unavailable lines
    const lineTotal = money(d(v.price).mul(item.quantity));
    subtotal = subtotal.plus(lineTotal);
    items.push({
      itemId: String(item._id),
      variantId: String(v._id),
      productId: String(p._id),
      slug: p.slug,
      productName: p.name,
      variantName: v.name,
      sku: v.sku,
      imageUrl: p.images?.[0]?.url ?? null,
      unitPrice: money(v.price),
      quantity: item.quantity,
      lineTotal,
      stock: v.stock,
    });
  }
  return {
    items,
    itemCount: items.reduce((n, i) => n + i.quantity, 0),
    subtotal: money(subtotal),
  };
}

type VariantDocLite = {
  _id: Types.ObjectId;
  sku: string;
  name: string;
  price: number;
  stock: number;
  isActive: boolean;
};

/** Merge a guest cart into the user's cart after login. */
export async function mergeGuestCart(userId: string, sessionKey: string) {
  const guestCart = await Cart.findOne({ sessionKey }).lean<CartDoc>();
  if (!guestCart || guestCart.items.length === 0) return;

  const userCart = await resolveCart(userId, null);
  const items = userCart.items ?? [];

  for (const gi of guestCart.items) {
    const existing = items.find((ui) => String(ui.variantId) === String(gi.variantId));
    if (existing) {
      await Cart.updateOne(
        { _id: userCart._id, "items._id": existing._id },
        { $set: { "items.$.quantity": Math.min(existing.quantity + gi.quantity, 10) } }
      );
    } else {
      await Cart.updateOne(
        { _id: userCart._id },
        { $push: { items: { variantId: gi.variantId, quantity: gi.quantity } } }
      );
    }
  }
  await Cart.deleteOne({ _id: guestCart._id });
}

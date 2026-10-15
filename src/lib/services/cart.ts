import { db } from "@/lib/db";
import { HttpError } from "@/lib/http";
import { d, money } from "@/lib/money";

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

/** Resolve the active cart for a logged-in user or a guest key. */
export async function resolveCart(userId: string | null, sessionKey: string | null) {
  if (userId) {
    return db.cart.upsert({
      where: { userId },
      update: {},
      create: { userId },
      include: { items: true },
    });
  }
  if (sessionKey) {
    return db.cart.upsert({
      where: { sessionKey },
      update: {},
      create: { sessionKey },
      include: { items: true },
    });
  }
  throw new HttpError("BAD_REQUEST", "Missing cart identity.", 400);
}

/** Build a fully server-computed view of the cart. */
export async function getCartView(cartId: string): Promise<CartView> {
  const cart = await db.cart.findUnique({
    where: { id: cartId },
    include: {
      items: {
        include: {
          variant: {
            include: { product: { include: { images: { orderBy: { sortOrder: "asc" } } } } },
          },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!cart) return { items: [], itemCount: 0, subtotal: 0 };

  const items: CartLine[] = [];
  let subtotal = d(0);
  for (const item of cart.items) {
    const v = item.variant;
    const p = v.product;
    if (!v.isActive || p.status !== "ACTIVE") continue; // hide unavailable lines
    const lineTotal = money(d(v.price).mul(item.quantity));
    subtotal = subtotal.plus(lineTotal);
    items.push({
      itemId: item.id,
      variantId: v.id,
      productId: p.id,
      slug: p.slug,
      productName: p.name,
      variantName: v.name,
      sku: v.sku,
      imageUrl: p.images[0]?.url ?? null,
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

/** Merge a guest cart into the user's cart after login. */
export async function mergeGuestCart(userId: string, sessionKey: string) {
  const guestCart = await db.cart.findUnique({
    where: { sessionKey },
    include: { items: true },
  });
  if (!guestCart || guestCart.items.length === 0) return;

  const userCart = await db.cart.upsert({
    where: { userId },
    update: {},
    create: { userId },
    include: { items: true },
  });

  for (const gi of guestCart.items) {
    const existing = userCart.items.find((ui) => ui.variantId === gi.variantId);
    if (existing) {
      await db.cartItem.update({
        where: { id: existing.id },
        data: { quantity: Math.min(existing.quantity + gi.quantity, 10) },
      });
    } else {
      await db.cartItem.create({
        data: { cartId: userCart.id, variantId: gi.variantId, quantity: gi.quantity },
      });
    }
  }
  await db.cart.delete({ where: { id: guestCart.id } });
}

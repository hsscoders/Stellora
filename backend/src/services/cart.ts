import { db, newId } from "../lib/db";
import { HttpError } from "../lib/http-errors";
import { d, money } from "../lib/money";

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

export type CartRow = {
  id: string;
  userId: string | null;
  sessionKey: string | null;
  items: { id: string; variantId: string; quantity: number; createdAt: Date }[];
};

/** Resolve the active cart for a logged-in user or a guest key (creates one if missing). */
export async function resolveCart(
  userId: string | null,
  sessionKey: string | null
): Promise<CartRow> {
  const where = userId ? { userId } : sessionKey ? { sessionKey } : null;
  if (!where) throw new HttpError("BAD_REQUEST", "Missing cart identity.", 400);

  const existing = await db.cart.findFirst({
    where,
    include: { items: { orderBy: { createdAt: "asc" } } },
  });
  if (existing) return existing as unknown as CartRow;

  const created = await db.cart.create({
    data: { id: newId(), ...(userId ? { userId } : { sessionKey: sessionKey! }) },
    include: { items: true },
  });
  return created as unknown as CartRow;
}

/** Build a fully server-computed view of the cart. */
export async function getCartView(cartId: string): Promise<CartView> {
  const cart = await db.cart.findUnique({
    where: { id: cartId },
    include: { items: { orderBy: { createdAt: "asc" } } },
  });
  if (!cart) return { items: [], itemCount: 0, subtotal: 0 };

  const variantIds = cart.items.map((i) => i.variantId);
  if (variantIds.length === 0) return { items: [], itemCount: 0, subtotal: 0 };

  // Variants live in their own table — fetch them with their parent product
  const variants = await db.productVariant.findMany({
    where: { id: { in: variantIds } },
    include: {
      product: {
        select: {
          id: true,
          slug: true,
          name: true,
          status: true,
          images: { orderBy: { sortOrder: "asc" } },
        },
      },
    },
  });

  const variantMap = new Map(variants.map((v) => [v.id, v]));

  const items: CartLine[] = [];
  let subtotal = d(0);
  for (const item of cart.items) {
    const v = variantMap.get(item.variantId);
    if (!v) continue;
    const p = v.product;
    if (!v.isActive || p.status !== "ACTIVE") continue; // hide unavailable lines
    const lineTotal = money(d(Number(v.price)).mul(item.quantity));
    subtotal = subtotal.plus(lineTotal);
    items.push({
      itemId: item.id,
      variantId: v.id,
      productId: p.id,
      slug: p.slug,
      productName: p.name,
      variantName: v.name,
      sku: v.sku,
      imageUrl: p.images?.[0]?.url ?? null,
      unitPrice: money(Number(v.price)),
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
  const guestCart = await db.cart.findFirst({
    where: { sessionKey },
    include: { items: true },
  });
  if (!guestCart || guestCart.items.length === 0) return;

  const userCart = await resolveCart(userId, null);

  for (const gi of guestCart.items) {
    const existing = (userCart.items ?? []).find(
      (ui) => ui.variantId === gi.variantId
    );
    if (existing) {
      await db.cartItem.update({
        where: { id: existing.id },
        data: { quantity: Math.min(existing.quantity + gi.quantity, 10) },
      });
    } else {
      await db.cartItem.create({
        data: { id: newId(), cartId: userCart.id, variantId: gi.variantId, quantity: gi.quantity },
      });
    }
  }
  // Mongo semantics: the guest cart (and its embedded items) disappears.
  await db.cartItem.deleteMany({ where: { cartId: guestCart.id } });
  await db.cart.delete({ where: { id: guestCart.id } });
}

"use client";

import { create } from "zustand";

export interface CartStateItem {
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

export interface CartViewData {
  items: CartStateItem[];
  itemCount: number;
  subtotal: number;
}

interface StoreState {
  cart: CartViewData | null;
  cartLoading: boolean;
  wishlist: string[];
  /** Slide-over cart drawer visibility (opens on add-to-cart + header icon). */
  cartOpen: boolean;
  setCartOpen: (open: boolean) => void;
  refreshCart: () => Promise<void>;
  addToCart: (variantId: string, quantity: number) => Promise<{ ok: boolean; message?: string }>;
  updateItem: (itemId: string, quantity: number) => Promise<void>;
  removeItem: (itemId: string) => Promise<void>;
  refreshWishlist: () => Promise<void>;
  toggleWishlist: (productId: string) => Promise<boolean>;
}

export const useStore = create<StoreState>((set, get) => ({
  cart: null,
  cartLoading: false,
  wishlist: [],
  cartOpen: false,
  setCartOpen: (open) => set({ cartOpen: open }),

  refreshCart: async () => {
    set({ cartLoading: true });
    try {
      const res = await fetch("/api/cart", { cache: "no-store" });
      const json = await res.json();
      if (json.ok) set({ cart: json.data });
    } finally {
      set({ cartLoading: false });
    }
  },

  addToCart: async (variantId, quantity) => {
    const res = await fetch("/api/cart", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ variantId, quantity }),
    });
    const json = await res.json();
    if (json.ok) {
      set({ cart: json.data });
      return { ok: true };
    }
    return { ok: false, message: json.error?.message ?? "Could not add to cart." };
  },

  updateItem: async (itemId, quantity) => {
    const res = await fetch(`/api/cart/items/${itemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quantity }),
    });
    const json = await res.json();
    if (json.ok) set({ cart: json.data });
  },

  removeItem: async (itemId) => {
    const res = await fetch(`/api/cart/items/${itemId}`, { method: "DELETE" });
    const json = await res.json();
    if (json.ok) set({ cart: json.data });
  },

  refreshWishlist: async () => {
    try {
      const res = await fetch("/api/wishlist", { cache: "no-store" });
      if (res.status === 401) {
        set({ wishlist: [] });
        return;
      }
      const json = await res.json();
      if (json.ok) set({ wishlist: json.data.map((i: { productId: string }) => i.productId) });
    } catch {
      /* not signed in */
    }
  },

  toggleWishlist: async (productId) => {
    const res = await fetch("/api/wishlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId }),
    });
    const json = await res.json();
    if (json.ok) {
      const has = get().wishlist.includes(productId);
      set({
        wishlist: has
          ? get().wishlist.filter((id) => id !== productId)
          : [...get().wishlist, productId],
      });
      return json.data.inWishlist;
    }
    return false;
  },
}));

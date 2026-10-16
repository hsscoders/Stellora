/** Shape of a product serialized to the client for cards and detail pages. */
export type ProductCardData = {
  id: string;
  slug: string;
  name: string;
  shortDescription: string;
  category: { id: string; name: string; slug: string } | null;
  images: { url: string; alt: string | null }[];
  variants: {
    id: string;
    name: string;
    sku: string;
    price: number | string;
    compareAtPrice: number | string | null;
    stock: number;
  }[];
  isBestSeller?: boolean;
  isNewArrival?: boolean;
  isFeatured?: boolean;
};

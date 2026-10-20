import { z } from "zod";

export const productQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  category: z.string().trim().max(80).optional(),
  minPrice: z.coerce.number().min(0).optional(),
  maxPrice: z.coerce.number().min(0).optional(),
  minRating: z.coerce.number().int().min(1).max(5).optional(),
  inStock: z.coerce.boolean().optional(),
  sort: z
    .enum(["newest", "price-asc", "price-desc", "name-asc", "name-desc", "rating-desc"])
    .default("newest"),
  page: z.coerce.number().int().min(1).default(1),
});

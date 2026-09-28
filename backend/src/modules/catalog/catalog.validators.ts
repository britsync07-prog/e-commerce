import { z } from "zod";

export const shopParamsSchema = z.object({
  shopId: z.string().uuid()
});

export const productParamsSchema = shopParamsSchema.extend({
  productId: z.string().uuid()
});

export const variantParamsSchema = productParamsSchema.extend({
  variantId: z.string().uuid()
});

export const createProductSchema = z.object({
  name: z.string().trim().min(2).max(140),
  slug: z.string().trim().min(2).max(160).optional(),
  description: z.string().trim().max(5000).optional(),
  status: z.enum(["draft", "active"]).default("draft"),
  basePrice: z.coerce.number().min(0),
  currency: z.string().trim().length(3),
  sku: z.string().trim().max(80).optional(),
  variantTitle: z.string().trim().max(120).default("Default"),
  openingStock: z.coerce.number().int().min(0).default(0)
});

export const updateProductSchema = z.object({
  name: z.string().trim().min(2).max(140).optional(),
  description: z.string().trim().max(5000).nullable().optional(),
  status: z.enum(["draft", "active", "archived"]).optional(),
  basePrice: z.coerce.number().min(0).optional(),
  currency: z.string().trim().length(3).optional()
});

export const createVariantSchema = z.object({
  title: z.string().trim().min(1).max(120),
  sku: z.string().trim().min(1).max(80).optional(),
  price: z.coerce.number().min(0),
  openingStock: z.coerce.number().int().min(0).default(0)
});

export const updateVariantSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  sku: z.string().trim().min(1).max(80).nullable().optional(),
  price: z.coerce.number().min(0).optional(),
  status: z.enum(["active", "archived"]).optional()
});

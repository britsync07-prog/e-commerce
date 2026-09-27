import { z } from "zod";

export const variantParamsSchema = z.object({
  shopId: z.string().uuid(),
  variantId: z.string().uuid()
});

export const adjustInventorySchema = z.object({
  deltaQuantity: z.coerce.number().int().refine((value) => value !== 0, "deltaQuantity cannot be 0"),
  reason: z.enum(["manual_adjustment", "restock", "damage", "correction"]),
  note: z.string().trim().max(500).optional()
});


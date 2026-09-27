import { z } from "zod";

export const shopParamsSchema = z.object({ shopId: z.string().uuid() });
export const customerParamsSchema = z.object({ shopId: z.string().uuid(), customerId: z.string().uuid() });
export const customerListQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  consentStatus: z.enum(["unknown", "opted_in", "opted_out"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50)
});
export const consentSchema = z.object({
  status: z.enum(["unknown", "opted_in", "opted_out"]),
  reason: z.string().trim().min(3).max(300)
});
export const tagSchema = z.object({ name: z.string().trim().min(1).max(40) });
export const mergePairSchema = z.object({ sourceCustomerId: z.string().uuid(), targetCustomerId: z.string().uuid() });
export const mergeApplySchema = mergePairSchema.extend({ confirm: z.literal(true), reason: z.string().trim().min(5).max(500) });

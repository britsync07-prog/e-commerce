import { z } from "zod";

export const shopParamsSchema = z.object({ shopId: z.string().uuid() });
export const couponParamsSchema = z.object({ shopId: z.string().uuid(), couponId: z.string().uuid() });
export const segmentParamsSchema = z.object({ shopId: z.string().uuid(), segmentId: z.string().uuid() });
export const couponListQuerySchema = z.object({ status: z.enum(["active", "disabled"]).optional(), limit: z.coerce.number().int().min(1).max(100).default(50) });
export const createCouponSchema = z.object({
  code: z.string().trim().min(2).max(40).transform((value) => value.toUpperCase()),
  discountType: z.enum(["percent", "fixed"]),
  discountValue: z.coerce.number().positive().max(999999999),
  minOrderTotal: z.coerce.number().min(0).max(999999999).default(0),
  usageLimit: z.coerce.number().int().positive().max(1000000).nullable().optional(),
  expiresAt: z.string().datetime().nullable().optional()
}).superRefine((value, ctx) => {
  if (value.discountType === "percent" && value.discountValue > 100) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["discountValue"], message: "Percent discount cannot exceed 100." });
});
export const updateCouponSchema = z.object({ status: z.enum(["active", "disabled"]) });
export const segmentDefinitionSchema = z.object({
  consentStatus: z.enum(["unknown", "opted_in"]).optional(),
  tag: z.string().trim().min(1).max(40).optional(),
  minOrders: z.coerce.number().int().min(0).max(1000000).default(0),
  minLifetimeValue: z.coerce.number().min(0).max(999999999).default(0)
});
export const createSegmentSchema = z.object({ name: z.string().trim().min(2).max(80), definition: segmentDefinitionSchema });
export const broadcastParamsSchema = z.object({ shopId: z.string().uuid(), broadcastId: z.string().uuid() });
export const createBroadcastSchema = z.object({
  name: z.string().trim().min(2).max(100),
  segmentId: z.string().uuid(),
  channel: z.enum(["messenger", "instagram"]),
  body: z.string().trim().min(2).max(2000),
  rateLimitPerMinute: z.coerce.number().int().min(1).max(100).default(20)
});
export const approvalSchema = z.object({ reason: z.string().trim().min(5).max(500) });

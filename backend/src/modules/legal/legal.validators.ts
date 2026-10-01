import { z } from "zod";

export const policyTypeSchema = z.enum(["privacy_policy", "terms_conditions", "refund_policy", "shipping_policy", "cookie_policy"]);
export const privacyRequestTypeSchema = z.enum(["access", "delete", "correct", "opt_out"]);
export const privacyRequestStatusSchema = z.enum(["open", "reviewing", "completed", "rejected"]);

export const shopParamsSchema = z.object({ shopId: z.string().uuid() });
export const subdomainParamsSchema = z.object({ subdomain: z.string().trim().min(2).max(80) });
export const policyParamsSchema = shopParamsSchema.extend({ policyType: policyTypeSchema });
export const privacyRequestParamsSchema = shopParamsSchema.extend({ requestId: z.string().uuid() });

export const policyUpsertSchema = z.object({
  title: z.string().trim().min(3).max(160),
  body: z.string().trim().min(20).max(30000),
  publish: z.boolean().default(false)
});

export const cookieConsentSchema = z.object({
  visitorId: z.string().trim().min(1).max(120).optional(),
  categories: z.object({
    necessary: z.literal(true).default(true),
    analytics: z.boolean().default(false),
    marketing: z.boolean().default(false),
    preferences: z.boolean().default(false)
  }),
  policyVersion: z.coerce.number().int().positive().optional()
});

export const privacyRequestCreateSchema = z.object({
  requestType: privacyRequestTypeSchema,
  requesterName: z.string().trim().min(1).max(120).optional(),
  requesterEmail: z.string().trim().email().max(180).optional(),
  requesterPhone: z.string().trim().min(6).max(40).optional(),
  details: z.string().trim().min(5).max(2000).optional()
}).refine((value) => value.requesterEmail || value.requesterPhone, "requesterEmail or requesterPhone is required");

export const privacyRequestListQuerySchema = z.object({
  status: privacyRequestStatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50)
});

export const privacyRequestUpdateSchema = z.object({
  status: privacyRequestStatusSchema,
  resolutionNote: z.string().trim().min(3).max(1000).optional()
});

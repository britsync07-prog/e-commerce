import { z } from "zod";

export const shopParamsSchema = z.object({ shopId: z.string().uuid() });
export const commandParamsSchema = z.object({ shopId: z.string().uuid(), commandId: z.string().uuid() });
export const creativeParamsSchema = z.object({ shopId: z.string().uuid(), requestId: z.string().uuid() });
export const createCommandSchema = z.object({ prompt: z.string().trim().min(3).max(4000), actionType: z.enum(["question", "draft", "action"]).default("question") });
export const approveCommandSchema = z.object({ reason: z.string().trim().min(3).max(500) });

export const brandRulesSchema = z.object({
  rules: z.object({
    brandVoice: z.string().trim().max(500).optional(),
    mustUse: z.array(z.string().trim().min(1).max(120)).max(20).default([]),
    mustAvoid: z.array(z.string().trim().min(1).max(120)).max(20).default([]),
    requiredDisclaimers: z.array(z.string().trim().min(1).max(160)).max(10).default([])
  }).default({}),
  bannedClaims: z.array(z.string().trim().min(2).max(120)).max(50).default([]),
  defaultLanguage: z.enum(["bn", "bn-en", "en", "ur", "ur-roman"]).default("bn-en"),
  defaultTone: z.string().trim().min(2).max(80).default("friendly")
});

export const creativeTemplateSchema = z.object({
  name: z.string().trim().min(2).max(120),
  format: z.enum(["hook", "caption", "headline", "script", "brief"]),
  template: z.record(z.unknown()).default({})
});

export const adCreativeSchema = z.object({
  productId: z.string().uuid().optional(),
  templateId: z.string().uuid().optional(),
  objective: z.string().trim().min(3).max(160),
  offer: z.string().trim().max(240).optional(),
  audience: z.string().trim().min(2).max(240),
  language: z.enum(["bn", "bn-en", "en", "ur", "ur-roman"]).optional(),
  tone: z.string().trim().min(2).max(80).optional()
});

export const creativeListQuerySchema = z.object({
  productId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50)
});

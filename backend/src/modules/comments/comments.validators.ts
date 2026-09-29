import { z } from "zod";

export const shopParamsSchema = z.object({ shopId: z.string().uuid() });
export const postParamsSchema = z.object({ shopId: z.string().uuid(), postId: z.string().uuid() });
export const ruleParamsSchema = z.object({ shopId: z.string().uuid(), ruleId: z.string().uuid() });
export const leadParamsSchema = z.object({ shopId: z.string().uuid(), leadId: z.string().uuid() });

export const listQuerySchema = z.object({
  status: z.string().trim().min(1).max(40).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50)
});

export const createPostSchema = z.object({
  platform: z.enum(["facebook", "instagram"]),
  externalPostId: z.string().trim().min(1).max(200),
  mediaUrl: z.string().trim().url().optional(),
  caption: z.string().trim().max(2000).optional(),
  linkedProductId: z.string().uuid().nullable().optional(),
  status: z.enum(["active", "paused", "archived"]).default("active")
});

export const updatePostSchema = z.object({
  mediaUrl: z.string().trim().url().nullable().optional(),
  caption: z.string().trim().max(2000).nullable().optional(),
  linkedProductId: z.string().uuid().nullable().optional(),
  status: z.enum(["active", "paused", "archived"]).optional()
});

export const createRuleSchema = z.object({
  postId: z.string().uuid().nullable().optional(),
  name: z.string().trim().min(2).max(120),
  keywords: z.array(z.string().trim().min(1).max(40)).min(1).max(40),
  language: z.enum(["bn", "bn-en", "en", "ur", "ur-roman"]).default("bn-en"),
  publicReplyTemplate: z.string().trim().min(2).max(500).optional(),
  dmTemplate: z.string().trim().min(2).max(1000).optional(),
  delaySeconds: z.coerce.number().int().min(0).max(86400).default(60),
  limitPerHour: z.coerce.number().int().min(1).max(200).default(20)
}).refine((value) => value.publicReplyTemplate || value.dmTemplate, "public reply or DM template is required");

export const previewCommentSchema = z.object({
  postId: z.string().uuid().optional(),
  platform: z.enum(["facebook", "instagram"]),
  commenterExternalId: z.string().trim().min(1).max(200),
  commenterName: z.string().trim().max(160).optional(),
  commentText: z.string().trim().min(1).max(2000)
});

export const captureCommentSchema = previewCommentSchema.extend({
  externalCommentId: z.string().trim().min(1).max(240),
  customerPhone: z.string().trim().min(6).max(40).optional()
});

export const moderationSchema = z.object({
  hidden: z.boolean().optional(),
  reason: z.string().trim().min(3).max(500).optional(),
  assignedStaffId: z.string().uuid().nullable().optional(),
  staffAction: z.enum(["none", "reviewed", "hidden", "replied", "closed"]).default("reviewed")
}).refine((value) => !value.hidden || value.reason, "reason is required when hiding a comment");

import { z } from "zod";

export const shopParamsSchema = z.object({
  shopId: z.string().uuid()
});

export const conversationParamsSchema = z.object({
  shopId: z.string().uuid(),
  conversationId: z.string().uuid()
});

export const draftParamsSchema = z.object({
  shopId: z.string().uuid(),
  conversationId: z.string().uuid(),
  draftId: z.string().uuid()
});

export const conversationListQuerySchema = z.object({
  status: z.enum(["open", "pending", "closed"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50)
});

export const createConversationSchema = z.object({
  channel: z.enum(["messenger", "instagram", "manual"]).default("manual"),
  buyerExternalId: z.string().trim().min(2).max(160),
  buyerName: z.string().trim().max(120).optional(),
  buyerPhone: z.string().trim().max(40).optional(),
  message: z.string().trim().min(1).max(4000).optional()
});

export const addMessageSchema = z.object({
  source: z.enum(["buyer", "staff"]).default("buyer"),
  body: z.string().trim().min(1).max(4000),
  externalMessageId: z.string().trim().max(160).optional()
});

export const updateAssignmentSchema = z.object({
  assignedStaffId: z.string().uuid().nullable()
});

export const reviewDraftSchema = z.object({
  status: z.enum(["approved", "rejected"]),
  note: z.string().trim().max(500).optional()
});

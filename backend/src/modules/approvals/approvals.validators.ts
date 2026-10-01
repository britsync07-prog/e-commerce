import { z } from "zod";

export const shopParamsSchema = z.object({ shopId: z.string().uuid() });
export const approvalParamsSchema = shopParamsSchema.extend({ approvalId: z.string().uuid() });
export const listApprovalsQuerySchema = z.object({
  status: z.enum(["pending", "approved", "rejected", "executed", "failed"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50)
});
export const createApprovalSchema = z.object({
  actionType: z.literal("job.retry"),
  targetId: z.string().uuid(),
  reason: z.string().trim().min(5).max(500)
});
export const decisionSchema = z.object({
  reason: z.string().trim().min(5).max(500)
});

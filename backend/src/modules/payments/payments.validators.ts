import { z } from "zod";

export const shopParamsSchema = z.object({ shopId: z.string().uuid() });
export const paymentParamsSchema = z.object({ shopId: z.string().uuid(), paymentId: z.string().uuid() });
export const orderPaymentParamsSchema = z.object({ shopId: z.string().uuid(), orderId: z.string().uuid() });
export const paymentListQuerySchema = z.object({
  status: z.enum(["pending", "marked_paid", "refunded", "failed"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50)
});
export const manualPaymentSchema = z.object({
  method: z.enum(["cod", "advance", "manual"]).default("cod"),
  amount: z.coerce.number().positive().max(999999999).optional(),
  proofAssetId: z.string().uuid().optional(),
  note: z.string().trim().min(3).max(500)
});
export const refundSchema = z.object({
  amount: z.coerce.number().positive().max(999999999).optional(),
  note: z.string().trim().min(3).max(500)
});
export const settlementParamsSchema = z.object({ shopId: z.string().uuid(), settlementId: z.string().uuid() });
export const settlementRowSchema = z.object({
  externalRef: z.string().trim().min(1).max(120),
  trackingNumber: z.string().trim().max(120).optional(),
  orderId: z.string().uuid().optional(),
  amount: z.coerce.number().min(0).max(999999999)
});
export const createSettlementSchema = z.object({
  statementRef: z.string().trim().min(1).max(120),
  courierName: z.string().trim().min(2).max(120),
  statementDate: z.string().date(),
  collectedAmount: z.coerce.number().min(0).max(999999999),
  fee: z.coerce.number().min(0).max(999999999).default(0),
  note: z.string().trim().max(500).optional(),
  rows: z.array(settlementRowSchema).min(1).max(1000)
});

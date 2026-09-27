import { z } from "zod";

export const metricsParamsSchema = z.object({ shopId: z.string().uuid() });
const dateFields = {
  from: z.string().date().optional(),
  to: z.string().date().optional()
};

function dateRange(input: { from?: string; to?: string }, ctx: z.RefinementCtx) {
  const to = input.to ?? new Date().toISOString().slice(0, 10);
  const from = input.from ?? new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10);
  if (from > to) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "from must be on or before to", path: ["from"] });
  }
  const span = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000;
  if (span > 366) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Date range cannot exceed 367 days.", path: ["to"] });
  return { from, to };
}

export const metricsQuerySchema = z.object(dateFields).transform(dateRange);
export const reportQuerySchema = z.object({ ...dateFields,
  status: z.enum(["new", "confirmed", "packed", "shipped", "delivered", "cancelled", "returned"]).optional(),
  format: z.enum(["json", "csv"]).default("json"),
  limit: z.coerce.number().int().min(1).max(1000).default(100)
}).transform((input, ctx) => ({ ...input, ...dateRange(input, ctx) }));
export const eventsQuerySchema = z.object({ ...dateFields, eventType: z.string().trim().min(1).max(100).optional(), limit: z.coerce.number().int().min(1).max(500).default(100) }).transform((input, ctx) => ({ ...input, ...dateRange(input, ctx) }));

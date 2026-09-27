import { z } from "zod";

export const metricsParamsSchema = z.object({ shopId: z.string().uuid() });
export const metricsQuerySchema = z.object({
  from: z.string().date().optional(),
  to: z.string().date().optional()
}).transform((input, ctx) => {
  const to = input.to ?? new Date().toISOString().slice(0, 10);
  const from = input.from ?? new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10);
  if (from > to) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "from must be on or before to", path: ["from"] });
  }
  const span = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000;
  if (span > 366) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Date range cannot exceed 367 days.", path: ["to"] });
  return { from, to };
});

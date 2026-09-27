import { z } from "zod";

export const shopParamsSchema = z.object({ shopId: z.string().uuid() });
export const jobParamsSchema = z.object({ shopId: z.string().uuid(), jobId: z.string().uuid() });
export const enqueueSchema = z.object({ queue: z.enum(["imports", "ai", "webhooks", "courier", "payments", "exports", "analytics"]), jobType: z.string().trim().min(1).max(120), payload: z.record(z.unknown()).default({}), maxAttempts: z.coerce.number().int().min(1).max(20).default(5) });
export const listQuerySchema = z.object({ status: z.enum(["pending", "running", "done", "failed", "dead"]).optional(), limit: z.coerce.number().int().min(1).max(100).default(50) });
export const retrySchema = z.object({ reason: z.string().trim().min(3).max(500) });

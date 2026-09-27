import { z } from "zod";

export const shopParamsSchema = z.object({ shopId: z.string().uuid() });
export const connectionParamsSchema = z.object({ shopId: z.string().uuid(), connectionId: z.string().uuid() });
export const updateConnectionSchema = z.object({ status: z.enum(["active", "disabled", "error"]) });
export const oauthCompleteSchema = z.object({ state: z.string().trim().min(20).max(200), pageId: z.string().trim().min(1).max(120) });
export const catalogSyncSchema = z.object({
  connectionId: z.string().uuid(),
  skipUnpublished: z.boolean().default(true),
  skipOutOfStock: z.boolean().default(true)
});

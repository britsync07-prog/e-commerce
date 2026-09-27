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
export const campaignStatsQuerySchema = z.object({ from: z.string().date(), to: z.string().date() });
export const campaignStatsImportSchema = z.object({
  connectionId: z.string().uuid().optional(),
  campaignId: z.string().trim().min(1).max(160),
  campaignName: z.string().trim().max(200).optional(),
  metricDate: z.string().date(),
  spend: z.coerce.number().min(0).max(100000000),
  impressions: z.coerce.number().int().min(0).max(10000000000),
  clicks: z.coerce.number().int().min(0).max(10000000000),
  providerAttributedOrders: z.coerce.number().int().min(0).max(100000000),
  providerPlacedRevenue: z.coerce.number().min(0).max(100000000000),
  providerDeliveredRevenue: z.coerce.number().min(0).max(100000000000),
  attributionStatus: z.enum(["known", "unknown"]).default("unknown")
});

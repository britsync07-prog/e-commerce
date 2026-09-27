import { z } from "zod";

export const shopParamsSchema = z.object({ shopId: z.string().uuid() });
export const connectionParamsSchema = z.object({ shopId: z.string().uuid(), connectionId: z.string().uuid() });
export const createConnectionSchema = z.object({
  pageId: z.string().trim().min(1).max(120).optional(),
  instagramAccountId: z.string().trim().min(1).max(120).optional(),
  credentialRef: z.string().trim().min(1).max(500),
  settings: z.record(z.unknown()).optional()
}).superRefine((value, context) => {
  if (!value.pageId && !value.instagramAccountId) context.addIssue({ code: z.ZodIssueCode.custom, message: "pageId or instagramAccountId is required" });
});
export const updateConnectionSchema = z.object({ status: z.enum(["active", "disabled", "error"]) });

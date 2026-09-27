import { z } from "zod";

export const shopParamsSchema = z.object({ shopId: z.string().uuid() });
export const commandParamsSchema = z.object({ shopId: z.string().uuid(), commandId: z.string().uuid() });
export const createCommandSchema = z.object({ prompt: z.string().trim().min(3).max(4000), actionType: z.enum(["question", "draft", "action"]).default("question") });
export const approveCommandSchema = z.object({ reason: z.string().trim().min(3).max(500) });

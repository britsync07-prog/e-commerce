import type { FastifyInstance } from "fastify";
import { ZodError, type ZodTypeAny } from "zod";
import { AuthError } from "../auth/auth.service.js";
import { PermissionError, requireShopPermission } from "../../shared/permissions.js";
import { AiCommandError, approveCommand, createCommand, listCommands } from "./ai.service.js";
import { approveCommandSchema, commandParamsSchema, createCommandSchema, shopParamsSchema } from "./ai.validators.js";

function parse<T extends ZodTypeAny>(schema: T, value: unknown) { return schema.parse(value) as T["_output"]; }
function handleError(error: unknown) {
  if (error instanceof AiCommandError || error instanceof PermissionError || error instanceof AuthError) return { statusCode: error.statusCode, body: { code: error.code, message: error.message } };
  if (error instanceof ZodError) return { statusCode: 400, body: { code: "VALIDATION_ERROR", message: "Request validation failed.", issues: error.issues } };
  throw error;
}

export async function registerAiRoutes(app: FastifyInstance) {
  app.post("/shops/:shopId/commands", async (request, reply) => {
    try { const params = parse(shopParamsSchema, request.params); const body = parse(createCommandSchema, request.body); const classification = body.actionType === "question" ? "orders:read" : body.actionType === "draft" ? "marketing:write" : /refund|mark paid|payment/i.test(body.prompt) ? "payments:write" : /cancel|delete|remove|return|order/i.test(body.prompt) ? "orders:write" : /send|broadcast|message|campaign/i.test(body.prompt) ? "marketing:write" : "settings:write"; const session = await requireShopPermission(request, params.shopId, classification as Parameters<typeof requireShopPermission>[2]); return reply.code(201).send(await createCommand(params.shopId, session.user.id as string, body)); }
    catch (error) { const result = handleError(error); return reply.code(result.statusCode).send(result.body); }
  });
  app.get("/shops/:shopId/commands", async (request, reply) => {
    try { const params = parse(shopParamsSchema, request.params); await requireShopPermission(request, params.shopId, "orders:read"); return listCommands(params.shopId); }
    catch (error) { const result = handleError(error); return reply.code(result.statusCode).send(result.body); }
  });
  app.post("/shops/:shopId/commands/:commandId/approve", async (request, reply) => {
    try { const params = parse(commandParamsSchema, request.params); const body = parse(approveCommandSchema, request.body); const session = await requireShopPermission(request, params.shopId, "settings:write"); return approveCommand(params.shopId, params.commandId, session.user.id as string, body.reason); }
    catch (error) { const result = handleError(error); return reply.code(result.statusCode).send(result.body); }
  });
}

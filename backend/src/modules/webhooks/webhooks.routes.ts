import type { FastifyInstance } from "fastify";
import { ZodError } from "zod";
import { MetaError, ingestWebhook, verifyWebhook } from "../meta/meta.service.js";
import { shopParamsSchema } from "../meta/meta.validators.js";

function handleError(error: unknown) {
  if (error instanceof MetaError) return { statusCode: error.statusCode, body: { code: error.code, message: error.message } };
  if (error instanceof ZodError) return { statusCode: 400, body: { code: "VALIDATION_ERROR", message: "Request validation failed.", issues: error.issues } };
  throw error;
}

export async function registerWebhookRoutes(app: FastifyInstance) {
  app.get("/meta/:shopId", async (request, reply) => {
    try { const params = shopParamsSchema.parse(request.params); const query = request.query as { "hub.mode"?: string; "hub.verify_token"?: string; "hub.challenge"?: string }; return verifyWebhook({ mode: query["hub.mode"], verifyToken: query["hub.verify_token"], challenge: query["hub.challenge"] }); }
    catch (error) { const result = handleError(error); return reply.code(result.statusCode).send(result.body); }
  });
  app.post("/meta/:shopId", async (request, reply) => {
    try { const params = shopParamsSchema.parse(request.params); const headers = request.headers as Record<string, string | undefined>; return ingestWebhook(params.shopId, request.body, headers["x-hub-signature-256"], headers["x-meta-event-id"]); }
    catch (error) { const result = handleError(error); return reply.code(result.statusCode).send(result.body); }
  });
}

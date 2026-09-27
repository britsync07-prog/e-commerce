import type { FastifyInstance } from "fastify";
import { ZodError, type ZodTypeAny } from "zod";
import { AuthError } from "../auth/auth.service.js";
import { PermissionError, requireShopPermission } from "../../shared/permissions.js";
import { enqueueJob, JobsError, listJobs, retryDeadJob } from "./jobs.service.js";
import { enqueueSchema, jobParamsSchema, listQuerySchema, retrySchema, shopParamsSchema } from "./jobs.validators.js";

function parse<T extends ZodTypeAny>(schema: T, value: unknown) { return schema.parse(value) as T["_output"]; }
function handleError(error: unknown) {
  if (error instanceof JobsError || error instanceof PermissionError || error instanceof AuthError) return { statusCode: error.statusCode, body: { code: error.code, message: error.message } };
  if (error instanceof ZodError) return { statusCode: 400, body: { code: "VALIDATION_ERROR", message: "Request validation failed.", issues: error.issues } };
  throw error;
}

export async function registerJobsRoutes(app: FastifyInstance) {
  app.post("/shops/:shopId/jobs", async (request, reply) => {
    try { const params = parse(shopParamsSchema, request.params); const body = parse(enqueueSchema, request.body); const session = await requireShopPermission(request, params.shopId, "settings:write"); return reply.code(201).send(await enqueueJob(params.shopId, body, session.user.id as string)); }
    catch (error) { const result = handleError(error); return reply.code(result.statusCode).send(result.body); }
  });
  app.get("/shops/:shopId/jobs", async (request, reply) => {
    try { const params = parse(shopParamsSchema, request.params); const query = parse(listQuerySchema, request.query); await requireShopPermission(request, params.shopId, "settings:read"); return listJobs(params.shopId, query); }
    catch (error) { const result = handleError(error); return reply.code(result.statusCode).send(result.body); }
  });
  app.post("/shops/:shopId/jobs/:jobId/retry", async (request, reply) => {
    try { const params = parse(jobParamsSchema, request.params); const body = parse(retrySchema, request.body); const session = await requireShopPermission(request, params.shopId, "settings:write"); return retryDeadJob(params.shopId, params.jobId, body.reason, session.user.id as string); }
    catch (error) { const result = handleError(error); return reply.code(result.statusCode).send(result.body); }
  });
}

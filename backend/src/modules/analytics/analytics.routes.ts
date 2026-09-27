import type { FastifyInstance } from "fastify";
import { ZodError, type ZodTypeAny } from "zod";
import { AuthError } from "../auth/auth.service.js";
import { PermissionError, requireShopPermission } from "../../shared/permissions.js";
import { getDashboardMetrics } from "./analytics.service.js";
import { metricsParamsSchema, metricsQuerySchema } from "./analytics.validators.js";

function parse<T extends ZodTypeAny>(schema: T, value: unknown) { return schema.parse(value) as T["_output"]; }
function handleError(error: unknown) {
  if (error instanceof PermissionError || error instanceof AuthError) return { statusCode: error.statusCode, body: { code: error.code, message: error.message } };
  if (error instanceof ZodError) return { statusCode: 400, body: { code: "VALIDATION_ERROR", message: "Request validation failed.", issues: error.issues } };
  throw error;
}

export async function registerAnalyticsRoutes(app: FastifyInstance) {
  app.get("/shops/:shopId/metrics", async (request, reply) => {
    try {
      const params = parse(metricsParamsSchema, request.params);
      const query = parse(metricsQuerySchema, request.query);
      await requireShopPermission(request, params.shopId, "orders:read");
      return getDashboardMetrics(params.shopId, query);
    } catch (error) {
      const result = handleError(error);
      return reply.code(result.statusCode).send(result.body);
    }
  });
}

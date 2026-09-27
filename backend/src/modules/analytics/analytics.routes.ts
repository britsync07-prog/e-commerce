import type { FastifyInstance } from "fastify";
import { ZodError, type ZodTypeAny } from "zod";
import { AuthError } from "../auth/auth.service.js";
import { PermissionError, requireShopPermission } from "../../shared/permissions.js";
import { getDashboardMetrics, getOrderReport, listAnalyticsEvents } from "./analytics.service.js";
import { eventsQuerySchema, metricsParamsSchema, metricsQuerySchema, reportQuerySchema } from "./analytics.validators.js";

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
  app.get("/shops/:shopId/reports/orders", async (request, reply) => {
    try { const params = parse(metricsParamsSchema, request.params); const query = parse(reportQuerySchema, request.query); const session = await requireShopPermission(request, params.shopId, query.format === "csv" ? "exports:run" : "orders:read"); void session; const report = await getOrderReport(params.shopId, query); if (query.format === "csv") return reply.type("text/csv; charset=utf-8").header("content-disposition", "attachment; filename=orders-report.csv").send(report.csv); return report; }
    catch (error) { const result = handleError(error); return reply.code(result.statusCode).send(result.body); }
  });
  app.get("/shops/:shopId/events", async (request, reply) => {
    try { const params = parse(metricsParamsSchema, request.params); const query = parse(eventsQuerySchema, request.query); await requireShopPermission(request, params.shopId, "orders:read"); return listAnalyticsEvents(params.shopId, query); }
    catch (error) { const result = handleError(error); return reply.code(result.statusCode).send(result.body); }
  });
}

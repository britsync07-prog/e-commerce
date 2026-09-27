import type { FastifyInstance } from "fastify";
import { AuthError } from "../auth/auth.service.js";
import { PermissionError, requireShopPermission } from "../../shared/permissions.js";
import { ZodError, type ZodTypeAny } from "zod";
import { getPayment, listPayments, markOrderPaid, PaymentError, refundPayment } from "./payments.service.js";
import { manualPaymentSchema, orderPaymentParamsSchema, paymentListQuerySchema, paymentParamsSchema, refundSchema, shopParamsSchema } from "./payments.validators.js";

function parse<T extends ZodTypeAny>(schema: T, value: unknown) { return schema.parse(value) as T["_output"]; }
function handleError(error: unknown) {
  if (error instanceof PaymentError || error instanceof PermissionError || error instanceof AuthError) return { statusCode: error.statusCode, body: { code: error.code, message: error.message } };
  if (error instanceof ZodError) return { statusCode: 400, body: { code: "VALIDATION_ERROR", message: "Request validation failed.", issues: error.issues } };
  throw error;
}

export async function registerPaymentRoutes(app: FastifyInstance) {
  app.get("/shops/:shopId/payments", async (request, reply) => {
    try { const params = parse(shopParamsSchema, request.params); const query = parse(paymentListQuerySchema, request.query); await requireShopPermission(request, params.shopId, "payments:read"); return listPayments(params.shopId, query); }
    catch (error) { const result = handleError(error); return reply.code(result.statusCode).send(result.body); }
  });
  app.get("/shops/:shopId/payments/:paymentId", async (request, reply) => {
    try { const params = parse(paymentParamsSchema, request.params); await requireShopPermission(request, params.shopId, "payments:read"); return getPayment(params.shopId, params.paymentId); }
    catch (error) { const result = handleError(error); return reply.code(result.statusCode).send(result.body); }
  });
  app.post("/shops/:shopId/orders/:orderId/payments/manual", async (request, reply) => {
    try { const params = parse(orderPaymentParamsSchema, request.params); const body = parse(manualPaymentSchema, request.body); const session = await requireShopPermission(request, params.shopId, "payments:write"); return reply.code(201).send(await markOrderPaid(params.shopId, params.orderId, body, session.user.id as string)); }
    catch (error) { const result = handleError(error); return reply.code(result.statusCode).send(result.body); }
  });
  app.post("/shops/:shopId/payments/:paymentId/refund", async (request, reply) => {
    try { const params = parse(paymentParamsSchema, request.params); const body = parse(refundSchema, request.body); const session = await requireShopPermission(request, params.shopId, "payments:write"); return refundPayment(params.shopId, params.paymentId, body, session.user.id as string); }
    catch (error) { const result = handleError(error); return reply.code(result.statusCode).send(result.body); }
  });
}

import type { FastifyInstance } from "fastify";
import { ZodError, type ZodTypeAny } from "zod";
import { AuthError } from "../auth/auth.service.js";
import { PermissionError, requireShopPermission } from "../../shared/permissions.js";
import { getOrderForBuyer, getOrderForStaff, listOrders, OrderError, submitCheckout, updateOrderStatus } from "./orders.service.js";
import { checkoutSchema, orderListParamsSchema, orderListQuerySchema, orderParamsSchema, trackSchema, updateStatusSchema } from "./orders.validators.js";

function parse<T extends ZodTypeAny>(schema: T, value: unknown) {
  return schema.parse(value) as T["_output"];
}

function handleError(error: unknown) {
  if (error instanceof OrderError) return { statusCode: error.statusCode, body: { code: error.code, message: error.message } };
  if (error instanceof PermissionError || error instanceof AuthError) return { statusCode: error.statusCode, body: { code: error.code, message: error.message } };
  if (error instanceof ZodError) return { statusCode: 400, body: { code: "VALIDATION_ERROR", message: "Request validation failed.", issues: error.issues } };
  throw error;
}

export async function registerOrderRoutes(app: FastifyInstance) {
  app.post("/checkout", async (request, reply) => {
    try {
      const body = parse(checkoutSchema, request.body);
      return reply.code(201).send(await submitCheckout(body));
    } catch (error) {
      const result = handleError(error);
      return reply.code(result.statusCode).send(result.body);
    }
  });

  app.get("/track", async (request, reply) => {
    try {
      const query = parse(trackSchema, request.query);
      return getOrderForBuyer(query.orderId, query.phone);
    } catch (error) {
      const result = handleError(error);
      return reply.code(result.statusCode).send(result.body);
    }
  });

  app.get("/shops/:shopId/orders", async (request, reply) => {
    try {
      const params = parse(orderListParamsSchema, request.params);
      const query = parse(orderListQuerySchema, request.query);
      await requireShopPermission(request, params.shopId, "orders:read");
      return listOrders(params.shopId, query);
    } catch (error) {
      const result = handleError(error);
      return reply.code(result.statusCode).send(result.body);
    }
  });

  app.get("/shops/:shopId/orders/:orderId", async (request, reply) => {
    try {
      const params = parse(orderParamsSchema, request.params);
      await requireShopPermission(request, params.shopId, "orders:read");
      return getOrderForStaff(params.shopId, params.orderId);
    } catch (error) {
      const result = handleError(error);
      return reply.code(result.statusCode).send(result.body);
    }
  });

  app.patch("/shops/:shopId/orders/:orderId/status", async (request, reply) => {
    try {
      const params = parse(orderParamsSchema, request.params);
      const body = parse(updateStatusSchema, request.body);
      const session = await requireShopPermission(request, params.shopId, "orders:write");
      return updateOrderStatus(params.shopId, params.orderId, body, session.user.id as string);
    } catch (error) {
      const result = handleError(error);
      return reply.code(result.statusCode).send(result.body);
    }
  });
}

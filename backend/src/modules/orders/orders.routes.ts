import type { FastifyInstance } from "fastify";
import { ZodError, type ZodTypeAny } from "zod";
import { AuthError } from "../auth/auth.service.js";
import { PermissionError, requireShopPermission } from "../../shared/permissions.js";
import {
  bulkBookOrders,
  bulkExportOrdersCsv,
  bulkPreviewOrders,
  confirmOrderDraft,
  confirmCheckoutLink,
  createCheckoutLink,
  createOrderDraft,
  createOrderDraftFromMessage,
  getOrderDraft,
  getCheckoutLinkDraft,
  getOrderForBuyer,
  getOrderForStaff,
  listOrderIssues,
  listOrderDrafts,
  listOrders,
  OrderError,
  submitCheckout,
  updateOrderDraftFromCheckoutLink,
  updateOrderDraft,
  updateOrderStatus
} from "./orders.service.js";
import {
  checkoutSchema,
  checkoutLinkParamsSchema,
  createCheckoutLinkSchema,
  createOrderDraftSchema,
  extractOrderDraftSchema,
  orderBulkBookSchema,
  orderBulkPreviewSchema,
  orderDraftListQuerySchema,
  orderDraftParamsSchema,
  orderIssueListQuerySchema,
  orderListParamsSchema,
  orderListQuerySchema,
  orderParamsSchema,
  trackSchema,
  updateCheckoutLinkDraftSchema,
  updateOrderDraftSchema,
  updateStatusSchema
} from "./orders.validators.js";

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
      const idempotencyKey = request.headers["idempotency-key"];
      return reply.code(201).send(await submitCheckout(body, typeof idempotencyKey === "string" ? idempotencyKey : undefined));
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

  app.get("/checkout-links/:token", async (request, reply) => {
    try {
      const params = parse(checkoutLinkParamsSchema, request.params);
      return getCheckoutLinkDraft(params.token);
    } catch (error) {
      const result = handleError(error);
      return reply.code(result.statusCode).send(result.body);
    }
  });

  app.patch("/checkout-links/:token", async (request, reply) => {
    try {
      const params = parse(checkoutLinkParamsSchema, request.params);
      const body = parse(updateCheckoutLinkDraftSchema, request.body);
      return updateOrderDraftFromCheckoutLink(params.token, body);
    } catch (error) {
      const result = handleError(error);
      return reply.code(result.statusCode).send(result.body);
    }
  });

  app.post("/checkout-links/:token/confirm", async (request, reply) => {
    try {
      const params = parse(checkoutLinkParamsSchema, request.params);
      return reply.code(201).send(await confirmCheckoutLink(params.token));
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

  app.get("/shops/:shopId/issues", async (request, reply) => {
    try {
      const params = parse(orderListParamsSchema, request.params);
      const query = parse(orderIssueListQuerySchema, request.query);
      await requireShopPermission(request, params.shopId, "orders:read");
      return listOrderIssues(params.shopId, query);
    } catch (error) {
      const result = handleError(error);
      return reply.code(result.statusCode).send(result.body);
    }
  });

  app.post("/shops/:shopId/orders/bulk/preview", async (request, reply) => {
    try {
      const params = parse(orderListParamsSchema, request.params);
      const body = parse(orderBulkPreviewSchema, request.body);
      await requireShopPermission(request, params.shopId, "orders:read");
      return bulkPreviewOrders(params.shopId, body);
    } catch (error) {
      const result = handleError(error);
      return reply.code(result.statusCode).send(result.body);
    }
  });

  app.post("/shops/:shopId/orders/bulk/export", async (request, reply) => {
    try {
      const params = parse(orderListParamsSchema, request.params);
      const body = parse(orderBulkPreviewSchema, request.body);
      await requireShopPermission(request, params.shopId, "exports:run");
      const result = await bulkExportOrdersCsv(params.shopId, body.orderIds);
      return reply.type("text/csv; charset=utf-8").header("content-disposition", "attachment; filename=orders-bulk-export.csv").send(result.csv);
    } catch (error) {
      const result = handleError(error);
      return reply.code(result.statusCode).send(result.body);
    }
  });

  app.post("/shops/:shopId/orders/bulk/book", async (request, reply) => {
    try {
      const params = parse(orderListParamsSchema, request.params);
      const body = parse(orderBulkBookSchema, request.body);
      const session = await requireShopPermission(request, params.shopId, "delivery:write");
      return bulkBookOrders(params.shopId, body, session.user.id as string);
    } catch (error) {
      const result = handleError(error);
      return reply.code(result.statusCode).send(result.body);
    }
  });

  app.get("/shops/:shopId/drafts", async (request, reply) => {
    try {
      const params = parse(orderListParamsSchema, request.params);
      const query = parse(orderDraftListQuerySchema, request.query);
      await requireShopPermission(request, params.shopId, "orders:read");
      return listOrderDrafts(params.shopId, query);
    } catch (error) {
      const result = handleError(error);
      return reply.code(result.statusCode).send(result.body);
    }
  });

  app.post("/shops/:shopId/drafts", async (request, reply) => {
    try {
      const params = parse(orderListParamsSchema, request.params);
      const body = parse(createOrderDraftSchema, request.body);
      const session = await requireShopPermission(request, params.shopId, "orders:write");
      return reply.code(201).send(await createOrderDraft(params.shopId, body, session.user.id as string));
    } catch (error) {
      const result = handleError(error);
      return reply.code(result.statusCode).send(result.body);
    }
  });

  app.post("/shops/:shopId/drafts/extract", async (request, reply) => {
    try {
      const params = parse(orderListParamsSchema, request.params);
      const body = parse(extractOrderDraftSchema, request.body);
      const session = await requireShopPermission(request, params.shopId, "orders:write");
      return reply.code(201).send(await createOrderDraftFromMessage(params.shopId, body, session.user.id as string));
    } catch (error) {
      const result = handleError(error);
      return reply.code(result.statusCode).send(result.body);
    }
  });

  app.get("/shops/:shopId/drafts/:draftId", async (request, reply) => {
    try {
      const params = parse(orderDraftParamsSchema, request.params);
      await requireShopPermission(request, params.shopId, "orders:read");
      return getOrderDraft(params.shopId, params.draftId);
    } catch (error) {
      const result = handleError(error);
      return reply.code(result.statusCode).send(result.body);
    }
  });

  app.patch("/shops/:shopId/drafts/:draftId", async (request, reply) => {
    try {
      const params = parse(orderDraftParamsSchema, request.params);
      const body = parse(updateOrderDraftSchema, request.body);
      const session = await requireShopPermission(request, params.shopId, "orders:write");
      return updateOrderDraft(params.shopId, params.draftId, body, session.user.id as string);
    } catch (error) {
      const result = handleError(error);
      return reply.code(result.statusCode).send(result.body);
    }
  });

  app.post("/shops/:shopId/drafts/:draftId/confirm", async (request, reply) => {
    try {
      const params = parse(orderDraftParamsSchema, request.params);
      const session = await requireShopPermission(request, params.shopId, "orders:write");
      return reply.code(201).send(await confirmOrderDraft(params.shopId, params.draftId, session.user.id as string));
    } catch (error) {
      const result = handleError(error);
      return reply.code(result.statusCode).send(result.body);
    }
  });

  app.post("/shops/:shopId/drafts/:draftId/checkout-link", async (request, reply) => {
    try {
      const params = parse(orderDraftParamsSchema, request.params);
      const body = parse(createCheckoutLinkSchema, request.body);
      const session = await requireShopPermission(request, params.shopId, "orders:write");
      return reply.code(201).send(await createCheckoutLink(params.shopId, params.draftId, body, session.user.id as string));
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

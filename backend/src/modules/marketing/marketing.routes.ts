import type { FastifyInstance } from "fastify";
import { ZodError, type ZodTypeAny } from "zod";
import { AuthError } from "../auth/auth.service.js";
import { PermissionError, requireShopPermission } from "../../shared/permissions.js";
import { approveBroadcast, createBroadcast, createCoupon, createSegment, listBroadcasts, listCoupons, listSegments, MarketingError, previewBroadcast, previewSegment, updateCoupon } from "./marketing.service.js";
import { approvalSchema, broadcastParamsSchema, couponListQuerySchema, couponParamsSchema, createBroadcastSchema, createCouponSchema, createSegmentSchema, segmentParamsSchema, shopParamsSchema, updateCouponSchema } from "./marketing.validators.js";

function parse<T extends ZodTypeAny>(schema: T, value: unknown) { return schema.parse(value) as T["_output"]; }
function handleError(error: unknown) {
  if (error instanceof MarketingError || error instanceof PermissionError || error instanceof AuthError) return { statusCode: error.statusCode, body: { code: error.code, message: error.message } };
  if (error instanceof ZodError) return { statusCode: 400, body: { code: "VALIDATION_ERROR", message: "Request validation failed.", issues: error.issues } };
  throw error;
}

export async function registerMarketingRoutes(app: FastifyInstance) {
  app.get("/shops/:shopId/broadcasts", async (request, reply) => {
    try { const params = parse(shopParamsSchema, request.params); await requireShopPermission(request, params.shopId, "marketing:read"); return listBroadcasts(params.shopId); }
    catch (error) { const result = handleError(error); return reply.code(result.statusCode).send(result.body); }
  });
  app.post("/shops/:shopId/broadcasts", async (request, reply) => {
    try { const params = parse(shopParamsSchema, request.params); const body = parse(createBroadcastSchema, request.body); const session = await requireShopPermission(request, params.shopId, "marketing:write"); return reply.code(201).send(await createBroadcast(params.shopId, body, session.user.id as string)); }
    catch (error) { const result = handleError(error); return reply.code(result.statusCode).send(result.body); }
  });
  app.post("/shops/:shopId/broadcasts/:broadcastId/preview", async (request, reply) => {
    try { const params = parse(broadcastParamsSchema, request.params); await requireShopPermission(request, params.shopId, "marketing:read"); return previewBroadcast(params.shopId, params.broadcastId); }
    catch (error) { const result = handleError(error); return reply.code(result.statusCode).send(result.body); }
  });
  app.post("/shops/:shopId/broadcasts/:broadcastId/approve", async (request, reply) => {
    try { const params = parse(broadcastParamsSchema, request.params); const body = parse(approvalSchema, request.body); const session = await requireShopPermission(request, params.shopId, "marketing:write"); return approveBroadcast(params.shopId, params.broadcastId, body.reason, session.user.id as string); }
    catch (error) { const result = handleError(error); return reply.code(result.statusCode).send(result.body); }
  });
  app.get("/shops/:shopId/coupons", async (request, reply) => {
    try { const params = parse(shopParamsSchema, request.params); const query = parse(couponListQuerySchema, request.query); await requireShopPermission(request, params.shopId, "marketing:read"); return listCoupons(params.shopId, query); }
    catch (error) { const result = handleError(error); return reply.code(result.statusCode).send(result.body); }
  });
  app.post("/shops/:shopId/coupons", async (request, reply) => {
    try { const params = parse(shopParamsSchema, request.params); const body = parse(createCouponSchema, request.body); const session = await requireShopPermission(request, params.shopId, "marketing:write"); return reply.code(201).send(await createCoupon(params.shopId, body, session.user.id as string)); }
    catch (error) { const result = handleError(error); return reply.code(result.statusCode).send(result.body); }
  });
  app.patch("/shops/:shopId/coupons/:couponId", async (request, reply) => {
    try { const params = parse(couponParamsSchema, request.params); const body = parse(updateCouponSchema, request.body); const session = await requireShopPermission(request, params.shopId, "marketing:write"); return updateCoupon(params.shopId, params.couponId, body.status, session.user.id as string); }
    catch (error) { const result = handleError(error); return reply.code(result.statusCode).send(result.body); }
  });
  app.get("/shops/:shopId/segments", async (request, reply) => {
    try { const params = parse(shopParamsSchema, request.params); await requireShopPermission(request, params.shopId, "marketing:read"); return listSegments(params.shopId); }
    catch (error) { const result = handleError(error); return reply.code(result.statusCode).send(result.body); }
  });
  app.post("/shops/:shopId/segments", async (request, reply) => {
    try { const params = parse(shopParamsSchema, request.params); const body = parse(createSegmentSchema, request.body); const session = await requireShopPermission(request, params.shopId, "marketing:write"); return reply.code(201).send(await createSegment(params.shopId, body, session.user.id as string)); }
    catch (error) { const result = handleError(error); return reply.code(result.statusCode).send(result.body); }
  });
  app.post("/shops/:shopId/segments/:segmentId/preview", async (request, reply) => {
    try { const params = parse(segmentParamsSchema, request.params); await requireShopPermission(request, params.shopId, "marketing:read"); return previewSegment(params.shopId, params.segmentId); }
    catch (error) { const result = handleError(error); return reply.code(result.statusCode).send(result.body); }
  });
}

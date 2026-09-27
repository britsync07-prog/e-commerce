import type { FastifyInstance } from "fastify";
import { ZodError, type ZodTypeAny } from "zod";
import { AuthError } from "../auth/auth.service.js";
import { PermissionError, requireShopPermission } from "../../shared/permissions.js";
import { createManualShipment, DeliveryError, getShipment, listShipments, updateShipmentStatus } from "./delivery.service.js";
import { listShipmentsQuerySchema, manualShipmentSchema, shipmentParamsSchema, shipmentStatusSchema, shopParamsSchema } from "./delivery.validators.js";

function parse<T extends ZodTypeAny>(schema: T, value: unknown) {
  return schema.parse(value) as T["_output"];
}

function handleError(error: unknown) {
  if (error instanceof DeliveryError) return { statusCode: error.statusCode, body: { code: error.code, message: error.message } };
  if (error instanceof PermissionError || error instanceof AuthError) return { statusCode: error.statusCode, body: { code: error.code, message: error.message } };
  if (error instanceof ZodError) return { statusCode: 400, body: { code: "VALIDATION_ERROR", message: "Request validation failed.", issues: error.issues } };
  throw error;
}

export async function registerDeliveryRoutes(app: FastifyInstance) {
  app.get("/shops/:shopId/shipments", async (request, reply) => {
    try {
      const params = parse(shopParamsSchema, request.params);
      const query = parse(listShipmentsQuerySchema, request.query);
      await requireShopPermission(request, params.shopId, "delivery:read");
      return listShipments(params.shopId, query);
    } catch (error) {
      const result = handleError(error);
      return reply.code(result.statusCode).send(result.body);
    }
  });

  app.post("/shops/:shopId/shipments/manual", async (request, reply) => {
    try {
      const params = parse(shopParamsSchema, request.params);
      const body = parse(manualShipmentSchema, request.body);
      const session = await requireShopPermission(request, params.shopId, "delivery:write");
      return reply.code(201).send(await createManualShipment(params.shopId, body, session.user.id as string));
    } catch (error) {
      const result = handleError(error);
      return reply.code(result.statusCode).send(result.body);
    }
  });

  app.get("/shops/:shopId/shipments/:shipmentId", async (request, reply) => {
    try {
      const params = parse(shipmentParamsSchema, request.params);
      await requireShopPermission(request, params.shopId, "delivery:read");
      return getShipment(params.shopId, params.shipmentId);
    } catch (error) {
      const result = handleError(error);
      return reply.code(result.statusCode).send(result.body);
    }
  });

  app.patch("/shops/:shopId/shipments/:shipmentId/status", async (request, reply) => {
    try {
      const params = parse(shipmentParamsSchema, request.params);
      const body = parse(shipmentStatusSchema, request.body);
      const session = await requireShopPermission(request, params.shopId, "delivery:write");
      return updateShipmentStatus(params.shopId, params.shipmentId, body, session.user.id as string);
    } catch (error) {
      const result = handleError(error);
      return reply.code(result.statusCode).send(result.body);
    }
  });
}

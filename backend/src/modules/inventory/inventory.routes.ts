import type { FastifyInstance } from "fastify";
import { ZodError, type ZodTypeAny } from "zod";
import { adjustStock, getStock, InventoryError } from "./inventory.service.js";
import { adjustInventorySchema, variantParamsSchema } from "./inventory.validators.js";

function parse<T extends ZodTypeAny>(schema: T, value: unknown) {
  return schema.parse(value) as T["_output"];
}

function handleError(error: unknown) {
  if (error instanceof InventoryError) return { statusCode: error.statusCode, body: { code: error.code, message: error.message } };
  if (error instanceof ZodError) return { statusCode: 400, body: { code: "VALIDATION_ERROR", message: "Request validation failed.", issues: error.issues } };
  throw error;
}

export async function registerInventoryRoutes(app: FastifyInstance) {
  app.get("/shops/:shopId/variants/:variantId/stock", async (request, reply) => {
    try {
      const params = parse(variantParamsSchema, request.params);
      return getStock(params.shopId, params.variantId);
    } catch (error) {
      const result = handleError(error);
      return reply.code(result.statusCode).send(result.body);
    }
  });

  app.post("/shops/:shopId/variants/:variantId/adjustments", async (request, reply) => {
    try {
      const params = parse(variantParamsSchema, request.params);
      const body = parse(adjustInventorySchema, request.body);
      return reply.code(201).send(await adjustStock(params.shopId, params.variantId, body));
    } catch (error) {
      const result = handleError(error);
      return reply.code(result.statusCode).send(result.body);
    }
  });
}


import type { FastifyInstance } from "fastify";
import { ZodError, type ZodTypeAny } from "zod";
import { PermissionError, requireShopPermission } from "../../shared/permissions.js";
import { AuthError } from "../auth/auth.service.js";
import { CatalogError, createProduct, createVariant, getProduct, listProducts, updateProduct, updateVariant } from "./catalog.service.js";
import { createProductSchema, createVariantSchema, productParamsSchema, shopParamsSchema, updateProductSchema, updateVariantSchema, variantParamsSchema } from "./catalog.validators.js";

function parse<T extends ZodTypeAny>(schema: T, value: unknown) {
  return schema.parse(value) as T["_output"];
}

function handleError(error: unknown) {
  if (error instanceof CatalogError) return { statusCode: error.statusCode, body: { code: error.code, message: error.message } };
  if (error instanceof PermissionError || error instanceof AuthError) return { statusCode: error.statusCode, body: { code: error.code, message: error.message } };
  if (error instanceof ZodError) return { statusCode: 400, body: { code: "VALIDATION_ERROR", message: "Request validation failed.", issues: error.issues } };
  throw error;
}

export async function registerCatalogRoutes(app: FastifyInstance) {
  app.post("/shops/:shopId/products", async (request, reply) => {
    try {
      const params = parse(shopParamsSchema, request.params);
      await requireShopPermission(request, params.shopId, "catalog:write");
      const body = parse(createProductSchema, request.body);
      return reply.code(201).send(await createProduct(params.shopId, body));
    } catch (error) {
      const result = handleError(error);
      return reply.code(result.statusCode).send(result.body);
    }
  });

  app.get("/shops/:shopId/products", async (request, reply) => {
    try {
      const params = parse(shopParamsSchema, request.params);
      await requireShopPermission(request, params.shopId, "catalog:read");
      return listProducts(params.shopId);
    } catch (error) {
      const result = handleError(error);
      return reply.code(result.statusCode).send(result.body);
    }
  });

  app.get("/shops/:shopId/products/:productId", async (request, reply) => {
    try {
      const params = parse(productParamsSchema, request.params);
      await requireShopPermission(request, params.shopId, "catalog:read");
      return getProduct(params.shopId, params.productId);
    } catch (error) {
      const result = handleError(error);
      return reply.code(result.statusCode).send(result.body);
    }
  });

  app.patch("/shops/:shopId/products/:productId", async (request, reply) => {
    try {
      const params = parse(productParamsSchema, request.params);
      const body = parse(updateProductSchema, request.body);
      const session = await requireShopPermission(request, params.shopId, "catalog:write");
      return updateProduct(params.shopId, params.productId, body, session.user.id as string);
    } catch (error) {
      const result = handleError(error);
      return reply.code(result.statusCode).send(result.body);
    }
  });

  app.post("/shops/:shopId/products/:productId/variants", async (request, reply) => {
    try {
      const params = parse(productParamsSchema, request.params);
      const body = parse(createVariantSchema, request.body);
      const session = await requireShopPermission(request, params.shopId, "catalog:write");
      return reply.code(201).send(await createVariant(params.shopId, params.productId, body, session.user.id as string));
    } catch (error) {
      const result = handleError(error);
      return reply.code(result.statusCode).send(result.body);
    }
  });

  app.patch("/shops/:shopId/products/:productId/variants/:variantId", async (request, reply) => {
    try {
      const params = parse(variantParamsSchema, request.params);
      const body = parse(updateVariantSchema, request.body);
      const session = await requireShopPermission(request, params.shopId, "catalog:write");
      return updateVariant(params.shopId, params.productId, params.variantId, body, session.user.id as string);
    } catch (error) {
      const result = handleError(error);
      return reply.code(result.statusCode).send(result.body);
    }
  });
}

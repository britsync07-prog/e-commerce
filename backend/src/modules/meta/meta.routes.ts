import type { FastifyInstance } from "fastify";
import { ZodError, type ZodTypeAny } from "zod";
import { AuthError } from "../auth/auth.service.js";
import { PermissionError, requireShopPermission } from "../../shared/permissions.js";
import { createConnection, getCatalogSync, listConnections, MetaError, previewCatalog, saveCatalogSync, updateConnection } from "./meta.service.js";
import { catalogSyncSchema, connectionParamsSchema, createConnectionSchema, shopParamsSchema, updateConnectionSchema } from "./meta.validators.js";

function parse<T extends ZodTypeAny>(schema: T, value: unknown) { return schema.parse(value) as T["_output"]; }
function handleError(error: unknown) {
  if (error instanceof MetaError || error instanceof PermissionError || error instanceof AuthError) return { statusCode: error.statusCode, body: { code: error.code, message: error.message } };
  if (error instanceof ZodError) return { statusCode: 400, body: { code: "VALIDATION_ERROR", message: "Request validation failed.", issues: error.issues } };
  throw error;
}

export async function registerMetaRoutes(app: FastifyInstance) {
  app.get("/shops/:shopId/connections", async (request, reply) => {
    try { const params = parse(shopParamsSchema, request.params); await requireShopPermission(request, params.shopId, "settings:read"); return listConnections(params.shopId); }
    catch (error) { const result = handleError(error); return reply.code(result.statusCode).send(result.body); }
  });
  app.post("/shops/:shopId/connections", async (request, reply) => {
    try { const params = parse(shopParamsSchema, request.params); const body = parse(createConnectionSchema, request.body); const session = await requireShopPermission(request, params.shopId, "settings:write"); return reply.code(201).send(await createConnection(params.shopId, body, session.user.id as string)); }
    catch (error) { const result = handleError(error); return reply.code(result.statusCode).send(result.body); }
  });
  app.patch("/shops/:shopId/connections/:connectionId", async (request, reply) => {
    try { const params = parse(connectionParamsSchema, request.params); const body = parse(updateConnectionSchema, request.body); const session = await requireShopPermission(request, params.shopId, "settings:write"); return updateConnection(params.shopId, params.connectionId, body.status, session.user.id as string); }
    catch (error) { const result = handleError(error); return reply.code(result.statusCode).send(result.body); }
  });
  app.get("/shops/:shopId/catalog-sync", async (request, reply) => {
    try { const params = parse(shopParamsSchema, request.params); await requireShopPermission(request, params.shopId, "settings:read"); return getCatalogSync(params.shopId); }
    catch (error) { const result = handleError(error); return reply.code(result.statusCode).send(result.body); }
  });
  app.put("/shops/:shopId/catalog-sync", async (request, reply) => {
    try { const params = parse(shopParamsSchema, request.params); const body = parse(catalogSyncSchema, request.body); const session = await requireShopPermission(request, params.shopId, "settings:write"); return saveCatalogSync(params.shopId, body, session.user.id as string); }
    catch (error) { const result = handleError(error); return reply.code(result.statusCode).send(result.body); }
  });
  app.post("/shops/:shopId/catalog-sync/preview", async (request, reply) => {
    try { const params = parse(shopParamsSchema, request.params); const body = parse(catalogSyncSchema.pick({ skipUnpublished: true, skipOutOfStock: true }), request.body); await requireShopPermission(request, params.shopId, "settings:read"); return previewCatalog(params.shopId, body); }
    catch (error) { const result = handleError(error); return reply.code(result.statusCode).send(result.body); }
  });
}

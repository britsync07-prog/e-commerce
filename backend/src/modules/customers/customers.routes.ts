import type { FastifyInstance } from "fastify";
import { ZodError, type ZodTypeAny } from "zod";
import { AuthError } from "../auth/auth.service.js";
import { PermissionError, requireShopPermission } from "../../shared/permissions.js";
import { addTag, CustomerError, getCustomer, listCustomers, mergeCustomers, previewMerge, updateConsent } from "./customers.service.js";
import { consentSchema, customerListQuerySchema, customerParamsSchema, mergeApplySchema, mergePairSchema, shopParamsSchema, tagSchema } from "./customers.validators.js";

function parse<T extends ZodTypeAny>(schema: T, value: unknown) { return schema.parse(value) as T["_output"]; }
function handleError(error: unknown) {
  if (error instanceof CustomerError || error instanceof PermissionError || error instanceof AuthError) return { statusCode: error.statusCode, body: { code: error.code, message: error.message } };
  if (error instanceof ZodError) return { statusCode: 400, body: { code: "VALIDATION_ERROR", message: "Request validation failed.", issues: error.issues } };
  throw error;
}

export async function registerCustomerRoutes(app: FastifyInstance) {
  app.post("/shops/:shopId/customers/merge-preview", async (request, reply) => {
    try { const params = parse(shopParamsSchema, request.params); const body = parse(mergePairSchema, request.body); await requireShopPermission(request, params.shopId, "customers:read"); return previewMerge(params.shopId, body.sourceCustomerId, body.targetCustomerId); }
    catch (error) { const result = handleError(error); return reply.code(result.statusCode).send(result.body); }
  });
  app.post("/shops/:shopId/customers/merge", async (request, reply) => {
    try { const params = parse(shopParamsSchema, request.params); const body = parse(mergeApplySchema, request.body); const session = await requireShopPermission(request, params.shopId, "customers:write"); return mergeCustomers(params.shopId, body.sourceCustomerId, body.targetCustomerId, body.reason, session.user.id as string); }
    catch (error) { const result = handleError(error); return reply.code(result.statusCode).send(result.body); }
  });
  app.get("/shops/:shopId/customers", async (request, reply) => {
    try { const params = parse(shopParamsSchema, request.params); const query = parse(customerListQuerySchema, request.query); await requireShopPermission(request, params.shopId, "customers:read"); return listCustomers(params.shopId, query); }
    catch (error) { const result = handleError(error); return reply.code(result.statusCode).send(result.body); }
  });
  app.get("/shops/:shopId/customers/:customerId", async (request, reply) => {
    try { const params = parse(customerParamsSchema, request.params); await requireShopPermission(request, params.shopId, "customers:read"); return getCustomer(params.shopId, params.customerId); }
    catch (error) { const result = handleError(error); return reply.code(result.statusCode).send(result.body); }
  });
  app.patch("/shops/:shopId/customers/:customerId/consent", async (request, reply) => {
    try { const params = parse(customerParamsSchema, request.params); const body = parse(consentSchema, request.body); const session = await requireShopPermission(request, params.shopId, "customers:write"); return updateConsent(params.shopId, params.customerId, body, session.user.id as string); }
    catch (error) { const result = handleError(error); return reply.code(result.statusCode).send(result.body); }
  });
  app.post("/shops/:shopId/customers/:customerId/tags", async (request, reply) => {
    try { const params = parse(customerParamsSchema, request.params); const body = parse(tagSchema, request.body); const session = await requireShopPermission(request, params.shopId, "customers:write"); return addTag(params.shopId, params.customerId, body.name, session.user.id as string); }
    catch (error) { const result = handleError(error); return reply.code(result.statusCode).send(result.body); }
  });
}

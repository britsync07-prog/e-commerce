import type { FastifyInstance } from "fastify";
import { ZodError, type ZodTypeAny } from "zod";
import { AuthError } from "../auth/auth.service.js";
import { PermissionError, requireShopPermission } from "../../shared/permissions.js";
import { createPrivacyRequest, LegalError, listPolicies, listPrivacyRequests, publicPolicies, recordCookieConsent, updatePrivacyRequest, upsertPolicy } from "./legal.service.js";
import { cookieConsentSchema, policyParamsSchema, policyUpsertSchema, privacyRequestCreateSchema, privacyRequestListQuerySchema, privacyRequestParamsSchema, privacyRequestUpdateSchema, shopParamsSchema, subdomainParamsSchema } from "./legal.validators.js";

function parse<T extends ZodTypeAny>(schema: T, value: unknown) { return schema.parse(value) as T["_output"]; }
function handleError(error: unknown) {
  if (error instanceof LegalError || error instanceof PermissionError || error instanceof AuthError) return { statusCode: error.statusCode, body: { code: error.code, message: error.message } };
  if (error instanceof ZodError) return { statusCode: 400, body: { code: "VALIDATION_ERROR", message: "Request validation failed.", issues: error.issues } };
  throw error;
}

export async function registerLegalRoutes(app: FastifyInstance) {
  app.get("/public/:subdomain/policies", async (request, reply) => {
    try { const params = parse(subdomainParamsSchema, request.params); return publicPolicies(params.subdomain); }
    catch (error) { const result = handleError(error); return reply.code(result.statusCode).send(result.body); }
  });
  app.post("/public/:subdomain/cookie-consents", async (request, reply) => {
    try { const params = parse(subdomainParamsSchema, request.params); const body = parse(cookieConsentSchema, request.body); return reply.code(201).send(await recordCookieConsent(params.subdomain, body, { ipAddress: request.ip, userAgent: request.headers["user-agent"] })); }
    catch (error) { const result = handleError(error); return reply.code(result.statusCode).send(result.body); }
  });
  app.post("/public/:subdomain/privacy-requests", async (request, reply) => {
    try { const params = parse(subdomainParamsSchema, request.params); const body = parse(privacyRequestCreateSchema, request.body); return reply.code(201).send(await createPrivacyRequest(params.subdomain, body)); }
    catch (error) { const result = handleError(error); return reply.code(result.statusCode).send(result.body); }
  });
  app.get("/shops/:shopId/policies", async (request, reply) => {
    try { const params = parse(shopParamsSchema, request.params); await requireShopPermission(request, params.shopId, "legal:read"); return listPolicies(params.shopId); }
    catch (error) { const result = handleError(error); return reply.code(result.statusCode).send(result.body); }
  });
  app.put("/shops/:shopId/policies/:policyType", async (request, reply) => {
    try { const params = parse(policyParamsSchema, request.params); const body = parse(policyUpsertSchema, request.body); const session = await requireShopPermission(request, params.shopId, "legal:write"); return reply.code(201).send(await upsertPolicy(params.shopId, params.policyType, body, session.user.id as string)); }
    catch (error) { const result = handleError(error); return reply.code(result.statusCode).send(result.body); }
  });
  app.get("/shops/:shopId/privacy-requests", async (request, reply) => {
    try { const params = parse(shopParamsSchema, request.params); const query = parse(privacyRequestListQuerySchema, request.query); await requireShopPermission(request, params.shopId, "privacy:read"); return listPrivacyRequests(params.shopId, query); }
    catch (error) { const result = handleError(error); return reply.code(result.statusCode).send(result.body); }
  });
  app.patch("/shops/:shopId/privacy-requests/:requestId", async (request, reply) => {
    try { const params = parse(privacyRequestParamsSchema, request.params); const body = parse(privacyRequestUpdateSchema, request.body); const session = await requireShopPermission(request, params.shopId, "privacy:write"); return updatePrivacyRequest(params.shopId, params.requestId, body, session.user.id as string); }
    catch (error) { const result = handleError(error); return reply.code(result.statusCode).send(result.body); }
  });
}

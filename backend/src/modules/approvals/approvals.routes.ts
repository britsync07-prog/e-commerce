import type { FastifyInstance } from "fastify";
import { ZodError, type ZodTypeAny } from "zod";
import { AuthError } from "../auth/auth.service.js";
import { PermissionError, requireShopPermission } from "../../shared/permissions.js";
import { ApprovalError, approveAndExecute, createApproval, listApprovals, rejectApproval } from "./approvals.service.js";
import { approvalParamsSchema, createApprovalSchema, decisionSchema, listApprovalsQuerySchema, shopParamsSchema } from "./approvals.validators.js";

function parse<T extends ZodTypeAny>(schema: T, value: unknown) { return schema.parse(value) as T["_output"]; }
function handleError(error: unknown) {
  if (error instanceof ApprovalError || error instanceof PermissionError || error instanceof AuthError) return { statusCode: error.statusCode, body: { code: error.code, message: error.message } };
  if (error instanceof ZodError) return { statusCode: 400, body: { code: "VALIDATION_ERROR", message: "Request validation failed.", issues: error.issues } };
  throw error;
}

export async function registerApprovalRoutes(app: FastifyInstance) {
  app.get("/shops/:shopId/approvals", async (request, reply) => {
    try { const params = parse(shopParamsSchema, request.params); const query = parse(listApprovalsQuerySchema, request.query); await requireShopPermission(request, params.shopId, "approvals:read"); return listApprovals(params.shopId, query); }
    catch (error) { const result = handleError(error); return reply.code(result.statusCode).send(result.body); }
  });
  app.post("/shops/:shopId/approvals", async (request, reply) => {
    try { const params = parse(shopParamsSchema, request.params); const body = parse(createApprovalSchema, request.body); const session = await requireShopPermission(request, params.shopId, "approvals:write"); return reply.code(201).send(await createApproval(params.shopId, body, session.user.id as string)); }
    catch (error) { const result = handleError(error); return reply.code(result.statusCode).send(result.body); }
  });
  app.post("/shops/:shopId/approvals/:approvalId/approve", async (request, reply) => {
    try { const params = parse(approvalParamsSchema, request.params); const body = parse(decisionSchema, request.body); const session = await requireShopPermission(request, params.shopId, "approvals:write"); return approveAndExecute(params.shopId, params.approvalId, body.reason, session.user.id as string); }
    catch (error) { const result = handleError(error); return reply.code(result.statusCode).send(result.body); }
  });
  app.post("/shops/:shopId/approvals/:approvalId/reject", async (request, reply) => {
    try { const params = parse(approvalParamsSchema, request.params); const body = parse(decisionSchema, request.body); const session = await requireShopPermission(request, params.shopId, "approvals:write"); return rejectApproval(params.shopId, params.approvalId, body.reason, session.user.id as string); }
    catch (error) { const result = handleError(error); return reply.code(result.statusCode).send(result.body); }
  });
}

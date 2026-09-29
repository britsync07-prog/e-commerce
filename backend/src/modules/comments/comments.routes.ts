import type { FastifyInstance } from "fastify";
import { ZodError, type ZodTypeAny } from "zod";
import { AuthError } from "../auth/auth.service.js";
import { PermissionError, requireShopPermission } from "../../shared/permissions.js";
import { captureComment, CommentsError, createPost, createRule, listLeads, listPosts, listRules, moderateLead, previewComment, updatePost } from "./comments.service.js";
import { captureCommentSchema, createPostSchema, createRuleSchema, leadParamsSchema, listQuerySchema, moderationSchema, postParamsSchema, previewCommentSchema, shopParamsSchema, updatePostSchema } from "./comments.validators.js";

function parse<T extends ZodTypeAny>(schema: T, value: unknown) { return schema.parse(value) as T["_output"]; }
function handleError(error: unknown) {
  if (error instanceof CommentsError || error instanceof PermissionError || error instanceof AuthError) return { statusCode: error.statusCode, body: { code: error.code, message: error.message } };
  if (error instanceof ZodError) return { statusCode: 400, body: { code: "VALIDATION_ERROR", message: "Request validation failed.", issues: error.issues } };
  throw error;
}

export async function registerCommentRoutes(app: FastifyInstance) {
  app.get("/shops/:shopId/posts", async (request, reply) => {
    try { const params = parse(shopParamsSchema, request.params); const query = parse(listQuerySchema, request.query); await requireShopPermission(request, params.shopId, "marketing:read"); return listPosts(params.shopId, query); }
    catch (error) { const result = handleError(error); return reply.code(result.statusCode).send(result.body); }
  });
  app.post("/shops/:shopId/posts", async (request, reply) => {
    try { const params = parse(shopParamsSchema, request.params); const body = parse(createPostSchema, request.body); const session = await requireShopPermission(request, params.shopId, "marketing:write"); return reply.code(201).send(await createPost(params.shopId, body, session.user.id as string)); }
    catch (error) { const result = handleError(error); return reply.code(result.statusCode).send(result.body); }
  });
  app.patch("/shops/:shopId/posts/:postId", async (request, reply) => {
    try { const params = parse(postParamsSchema, request.params); const body = parse(updatePostSchema, request.body); const session = await requireShopPermission(request, params.shopId, "marketing:write"); return updatePost(params.shopId, params.postId, body, session.user.id as string); }
    catch (error) { const result = handleError(error); return reply.code(result.statusCode).send(result.body); }
  });
  app.get("/shops/:shopId/rules", async (request, reply) => {
    try { const params = parse(shopParamsSchema, request.params); const query = parse(listQuerySchema, request.query); await requireShopPermission(request, params.shopId, "marketing:read"); return listRules(params.shopId, query); }
    catch (error) { const result = handleError(error); return reply.code(result.statusCode).send(result.body); }
  });
  app.post("/shops/:shopId/rules", async (request, reply) => {
    try { const params = parse(shopParamsSchema, request.params); const body = parse(createRuleSchema, request.body); const session = await requireShopPermission(request, params.shopId, "marketing:write"); return reply.code(201).send(await createRule(params.shopId, body, session.user.id as string)); }
    catch (error) { const result = handleError(error); return reply.code(result.statusCode).send(result.body); }
  });
  app.post("/shops/:shopId/comments/preview", async (request, reply) => {
    try { const params = parse(shopParamsSchema, request.params); const body = parse(previewCommentSchema, request.body); await requireShopPermission(request, params.shopId, "marketing:read"); return previewComment(params.shopId, body); }
    catch (error) { const result = handleError(error); return reply.code(result.statusCode).send(result.body); }
  });
  app.post("/shops/:shopId/comments/capture", async (request, reply) => {
    try { const params = parse(shopParamsSchema, request.params); const body = parse(captureCommentSchema, request.body); const session = await requireShopPermission(request, params.shopId, "marketing:write"); return reply.code(201).send(await captureComment(params.shopId, body, session.user.id as string)); }
    catch (error) { const result = handleError(error); return reply.code(result.statusCode).send(result.body); }
  });
  app.get("/shops/:shopId/leads", async (request, reply) => {
    try { const params = parse(shopParamsSchema, request.params); const query = parse(listQuerySchema, request.query); await requireShopPermission(request, params.shopId, "marketing:read"); return listLeads(params.shopId, query); }
    catch (error) { const result = handleError(error); return reply.code(result.statusCode).send(result.body); }
  });
  app.post("/shops/:shopId/leads/:leadId/moderation", async (request, reply) => {
    try { const params = parse(leadParamsSchema, request.params); const body = parse(moderationSchema, request.body); const session = await requireShopPermission(request, params.shopId, "marketing:write"); return reply.code(201).send(await moderateLead(params.shopId, params.leadId, body, session.user.id as string)); }
    catch (error) { const result = handleError(error); return reply.code(result.statusCode).send(result.body); }
  });
}

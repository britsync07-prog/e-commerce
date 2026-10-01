import type { FastifyInstance } from "fastify";
import { ZodError, type ZodTypeAny } from "zod";
import { AuthError } from "../auth/auth.service.js";
import { PermissionError, requireShopPermission } from "../../shared/permissions.js";
import {
  addMessage,
  assignConversation,
  createConversation,
  generateDraft,
  getAiBrain,
  getConversation,
  InboxError,
  listConversations,
  reviewDraft,
  toggleConversationAi,
  updateAiBrain
} from "./inbox.service.js";
import {
  addMessageSchema,
  conversationListQuerySchema,
  conversationParamsSchema,
  createConversationSchema,
  draftParamsSchema,
  reviewDraftSchema,
  shopParamsSchema,
  toggleAiSchema,
  updateAiBrainSchema,
  updateAssignmentSchema
} from "./inbox.validators.js";

function parse<T extends ZodTypeAny>(schema: T, value: unknown) {
  return schema.parse(value) as T["_output"];
}

function handleError(error: unknown) {
  if (error instanceof InboxError) return { statusCode: error.statusCode, body: { code: error.code, message: error.message } };
  if (error instanceof PermissionError || error instanceof AuthError) return { statusCode: error.statusCode, body: { code: error.code, message: error.message } };
  if (error instanceof ZodError) return { statusCode: 400, body: { code: "VALIDATION_ERROR", message: "Request validation failed.", issues: error.issues } };
  throw error;
}

export async function registerInboxRoutes(app: FastifyInstance) {
  app.get("/shops/:shopId/conversations", async (request, reply) => {
    try {
      const params = parse(shopParamsSchema, request.params);
      const query = parse(conversationListQuerySchema, request.query);
      await requireShopPermission(request, params.shopId, "inbox:read");
      return listConversations(params.shopId, query);
    } catch (error) {
      const result = handleError(error);
      return reply.code(result.statusCode).send(result.body);
    }
  });

  app.post("/shops/:shopId/conversations", async (request, reply) => {
    try {
      const params = parse(shopParamsSchema, request.params);
      const body = parse(createConversationSchema, request.body);
      const session = await requireShopPermission(request, params.shopId, "inbox:write");
      return reply.code(201).send(await createConversation(params.shopId, body, session.user.id as string));
    } catch (error) {
      const result = handleError(error);
      return reply.code(result.statusCode).send(result.body);
    }
  });

  app.get("/shops/:shopId/conversations/:conversationId", async (request, reply) => {
    try {
      const params = parse(conversationParamsSchema, request.params);
      await requireShopPermission(request, params.shopId, "inbox:read");
      return getConversation(params.shopId, params.conversationId);
    } catch (error) {
      const result = handleError(error);
      return reply.code(result.statusCode).send(result.body);
    }
  });

  app.post("/shops/:shopId/conversations/:conversationId/messages", async (request, reply) => {
    try {
      const params = parse(conversationParamsSchema, request.params);
      const body = parse(addMessageSchema, request.body);
      const session = await requireShopPermission(request, params.shopId, "inbox:write");
      return reply.code(201).send(await addMessage(params.shopId, params.conversationId, body, session.user.id as string));
    } catch (error) {
      const result = handleError(error);
      return reply.code(result.statusCode).send(result.body);
    }
  });

  app.patch("/shops/:shopId/conversations/:conversationId/assignment", async (request, reply) => {
    try {
      const params = parse(conversationParamsSchema, request.params);
      const body = parse(updateAssignmentSchema, request.body);
      const session = await requireShopPermission(request, params.shopId, "inbox:write");
      return assignConversation(params.shopId, params.conversationId, body.assignedStaffId, session.user.id as string);
    } catch (error) {
      const result = handleError(error);
      return reply.code(result.statusCode).send(result.body);
    }
  });

  app.post("/shops/:shopId/conversations/:conversationId/ai-drafts", async (request, reply) => {
    try {
      const params = parse(conversationParamsSchema, request.params);
      await requireShopPermission(request, params.shopId, "inbox:write");
      return reply.code(201).send(await generateDraft(params.shopId, params.conversationId));
    } catch (error) {
      const result = handleError(error);
      return reply.code(result.statusCode).send(result.body);
    }
  });

  app.patch("/shops/:shopId/conversations/:conversationId/ai-drafts/:draftId/review", async (request, reply) => {
    try {
      const params = parse(draftParamsSchema, request.params);
      const body = parse(reviewDraftSchema, request.body);
      const session = await requireShopPermission(request, params.shopId, "inbox:write");
      return reviewDraft(params.shopId, params.conversationId, params.draftId, body, session.user.id as string);
    } catch (error) {
      const result = handleError(error);
      return reply.code(result.statusCode).send(result.body);
    }
  });

  app.get("/shops/:shopId/ai-brain", async (request, reply) => {
    try {
      const params = parse(shopParamsSchema, request.params);
      await requireShopPermission(request, params.shopId, "inbox:read");
      return getAiBrain(params.shopId);
    } catch (error) {
      const result = handleError(error);
      return reply.code(result.statusCode).send(result.body);
    }
  });

  app.patch("/shops/:shopId/ai-brain", async (request, reply) => {
    try {
      const params = parse(shopParamsSchema, request.params);
      const body = parse(updateAiBrainSchema, request.body);
      const session = await requireShopPermission(request, params.shopId, "inbox:write");
      return updateAiBrain(params.shopId, body, session.user.id as string);
    } catch (error) {
      const result = handleError(error);
      return reply.code(result.statusCode).send(result.body);
    }
  });

  app.patch("/shops/:shopId/conversations/:conversationId/ai-toggle", async (request, reply) => {
    try {
      const params = parse(conversationParamsSchema, request.params);
      const body = parse(toggleAiSchema, request.body);
      const session = await requireShopPermission(request, params.shopId, "inbox:write");
      return toggleConversationAi(params.shopId, params.conversationId, body.aiEnabled, session.user.id as string);
    } catch (error) {
      const result = handleError(error);
      return reply.code(result.statusCode).send(result.body);
    }
  });
}


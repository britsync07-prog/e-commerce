import type { FastifyInstance } from "fastify";
import { ZodError, type ZodTypeAny } from "zod";
import { onboardingService, OnboardingError } from "./onboarding.service.js";
import {
  addProductSchema,
  checkSubdomainSchema,
  chooseTemplateSchema,
  shopParamsSchema,
  startOnboardingSchema,
  updateAiModeSchema,
  updateShopSchema
} from "./onboarding.validators.js";

function parse<T extends ZodTypeAny>(schema: T, value: unknown) {
  return schema.parse(value) as T["_output"];
}

function handleError(error: unknown) {
  if (error instanceof OnboardingError) {
    return {
      statusCode: error.statusCode,
      body: { code: error.code, message: error.message }
    };
  }

  if (error instanceof ZodError) {
    return {
      statusCode: 400,
      body: {
        code: "VALIDATION_ERROR",
        message: "Request validation failed.",
        issues: error.issues
      }
    };
  }

  throw error;
}

export async function registerOnboardingRoutes(app: FastifyInstance) {
  app.get("/templates", async () => onboardingService.listTemplates());

  app.post("/subdomain/check", async (request, reply) => {
    try {
      const body = parse(checkSubdomainSchema, request.body);
      return onboardingService.checkSubdomain(body.subdomain);
    } catch (error) {
      const result = handleError(error);
      return reply.code(result.statusCode).send(result.body);
    }
  });

  app.post("/start", async (request, reply) => {
    try {
      const body = parse(startOnboardingSchema, request.body);
      return reply.code(201).send(onboardingService.start(body));
    } catch (error) {
      const result = handleError(error);
      return reply.code(result.statusCode).send(result.body);
    }
  });

  app.get("/:shopId", async (request, reply) => {
    try {
      const params = parse(shopParamsSchema, request.params);
      return onboardingService.getState(params.shopId);
    } catch (error) {
      const result = handleError(error);
      return reply.code(result.statusCode).send(result.body);
    }
  });

  app.patch("/:shopId/shop", async (request, reply) => {
    try {
      const params = parse(shopParamsSchema, request.params);
      const body = parse(updateShopSchema, request.body);
      return onboardingService.updateShop(params.shopId, body);
    } catch (error) {
      const result = handleError(error);
      return reply.code(result.statusCode).send(result.body);
    }
  });

  app.post("/:shopId/products", async (request, reply) => {
    try {
      const params = parse(shopParamsSchema, request.params);
      const body = parse(addProductSchema, request.body);
      return reply.code(201).send(onboardingService.addProduct(params.shopId, body));
    } catch (error) {
      const result = handleError(error);
      return reply.code(result.statusCode).send(result.body);
    }
  });

  app.post("/:shopId/channels/meta/skip", async (request, reply) => {
    try {
      const params = parse(shopParamsSchema, request.params);
      return onboardingService.skipMeta(params.shopId);
    } catch (error) {
      const result = handleError(error);
      return reply.code(result.statusCode).send(result.body);
    }
  });

  app.patch("/:shopId/ai-mode", async (request, reply) => {
    try {
      const params = parse(shopParamsSchema, request.params);
      const body = parse(updateAiModeSchema, request.body);
      return onboardingService.updateAiMode(params.shopId, body.aiMode);
    } catch (error) {
      const result = handleError(error);
      return reply.code(result.statusCode).send(result.body);
    }
  });

  app.post("/:shopId/template", async (request, reply) => {
    try {
      const params = parse(shopParamsSchema, request.params);
      const body = parse(chooseTemplateSchema, request.body);
      return onboardingService.chooseTemplate(params.shopId, body.templateId);
    } catch (error) {
      const result = handleError(error);
      return reply.code(result.statusCode).send(result.body);
    }
  });

  app.post("/:shopId/launch", async (request, reply) => {
    try {
      const params = parse(shopParamsSchema, request.params);
      return onboardingService.launch(params.shopId);
    } catch (error) {
      const result = handleError(error);
      return reply.code(result.statusCode).send(result.body);
    }
  });
}

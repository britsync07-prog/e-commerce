import type { FastifyInstance } from "fastify";
import { ZodError, type ZodTypeAny } from "zod";
import { getOrderForBuyer, OrderError, submitCheckout } from "./orders.service.js";
import { checkoutSchema, trackSchema } from "./orders.validators.js";

function parse<T extends ZodTypeAny>(schema: T, value: unknown) {
  return schema.parse(value) as T["_output"];
}

function handleError(error: unknown) {
  if (error instanceof OrderError) return { statusCode: error.statusCode, body: { code: error.code, message: error.message } };
  if (error instanceof ZodError) return { statusCode: 400, body: { code: "VALIDATION_ERROR", message: "Request validation failed.", issues: error.issues } };
  throw error;
}

export async function registerOrderRoutes(app: FastifyInstance) {
  app.post("/checkout", async (request, reply) => {
    try {
      const body = parse(checkoutSchema, request.body);
      return reply.code(201).send(await submitCheckout(body));
    } catch (error) {
      const result = handleError(error);
      return reply.code(result.statusCode).send(result.body);
    }
  });

  app.get("/track", async (request, reply) => {
    try {
      const query = parse(trackSchema, request.query);
      return getOrderForBuyer(query.orderId, query.phone);
    } catch (error) {
      const result = handleError(error);
      return reply.code(result.statusCode).send(result.body);
    }
  });
}


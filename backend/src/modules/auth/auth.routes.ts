import type { FastifyInstance } from "fastify";
import { z, ZodError, type ZodTypeAny } from "zod";
import { AuthError, bearerToken, getSession, listSessions, login, logout, registerUser, revokeSession } from "./auth.service.js";
import { loginSchema, registerSchema } from "./auth.validators.js";

function parse<T extends ZodTypeAny>(schema: T, value: unknown) {
  return schema.parse(value) as T["_output"];
}

function handleError(error: unknown) {
  if (error instanceof AuthError) return { statusCode: error.statusCode, body: { code: error.code, message: error.message } };
  if (error instanceof ZodError) return { statusCode: 400, body: { code: "VALIDATION_ERROR", message: "Request validation failed.", issues: error.issues } };
  throw error;
}

export async function registerAuthRoutes(app: FastifyInstance) {
  app.post("/register", async (request, reply) => {
    try {
      const body = parse(registerSchema, request.body);
      return reply.code(201).send(await registerUser(body));
    } catch (error) {
      const result = handleError(error);
      return reply.code(result.statusCode).send(result.body);
    }
  });

  app.post("/login", async (request, reply) => {
    try {
      const body = parse(loginSchema, request.body);
      return login(body, {
        userAgent: request.headers["user-agent"],
        ipAddress: request.ip
      });
    } catch (error) {
      const result = handleError(error);
      return reply.code(result.statusCode).send(result.body);
    }
  });

  app.get("/me", async (request, reply) => {
    try {
      return getSession(bearerToken(request.headers.authorization));
    } catch (error) {
      const result = handleError(error);
      return reply.code(result.statusCode).send(result.body);
    }
  });

  app.post("/logout", async (request, reply) => {
    try {
      return logout(bearerToken(request.headers.authorization));
    } catch (error) {
      const result = handleError(error);
      return reply.code(result.statusCode).send(result.body);
    }
  });
  app.get("/sessions", async (request, reply) => {
    try { const session = await getSession(bearerToken(request.headers.authorization)); return listSessions(session.user.id as string); }
    catch (error) { const result = handleError(error); return reply.code(result.statusCode).send(result.body); }
  });
  app.post("/sessions/:sessionId/revoke", async (request, reply) => {
    try { const session = await getSession(bearerToken(request.headers.authorization)); const params = parse(z.object({ sessionId: z.string().uuid() }), request.params); return revokeSession(session.user.id as string, params.sessionId); }
    catch (error) { const result = handleError(error); return reply.code(result.statusCode).send(result.body); }
  });
}

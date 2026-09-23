import { randomUUID } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";

export async function requestContextHook(request: FastifyRequest, reply: FastifyReply) {
  const requestId = request.headers["x-request-id"]?.toString() ?? randomUUID();
  request.id = requestId;
  reply.header("x-request-id", requestId);
}


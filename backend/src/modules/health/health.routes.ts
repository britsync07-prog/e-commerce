import type { FastifyInstance } from "fastify";
import { db } from "../../shared/db.js";
import { config } from "../../shared/config.js";
import { metricsSnapshot } from "../../shared/metrics.js";

export async function registerHealthRoutes(app: FastifyInstance) {
  app.get(
    "/",
    {
      schema: {
        tags: ["health"],
        summary: "Check API liveness",
        response: {
          200: {
            type: "object",
            required: ["status"],
            properties: {
              status: { type: "string" }
            }
          }
        }
      }
    },
    async () => ({ status: "ok" })
  );

  app.get(
    "/ready",
    {
      schema: {
        tags: ["health"],
        summary: "Check API readiness",
        response: {
          200: {
            type: "object",
            required: ["status", "checks"],
            properties: {
              status: { type: "string" },
              checks: {
                type: "object",
                required: ["database"],
                properties: {
                  database: { type: "string" }
                }
              }
            }
          },
          503: {
            type: "object",
            required: ["status", "checks"],
            properties: {
              status: { type: "string" },
              checks: {
                type: "object",
                required: ["database"],
                properties: {
                  database: { type: "string" }
                }
              }
            }
          }
        }
      }
    },
    async (_request, reply) => {
      try {
        await db.query("select 1");
        return { status: "ready", checks: { database: "ok" } };
      } catch {
        return reply.code(503).send({ status: "not_ready", checks: { database: "error" } });
      }
    }
  );

  app.get("/metrics", async (request, reply) => {
    const token = request.headers["x-metrics-token"] ?? request.headers.authorization?.replace(/^Bearer\s+/i, "");
    if (config.metricsToken && token !== config.metricsToken) {
      return reply.code(403).send({ code: "METRICS_FORBIDDEN", message: "Metrics token is required." });
    }

    return metricsSnapshot();
  });
}

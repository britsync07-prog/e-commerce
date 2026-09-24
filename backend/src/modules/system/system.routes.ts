import type { FastifyInstance } from "fastify";
import { backendModules } from "../../shared/module-registry.js";

export async function registerSystemRoutes(app: FastifyInstance) {
  app.get(
    "/modules",
    {
      schema: {
        tags: ["system"],
        summary: "List backend modules and implementation status",
        response: {
          200: {
            type: "object",
            required: ["modules"],
            properties: {
              modules: {
                type: "array",
                items: {
                  type: "object",
                  required: ["key", "name", "status", "owns", "phase"],
                  properties: {
                    key: { type: "string" },
                    name: { type: "string" },
                    status: { type: "string", enum: ["active", "planned"] },
                    owns: { type: "array", items: { type: "string" } },
                    apiBase: { type: "string" },
                    apiDoc: { type: "string" },
                    phase: { type: "string" }
                  }
                }
              }
            }
          }
        }
      }
    },
    async () => ({ modules: backendModules })
  );
}


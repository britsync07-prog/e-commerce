import type { FastifyInstance } from "fastify";
import { z, ZodError } from "zod";
import { PermissionError, publicRolePermissions, requireAuth, requireShopPermission } from "../../shared/permissions.js";
import { db } from "../../shared/db.js";
import { AuthError } from "../auth/auth.service.js";

const shopParamsSchema = z.object({
  shopId: z.string().uuid()
});

function handleError(error: unknown) {
  if (error instanceof PermissionError || error instanceof AuthError) return { statusCode: error.statusCode, body: { code: error.code, message: error.message } };
  if (error instanceof ZodError) return { statusCode: 400, body: { code: "VALIDATION_ERROR", message: "Request validation failed.", issues: error.issues } };
  throw error;
}

export async function registerShopRoutes(app: FastifyInstance) {
  app.get("/mine", async (request, reply) => {
    try {
      const session = await requireAuth(request);
      const shops = await db.query(
        `
          select s.id, s.display_name, s.subdomain, s.status, s.category, s.country, s.currency, ss.role
          from shop_staff ss
          join shops s on s.id = ss.shop_id
          where ss.user_id = $1 and ss.status = 'active'
          order by s.created_at desc
        `,
        [session.user.id]
      );
      return { shops: shops.rows };
    } catch (error) {
      const result = handleError(error);
      return reply.code(result.statusCode).send(result.body);
    }
  });

  app.get("/:shopId/permissions", async (request, reply) => {
    try {
      const params = shopParamsSchema.parse(request.params);
      const session = await requireShopPermission(request, params.shopId, "team:read");
      return {
        role: session.role,
        permissions: session.permissions,
        roles: publicRolePermissions()
      };
    } catch (error) {
      const result = handleError(error);
      return reply.code(result.statusCode).send(result.body);
    }
  });
}


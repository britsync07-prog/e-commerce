import type { FastifyInstance } from "fastify";
import { z, ZodError, type ZodTypeAny } from "zod";
import { PermissionError, publicRolePermissions, requireAuth, requireShopPermission } from "../../shared/permissions.js";
import { db } from "../../shared/db.js";
import { AuthError } from "../auth/auth.service.js";
import { templateCatalog } from "../onboarding/template-catalog.js";

const shopParamsSchema = z.object({
  shopId: z.string().uuid()
});

const teamParamsSchema = z.object({
  shopId: z.string().uuid(),
  userId: z.string().uuid()
});

const roles = ["admin", "sales", "packer", "marketer", "accountant"] as const;
const staffStatuses = ["active", "disabled"] as const;

const addTeamMemberSchema = z.object({
  email: z.string().trim().email(),
  role: z.enum(roles)
});

const updateTeamMemberSchema = z.object({
  role: z.enum(roles).optional(),
  status: z.enum(staffStatuses).optional()
});

const transferOwnerSchema = z.object({
  targetUserId: z.string().uuid(),
  confirmation: z.literal("TRANSFER_OWNERSHIP"),
  reason: z.string().trim().min(3).max(500)
});

const updateSettingsSchema = z.object({
  displayName: z.string().trim().min(2).max(120).optional(),
  legalName: z.string().trim().max(160).nullable().optional(),
  category: z.string().trim().min(2).max(80).optional(),
  country: z.string().trim().min(2).max(80).optional(),
  currency: z.string().trim().length(3).optional(),
  language: z.enum(["en", "bn"]).optional(),
  address: z.string().trim().max(500).nullable().optional(),
  logoUrl: z.string().trim().url().nullable().optional(),
  policyDefaults: z
    .object({
      deliveryCharge: z.coerce.number().min(0).max(999999).optional(),
      returnDays: z.coerce.number().int().min(0).max(365).optional(),
      codAllowed: z.boolean().optional()
    })
    .optional(),
  aiMode: z.enum(["off", "suggest", "auto_low_risk"]).optional(),
  storefront: z.object({
    templateId: z.string().trim().min(3).max(120).optional(),
    tagline: z.string().trim().max(180).optional(),
    description: z.string().trim().max(1200).optional(),
    theme: z.object({
      accent: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
      background: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
      text: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional()
    }).optional(),
    contact: z.object({
      whatsappNumber: z.string().trim().min(6).max(40).optional(),
      facebookPageUrl: z.string().trim().url().optional(),
      messengerUrl: z.string().trim().url().optional(),
      instagramUrl: z.string().trim().url().optional(),
      phone: z.string().trim().min(6).max(40).optional(),
      email: z.string().trim().email().max(180).optional()
    }).optional(),
    orderCta: z.object({
      primary: z.enum(["whatsapp", "messenger", "facebook"]).default("whatsapp"),
      label: z.string().trim().min(2).max(60).default("Order now")
    }).optional(),
    sections: z.array(z.enum(["hero", "showcase", "products", "policies", "contact"])).max(10).optional(),
    banners: z.array(z.object({
      title: z.string().trim().min(1).max(120),
      subtitle: z.string().trim().max(240).optional(),
      imageUrl: z.string().trim().url().optional(),
      actionLabel: z.string().trim().max(40).optional(),
      actionUrl: z.string().trim().max(240).optional()
    })).max(5).optional(),
    showcases: z.array(z.object({
      title: z.string().trim().min(1).max(120),
      body: z.string().trim().max(500).optional(),
      imageUrl: z.string().trim().url().optional(),
      productIds: z.array(z.string().uuid()).max(12).optional()
    })).max(8).optional(),
    seo: z.object({
      title: z.string().trim().max(160).optional(),
      description: z.string().trim().max(320).optional(),
      shareImageUrl: z.string().trim().url().nullable().optional()
    }).optional(),
    policies: z.object({
      shipping: z.string().trim().max(1000).optional(),
      returns: z.string().trim().max(1000).optional(),
      privacy: z.string().trim().max(1000).optional()
    }).optional()
  }).optional()
});

class ShopError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly code: string
  ) {
    super(message);
  }
}

function parse<T extends ZodTypeAny>(schema: T, value: unknown) {
  return schema.parse(value) as T["_output"];
}

function handleError(error: unknown) {
  if (error instanceof ShopError) return { statusCode: error.statusCode, body: { code: error.code, message: error.message } };
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
      const params = parse(shopParamsSchema, request.params);
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

  app.get("/:shopId/team", async (request, reply) => {
    try {
      const params = parse(shopParamsSchema, request.params);
      await requireShopPermission(request, params.shopId, "team:read");
      const team = await db.query(
        `
          select ss.user_id, ss.role, ss.status, ss.created_at, u.name, u.email, u.phone
          from shop_staff ss
          join users u on u.id = ss.user_id
          where ss.shop_id = $1
          order by case ss.role when 'owner' then 0 else 1 end, ss.created_at asc
        `,
        [params.shopId]
      );
      return { team: team.rows, roles: publicRolePermissions() };
    } catch (error) {
      const result = handleError(error);
      return reply.code(result.statusCode).send(result.body);
    }
  });

  app.post("/:shopId/team", async (request, reply) => {
    try {
      const params = parse(shopParamsSchema, request.params);
      const body = parse(addTeamMemberSchema, request.body);
      const session = await requireShopPermission(request, params.shopId, "team:write");
      const user = await db.query("select id, name, email, phone from users where lower(email) = $1 and status = 'active' limit 1", [body.email.toLowerCase()]);
      if (!user.rowCount) throw new ShopError("User must register before being added to a shop.", 404, "USER_NOT_FOUND");

      const result = await db.query(
        `
          insert into shop_staff (shop_id, user_id, role, status)
          values ($1, $2, $3, 'active')
          on conflict (shop_id, user_id) do update set role = excluded.role, status = 'active'
          returning user_id, role, status, created_at
        `,
        [params.shopId, user.rows[0].id, body.role]
      );
      await audit(params.shopId, session.user.id as string, "shop.team_member_added", "user", user.rows[0].id, { role: body.role });
      return reply.code(201).send({ member: { ...result.rows[0], name: user.rows[0].name, email: user.rows[0].email, phone: user.rows[0].phone } });
    } catch (error) {
      const result = handleError(error);
      return reply.code(result.statusCode).send(result.body);
    }
  });

  app.patch("/:shopId/team/:userId", async (request, reply) => {
    try {
      const params = parse(teamParamsSchema, request.params);
      const body = parse(updateTeamMemberSchema, request.body);
      const session = await requireShopPermission(request, params.shopId, "team:write");
      if (params.userId === session.user.id && body.status === "disabled") throw new ShopError("Owner cannot remove own access without transfer flow.", 409, "OWNER_SELF_REMOVE_BLOCKED");

      const current = await db.query("select role, status from shop_staff where shop_id = $1 and user_id = $2", [params.shopId, params.userId]);
      if (!current.rowCount) throw new ShopError("Team member not found.", 404, "TEAM_MEMBER_NOT_FOUND");
      if (current.rows[0].role === "owner" && (body.status === "disabled" || body.role)) {
        throw new ShopError("Owner role changes need transfer flow.", 409, "OWNER_TRANSFER_REQUIRED");
      }

      const updated = await db.query(
        `
          update shop_staff
          set role = coalesce($3, role), status = coalesce($4, status)
          where shop_id = $1 and user_id = $2
          returning user_id, role, status, created_at
        `,
        [params.shopId, params.userId, body.role ?? null, body.status ?? null]
      );
      await audit(params.shopId, session.user.id as string, "shop.team_member_updated", "user", params.userId, body);
      return { member: updated.rows[0] };
    } catch (error) {
      const result = handleError(error);
      return reply.code(result.statusCode).send(result.body);
    }
  });

  app.post("/:shopId/team/transfer-owner", async (request, reply) => {
    const client = await db.connect();
    try {
      const params = parse(shopParamsSchema, request.params);
      const body = parse(transferOwnerSchema, request.body);
      const session = await requireShopPermission(request, params.shopId, "team:write");
      if (session.role !== "owner") throw new ShopError("Only the current owner can transfer ownership.", 403, "OWNER_TRANSFER_REQUIRED");
      if (body.targetUserId === session.user.id) throw new ShopError("The target must be another active team member.", 409, "OWNER_TRANSFER_TARGET_INVALID");

      await client.query("begin");
      const target = await client.query("select ss.user_id, u.name, u.email from shop_staff ss join users u on u.id = ss.user_id where ss.shop_id = $1 and ss.user_id = $2 and ss.status = 'active'", [params.shopId, body.targetUserId]);
      if (!target.rowCount) throw new ShopError("Target must be an active team member.", 409, "OWNER_TRANSFER_TARGET_INVALID");
      const currentOwner = await client.query("select user_id from shop_staff where shop_id = $1 and role = 'owner' and status = 'active' for update", [params.shopId]);
      if (!currentOwner.rowCount || currentOwner.rows[0].user_id !== session.user.id) throw new ShopError("Current owner could not be verified.", 409, "OWNER_TRANSFER_REQUIRED");
      await client.query("update shop_staff set role = 'admin' where shop_id = $1 and user_id = $2", [params.shopId, session.user.id]);
      await client.query("update shop_staff set role = 'owner' where shop_id = $1 and user_id = $2", [params.shopId, body.targetUserId]);
      await client.query("insert into audit_events (shop_id, actor_type, actor_id, action, target_type, target_id, metadata) values ($1, 'staff', $2, 'shop.owner_transferred', 'user', $3, $4)", [params.shopId, session.user.id, body.targetUserId, JSON.stringify({ previousOwnerId: session.user.id, reason: body.reason })]);
      await client.query("commit");
      return { previousOwnerId: session.user.id, owner: { userId: target.rows[0].user_id, name: target.rows[0].name, email: target.rows[0].email } };
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      const result = handleError(error);
      return reply.code(result.statusCode).send(result.body);
    } finally {
      client.release();
    }
  });

  app.get("/:shopId/settings", async (request, reply) => {
    try {
      const params = parse(shopParamsSchema, request.params);
      await requireShopPermission(request, params.shopId, "settings:read");
      return getSettings(params.shopId);
    } catch (error) {
      const result = handleError(error);
      return reply.code(result.statusCode).send(result.body);
    }
  });

  app.patch("/:shopId/settings", async (request, reply) => {
    try {
      const params = parse(shopParamsSchema, request.params);
      const body = parse(updateSettingsSchema, request.body);
      const session = await requireShopPermission(request, params.shopId, "settings:write");
      if (body.storefront?.templateId && !templateCatalog.some((template) => template.id === body.storefront?.templateId && template.status === "production")) {
        throw new ShopError("Production storefront template not found.", 404, "TEMPLATE_NOT_FOUND");
      }
      const current = await getSettings(params.shopId);
      const policyDefaults = { ...(current.settings.policy_defaults as Record<string, unknown>), ...(body.policyDefaults ?? {}) };
      const updated = await db.query(
        `
          update shops
          set display_name = coalesce($2, display_name),
            legal_name = coalesce($3, legal_name),
            category = coalesce($4, category),
            country = coalesce($5, country),
            currency = coalesce($6, currency),
            language = coalesce($7, language),
            address = coalesce($8, address),
            logo_url = coalesce($9, logo_url),
            policy_defaults = $10,
            ai_mode = coalesce($11, ai_mode),
            selected_template_id = coalesce(($12::jsonb)->>'templateId', selected_template_id),
            storefront_config = storefront_config || coalesce($12::jsonb, '{}'::jsonb),
            updated_at = now()
          where id = $1
          returning id
        `,
        [
          params.shopId,
          body.displayName ?? null,
          body.legalName ?? null,
          body.category ?? null,
          body.country ?? null,
          body.currency?.toUpperCase() ?? null,
          body.language ?? null,
          body.address ?? null,
          body.logoUrl ?? null,
          JSON.stringify(policyDefaults),
          body.aiMode ?? null,
          body.storefront ? JSON.stringify(body.storefront) : null
        ]
      );
      if (!updated.rowCount) throw new ShopError("Shop not found.", 404, "SHOP_NOT_FOUND");
      await audit(params.shopId, session.user.id as string, "shop.settings_updated", "shop", params.shopId, Object.keys(body));
      return getSettings(params.shopId);
    } catch (error) {
      const result = handleError(error);
      return reply.code(result.statusCode).send(result.body);
    }
  });

  app.post("/:shopId/publish", async (request, reply) => {
    try {
      const params = parse(shopParamsSchema, request.params);
      const session = await requireShopPermission(request, params.shopId, "settings:write");
      const settings = await getSettings(params.shopId);
      const templateId = settings.settings.selected_template_id as string | null;
      if (!templateId || !templateCatalog.some((template) => template.id === templateId && template.status === "production")) {
        throw new ShopError("Select a production storefront template before publishing.", 409, "PUBLISH_TEMPLATE_REQUIRED");
      }
      const config = settings.settings.storefront_config as Record<string, unknown>;
      const seo = (config.seo ?? {}) as Record<string, unknown>;
      const contact = (config.contact ?? {}) as Record<string, unknown>;
      const policy = settings.settings.policy_defaults as Record<string, unknown>;
      if (typeof seo.title !== "string" || typeof seo.description !== "string") throw new ShopError("SEO title and description are required before publishing.", 409, "PUBLISH_SEO_REQUIRED");
      if (![contact.whatsappNumber, contact.messengerUrl, contact.facebookPageUrl].some((value) => typeof value === "string" && value.length > 0)) {
        throw new ShopError("At least one order contact is required before publishing.", 409, "PUBLISH_CONTACT_REQUIRED");
      }
      if (policy.codAllowed === undefined || policy.deliveryCharge === undefined || policy.returnDays === undefined) throw new ShopError("Policy defaults are required before publishing.", 409, "PUBLISH_POLICY_REQUIRED");
      const result = await db.query(
        `update shops
         set status = 'launched',
           publish_version = publish_version + 1,
           published_storefront_config = storefront_config,
           published_at = now(),
           launched_at = coalesce(launched_at, now()),
           domain_status = 'ready',
           domain_error = null,
           domain_last_checked_at = now(),
           updated_at = now()
         where id = $1
         returning id, status, publish_version, domain_status, published_at`,
        [params.shopId]
      );
      await audit(params.shopId, session.user.id as string, "shop.storefront_published", "shop", params.shopId, { publishVersion: result.rows[0].publish_version });
      return { publish: result.rows[0] };
    } catch (error) {
      const result = handleError(error);
      return reply.code(result.statusCode).send(result.body);
    }
  });

  app.post("/:shopId/domain/retry", async (request, reply) => {
    try {
      const params = parse(shopParamsSchema, request.params);
      const session = await requireShopPermission(request, params.shopId, "settings:write");
      const result = await db.query(
        `update shops
         set domain_status = 'ready', domain_error = null, domain_last_checked_at = now(), updated_at = now()
         where id = $1
         returning id, subdomain, domain_status, domain_last_checked_at`,
        [params.shopId]
      );
      if (!result.rowCount) throw new ShopError("Shop not found.", 404, "SHOP_NOT_FOUND");
      await audit(params.shopId, session.user.id as string, "shop.domain_retry", "shop", params.shopId, { status: result.rows[0].domain_status });
      return { domain: result.rows[0] };
    } catch (error) {
      const result = handleError(error);
      return reply.code(result.statusCode).send(result.body);
    }
  });

  app.get("/:shopId/audit", async (request, reply) => {
    try {
      const params = parse(shopParamsSchema, request.params);
      await requireShopPermission(request, params.shopId, "settings:read");
      const auditEvents = await db.query(
        "select id, actor_type, actor_id, action, target_type, target_id, metadata, created_at from audit_events where shop_id = $1 order by created_at desc limit 100",
        [params.shopId]
      );
      return { audit: auditEvents.rows };
    } catch (error) {
      const result = handleError(error);
      return reply.code(result.statusCode).send(result.body);
    }
  });
  app.get("/:shopId/billing", async (request, reply) => {
    try {
      const params = parse(shopParamsSchema, request.params);
      await requireShopPermission(request, params.shopId, "settings:read");
      await db.query("insert into shop_billing (shop_id, plan_id) select $1, id from billing_plans where code = 'starter' on conflict (shop_id) do nothing", [params.shopId]);
      const [billing, usage, invoices] = await Promise.all([
        db.query("select sb.shop_id, sb.status, sb.current_period_start, sb.current_period_end, bp.code, bp.name, bp.monthly_price, bp.limits from shop_billing sb join billing_plans bp on bp.id = sb.plan_id where sb.shop_id = $1", [params.shopId]),
        db.query("select (select count(*)::int from shop_staff where shop_id = $1 and status = 'active') as staff, (select count(*)::int from products where shop_id = $1 and status <> 'archived') as products, (select count(*)::int from orders where shop_id = $1 and created_at >= date_trunc('month', current_date)) as orders_this_month, (select coalesce(sum(byte_size), 0)::bigint from asset_objects where shop_id = $1) as storage_bytes", [params.shopId]),
        db.query("select id, period_start, period_end, amount, currency, status, created_at from billing_invoices where shop_id = $1 order by created_at desc limit 24", [params.shopId])
      ]);
      return { billing: billing.rows[0], usage: usage.rows[0], invoices: invoices.rows };
    } catch (error) { const result = handleError(error); return reply.code(result.statusCode).send(result.body); }
  });
}

async function getSettings(shopId: string) {
  const result = await db.query(
    `
      select id, display_name, legal_name, subdomain, category, country, currency, language, address, logo_url,
        policy_defaults, ai_mode, status, selected_template_id, storefront_config, domain_status, domain_last_checked_at,
        domain_error, publish_version, published_storefront_config, published_at, updated_at
      from shops
      where id = $1
    `,
    [shopId]
  );
  if (!result.rowCount) throw new ShopError("Shop not found.", 404, "SHOP_NOT_FOUND");
  return { settings: result.rows[0] };
}

async function audit(shopId: string, actorId: string, action: string, targetType: string, targetId: string, metadata?: unknown) {
  await db.query(
    "insert into audit_events (shop_id, actor_type, actor_id, action, target_type, target_id, metadata) values ($1, 'staff', $2, $3, $4, $5, $6)",
    [shopId, actorId, action, targetType, targetId, metadata === undefined ? null : JSON.stringify(metadata)]
  );
}

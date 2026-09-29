import type {
  AiMode,
  AuditEvent,
  ChannelConnection,
  FirstProduct,
  OnboardingState,
  Owner,
  PolicyDefaults,
  Shop
} from "./onboarding.types.js";
import { templateCatalog } from "./template-catalog.js";
import { db } from "../../shared/db.js";

const reservedSubdomains = new Set(["admin", "api", "app", "www", "mail", "support", "help", "assets"]);

export class OnboardingError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly code: string
  ) {
    super(message);
  }
}

export function normalizeSubdomain(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

export function suggestSubdomains(input: string, taken: Set<string>) {
  const base = normalizeSubdomain(input) || "shop";
  const suggestions: string[] = [];

  for (const suffix of ["bd", "shop", "store", "online", Math.floor(100 + Math.random() * 900).toString()]) {
    const candidate = normalizeSubdomain(`${base}-${suffix}`).slice(0, 40);
    if (!taken.has(candidate) && !reservedSubdomains.has(candidate) && !suggestions.includes(candidate)) {
      suggestions.push(candidate);
    }
    if (suggestions.length === 3) break;
  }

  return suggestions;
}

export class OnboardingService {
  async checkSubdomain(input: string) {
    const subdomain = normalizeSubdomain(input);
    if (subdomain.length < 3) {
      throw new OnboardingError("Subdomain must be at least 3 valid characters.", 400, "SUBDOMAIN_TOO_SHORT");
    }

    const taken = await this.takenSubdomains();
    const available = !taken.has(subdomain) && !reservedSubdomains.has(subdomain);

    return {
      subdomain,
      available,
      suggestions: available ? [] : suggestSubdomains(subdomain, taken)
    };
  }

  async start(input: {
    ownerName: string;
    email?: string;
    phone?: string;
    language: Owner["language"];
    shopName: string;
    subdomain?: string;
    category: string;
    country: string;
    currency: string;
    ownerUserId?: string;
  }) {
    const desiredSubdomain = input.subdomain ?? input.shopName;
    const subdomainCheck = await this.checkSubdomain(desiredSubdomain);

    if (!subdomainCheck.available) {
      throw new OnboardingError("Subdomain is not available.", 409, "SUBDOMAIN_TAKEN");
    }

    const policyDefaults: PolicyDefaults = {
      deliveryCharge: 0,
      returnDays: 3,
      codAllowed: true
    };

    const client = await db.connect();
    try {
      await client.query("begin");
      const owner = input.ownerUserId
        ? await client.query("select id from users where id = $1", [input.ownerUserId])
        : await findOrCreateOwner(client, input);

      if (!owner.rowCount) throw new OnboardingError("Owner not found.", 404, "OWNER_NOT_FOUND");

      const shop = await client.query(
        `
          insert into shops (owner_user_id, display_name, subdomain, category, country, currency, language, status, onboarding_step, policy_defaults, ai_mode)
          values ($1, $2, $3, $4, $5, $6, $7, 'draft', 'products', $8, 'suggest')
          returning id
        `,
        [
          owner.rows[0].id,
          input.shopName,
          subdomainCheck.subdomain,
          input.category,
          input.country,
          input.currency.toUpperCase(),
          input.language,
          JSON.stringify(policyDefaults)
        ]
      );

      await client.query(
        "insert into shop_staff (shop_id, user_id, role) values ($1, $2, 'owner') on conflict (shop_id, user_id) do nothing",
        [shop.rows[0].id, owner.rows[0].id]
      );
      await this.audit(client, shop.rows[0].id, "owner", owner.rows[0].id, "onboarding.started", "shop", shop.rows[0].id);
      await client.query("commit");

      return this.getState(shop.rows[0].id);
    } catch (error) {
      await client.query("rollback");
      if (isUniqueViolation(error, "shops_subdomain_key")) throw new OnboardingError("Subdomain is not available.", 409, "SUBDOMAIN_TAKEN");
      if (isUniqueViolation(error)) throw new OnboardingError("Owner email or phone already exists.", 409, "OWNER_EXISTS");
      throw error;
    } finally {
      client.release();
    }
  }

  async getState(shopId: string): Promise<OnboardingState> {
    const state = await db.query(
      `
        select s.*, u.id as owner_id, u.name as owner_name, u.email as owner_email, u.phone as owner_phone,
          u.language as owner_language, u.created_at as owner_created_at
        from shops s
        join users u on u.id = s.owner_user_id
        where s.id = $1
      `,
      [shopId]
    );
    if (!state.rowCount) throw new OnboardingError("Shop not found.", 404, "SHOP_NOT_FOUND");

    const products = await db.query(
      `
        select p.id, p.shop_id, p.name, p.base_price, p.status, p.created_at,
          coalesce(sum(il.delta_quantity), 0)::int as stock
        from products p
        left join product_variants pv on pv.product_id = p.id
        left join inventory_ledger il on il.variant_id = pv.id
        where p.shop_id = $1
        group by p.id
        order by p.created_at asc
      `,
      [shopId]
    );
    const channels = await db.query("select id, shop_id, provider, status, reason, created_at from shop_channels where shop_id = $1 order by created_at asc", [
      shopId
    ]);
    const audit = await db.query(
      "select id, shop_id, actor_type, action, target_type, target_id, metadata, created_at from audit_events where shop_id = $1 order by created_at asc",
      [shopId]
    );

    return {
      owner: mapOwner(state.rows[0]),
      shop: mapShop(state.rows[0]),
      products: products.rows.map(mapProduct),
      channels: channels.rows.map(mapChannel),
      audit: audit.rows.map(mapAudit),
      templates: templateCatalog,
      launchChecklist: this.launchChecklist(mapShop(state.rows[0]), products.rows.map(mapProduct))
    };
  }

  listTemplates() {
    return {
      templates: templateCatalog
    };
  }

  async updateShop(
    shopId: string,
    input: Partial<Omit<Shop, "policyDefaults">> & { policyDefaults?: Partial<PolicyDefaults> }
  ) {
    const current = await this.getState(shopId);
    if (current.shop.status === "launched") throw new OnboardingError("Launched shop basics are locked in onboarding.", 409, "SHOP_LAUNCHED");

    let subdomain = current.shop.subdomain;
    if (input.subdomain && normalizeSubdomain(input.subdomain) !== current.shop.subdomain) {
      const check = await this.checkSubdomain(input.subdomain);
      if (!check.available) throw new OnboardingError("Subdomain is not available.", 409, "SUBDOMAIN_TAKEN");
      subdomain = check.subdomain;
    }

    const policyDefaults = { ...current.shop.policyDefaults, ...input.policyDefaults };
    const client = await db.connect();
    try {
      await client.query("begin");
      await client.query(
        `
          update shops
          set legal_name = $2, display_name = $3, subdomain = $4, category = $5, country = $6, currency = $7,
            address = $8, logo_url = $9, language = $10, policy_defaults = $11, updated_at = now()
          where id = $1
        `,
        [
          shopId,
          input.legalName ?? current.shop.legalName ?? null,
          input.displayName ?? current.shop.displayName,
          subdomain,
          input.category ?? current.shop.category,
          input.country ?? current.shop.country,
          input.currency?.toUpperCase() ?? current.shop.currency,
          input.address ?? current.shop.address ?? null,
          input.logoUrl ?? current.shop.logoUrl ?? null,
          input.language ?? current.shop.language,
          JSON.stringify(policyDefaults)
        ]
      );
      await this.audit(client, shopId, "owner", current.owner.id, "shop.updated", "shop", shopId);
      await client.query("commit");
      return this.getState(shopId);
    } catch (error) {
      await client.query("rollback");
      if (isUniqueViolation(error, "shops_subdomain_key")) throw new OnboardingError("Subdomain is not available.", 409, "SUBDOMAIN_TAKEN");
      throw error;
    } finally {
      client.release();
    }
  }

  async addProduct(shopId: string, input: Omit<FirstProduct, "id" | "shopId" | "status" | "createdAt">) {
    const state = await this.getState(shopId);
    if (state.shop.status === "launched") throw new OnboardingError("Use products module after launch.", 409, "SHOP_LAUNCHED");

    const client = await db.connect();
    try {
      await client.query("begin");
      const product = await client.query(
        `
          insert into products (shop_id, name, slug, status, base_price, currency)
          values ($1, $2, $3, 'active', $4, $5)
          returning id
        `,
        [shopId, input.name, normalizeSubdomain(input.name), input.price, state.shop.currency]
      );
      const variant = await client.query(
        `
          insert into product_variants (shop_id, product_id, title, price)
          values ($1, $2, 'Default', $3)
          returning id
        `,
        [shopId, product.rows[0].id, input.price]
      );
      await client.query(
        `
          insert into inventory_ledger (shop_id, variant_id, reason, delta_quantity, quantity_after, created_by)
          values ($1, $2, 'opening_stock', $3, $3, 'onboarding')
        `,
        [shopId, variant.rows[0].id, input.stock]
      );
      await client.query("update shops set onboarding_step = 'channels', updated_at = now() where id = $1", [shopId]);
      await this.audit(client, shopId, "owner", state.owner.id, "product.created", "product", product.rows[0].id);
      await client.query("commit");
      return this.getState(shopId);
    } catch (error) {
      await client.query("rollback");
      if (isUniqueViolation(error)) throw new OnboardingError("Product already exists.", 409, "PRODUCT_CONFLICT");
      throw error;
    } finally {
      client.release();
    }
  }

  async skipMeta(shopId: string) {
    const state = await this.getState(shopId);
    const client = await db.connect();
    try {
      await client.query("begin");
      await client.query(
        `
          insert into shop_channels (shop_id, provider, status, reason)
          values ($1, 'meta', 'skipped', 'website-only-start')
          on conflict (shop_id, provider) do nothing
        `,
        [shopId]
      );
      await client.query("update shops set onboarding_step = 'ai_mode', updated_at = now() where id = $1", [shopId]);
      await this.audit(client, shopId, "owner", state.owner.id, "channel.meta_skipped", "shop", shopId);
      await client.query("commit");
      return this.getState(shopId);
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async updateAiMode(shopId: string, aiMode: AiMode) {
    const state = await this.getState(shopId);
    await db.query("update shops set ai_mode = $2, onboarding_step = 'launch', updated_at = now() where id = $1", [shopId, aiMode]);
    await this.audit(db, shopId, "owner", state.owner.id, "ai_mode.updated", "shop", shopId, { aiMode });
    return this.getState(shopId);
  }

  async chooseTemplate(shopId: string, templateId: string) {
    const state = await this.getState(shopId);
    if (state.shop.status === "launched") throw new OnboardingError("Use storefront module after launch.", 409, "SHOP_LAUNCHED");

    const template = templateCatalog.find((item) => item.id === templateId);
    if (!template) throw new OnboardingError("Template not found.", 404, "TEMPLATE_NOT_FOUND");

    await db.query("update shops set selected_template_id = $2, updated_at = now() where id = $1", [shopId, template.id]);
    await this.audit(db, shopId, "owner", state.owner.id, "template.selected", "template", template.id);
    return this.getState(shopId);
  }

  async launch(shopId: string) {
    const state = await this.getState(shopId);
    const checklist = this.launchChecklist(state.shop, state.products);
    if (!checklist.canLaunch) {
      throw new OnboardingError(`Launch blocked: ${checklist.blockers.join(", ")}`, 409, "LAUNCH_BLOCKED");
    }

    await db.query("update shops set status = 'launched', launched_at = now(), updated_at = now() where id = $1", [shopId]);
    await this.audit(db, shopId, "owner", state.owner.id, "shop.launched", "shop", shopId);
    return this.getState(shopId);
  }

  private launchChecklist(shop: Shop, products: FirstProduct[]) {
    const hasProduct = products.some((item) => item.status === "active");
    const hasTemplate = Boolean(shop.selectedTemplateId);
    const blockers: string[] = [];

    if (!shop.displayName) blockers.push("shop display name missing");
    if (!shop.subdomain) blockers.push("subdomain missing");
    if (!hasProduct && !hasTemplate) blockers.push("add at least one product or choose a template");

    return {
      hasProduct,
      hasTemplate,
      canLaunch: blockers.length === 0,
      blockers
    };
  }

  private async takenSubdomains() {
    const result = await db.query("select subdomain from shops");
    return new Set(result.rows.map((shop) => shop.subdomain as string));
  }

  private async audit(
    client: Pick<typeof db, "query">,
    shopId: string,
    actor: "system" | "owner",
    actorId: string,
    action: string,
    targetType: string,
    targetId: string,
    metadata?: Record<string, unknown>
  ) {
    await client.query(
      `
        insert into audit_events (shop_id, actor_type, actor_id, action, target_type, target_id, metadata)
        values ($1, $2, $3, $4, $5, $6, $7)
      `,
      [shopId, actor, actorId, action, targetType, targetId, metadata ?? null]
    );
  }
}

export const onboardingService = new OnboardingService();

function mapOwner(row: Record<string, unknown>): Owner {
  return {
    id: row.owner_id as string,
    name: row.owner_name as string,
    email: row.owner_email as string | undefined,
    phone: row.owner_phone as string | undefined,
    language: row.owner_language as Owner["language"],
    createdAt: (row.owner_created_at as Date).toISOString()
  };
}

function mapShop(row: Record<string, unknown>): Shop {
  return {
    id: row.id as string,
    ownerId: row.owner_user_id as string,
    legalName: row.legal_name as string | undefined,
    displayName: row.display_name as string,
    subdomain: row.subdomain as string,
    category: row.category as string,
    country: row.country as string,
    currency: row.currency as string,
    address: row.address as string | undefined,
    logoUrl: row.logo_url as string | undefined,
    language: row.language as Shop["language"],
    status: row.status as Shop["status"],
    onboardingStep: row.onboarding_step as Shop["onboardingStep"],
    policyDefaults: row.policy_defaults as PolicyDefaults,
    aiMode: row.ai_mode as AiMode,
    selectedTemplateId: row.selected_template_id as string | undefined,
    launchedAt: row.launched_at ? (row.launched_at as Date).toISOString() : undefined,
    createdAt: (row.created_at as Date).toISOString(),
    updatedAt: (row.updated_at as Date).toISOString()
  };
}

function mapProduct(row: Record<string, unknown>): FirstProduct {
  return {
    id: row.id as string,
    shopId: row.shop_id as string,
    name: row.name as string,
    price: Number(row.base_price),
    stock: Number(row.stock),
    status: row.status as FirstProduct["status"],
    createdAt: (row.created_at as Date).toISOString()
  };
}

function mapChannel(row: Record<string, unknown>): ChannelConnection {
  return {
    id: row.id as string,
    shopId: row.shop_id as string,
    provider: row.provider as ChannelConnection["provider"],
    status: row.status as ChannelConnection["status"],
    reason: row.reason as string | undefined,
    createdAt: (row.created_at as Date).toISOString()
  };
}

function mapAudit(row: Record<string, unknown>): AuditEvent {
  return {
    id: row.id as string,
    shopId: row.shop_id as string,
    actor: row.actor_type as AuditEvent["actor"],
    action: row.action as string,
    targetType: row.target_type as string,
    targetId: row.target_id as string,
    metadata: row.metadata as Record<string, unknown> | undefined,
    createdAt: (row.created_at as Date).toISOString()
  };
}

async function findOrCreateOwner(
  client: Pick<typeof db, "query">,
  input: { ownerName: string; email?: string; phone?: string; language: Owner["language"] }
) {
  const email = input.email?.toLowerCase() ?? null;
  const phone = input.phone ?? null;
  if (email || phone) {
    const existing = await client.query("select id from users where ($1::text is not null and email = $1) or ($2::text is not null and phone = $2) limit 1", [
      email,
      phone
    ]);
    if (existing.rowCount) return existing;
  }

  return client.query(
    `
      insert into users (name, email, phone, language)
      values ($1, $2, $3, $4)
      returning id
    `,
    [input.ownerName, email, phone, input.language]
  );
}

function isUniqueViolation(error: unknown, constraint?: string) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "23505" &&
    (!constraint || ("constraint" in error && error.constraint === constraint))
  );
}

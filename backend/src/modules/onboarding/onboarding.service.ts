import { randomUUID } from "node:crypto";
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
import { onboardingStore } from "./onboarding.store.js";
import { templateCatalog } from "./template-catalog.js";

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
  checkSubdomain(input: string) {
    const subdomain = normalizeSubdomain(input);
    if (subdomain.length < 3) {
      throw new OnboardingError("Subdomain must be at least 3 valid characters.", 400, "SUBDOMAIN_TOO_SHORT");
    }

    const taken = this.takenSubdomains();
    const available = !taken.has(subdomain) && !reservedSubdomains.has(subdomain);

    return {
      subdomain,
      available,
      suggestions: available ? [] : suggestSubdomains(subdomain, taken)
    };
  }

  start(input: {
    ownerName: string;
    email?: string;
    phone?: string;
    language: Owner["language"];
    shopName: string;
    subdomain?: string;
    category: string;
    country: string;
    currency: string;
  }) {
    const now = new Date().toISOString();
    const desiredSubdomain = input.subdomain ?? input.shopName;
    const subdomainCheck = this.checkSubdomain(desiredSubdomain);

    if (!subdomainCheck.available) {
      throw new OnboardingError("Subdomain is not available.", 409, "SUBDOMAIN_TAKEN");
    }

    const owner: Owner = {
      id: randomUUID(),
      name: input.ownerName,
      email: input.email,
      phone: input.phone,
      language: input.language,
      createdAt: now
    };

    const policyDefaults: PolicyDefaults = {
      deliveryCharge: 0,
      returnDays: 3,
      codAllowed: true
    };

    const shop: Shop = {
      id: randomUUID(),
      ownerId: owner.id,
      displayName: input.shopName,
      subdomain: subdomainCheck.subdomain,
      category: input.category,
      country: input.country,
      currency: input.currency.toUpperCase(),
      language: input.language,
      status: "draft",
      onboardingStep: "products",
      policyDefaults,
      aiMode: "suggest",
      createdAt: now,
      updatedAt: now
    };

    const data = onboardingStore.getData();
    data.owners.push(owner);
    data.shops.push(shop);
    data.audit.push(this.audit(shop.id, "owner", "onboarding.started", "shop", shop.id));
    onboardingStore.save();

    return this.getState(shop.id);
  }

  getState(shopId: string): OnboardingState {
    const data = onboardingStore.getData();
    const shop = data.shops.find((item) => item.id === shopId);
    if (!shop) throw new OnboardingError("Shop not found.", 404, "SHOP_NOT_FOUND");

    const owner = data.owners.find((item) => item.id === shop.ownerId);
    if (!owner) throw new OnboardingError("Owner not found.", 500, "OWNER_NOT_FOUND");

    const products = data.products.filter((item) => item.shopId === shopId);
    const channels = data.channels.filter((item) => item.shopId === shopId);
    const audit = data.audit.filter((item) => item.shopId === shopId);

    return {
      owner,
      shop,
      products,
      channels,
      audit,
      templates: templateCatalog,
      launchChecklist: this.launchChecklist(shop, products)
    };
  }

  listTemplates() {
    return {
      templates: templateCatalog
    };
  }

  updateShop(
    shopId: string,
    input: Partial<Omit<Shop, "policyDefaults">> & { policyDefaults?: Partial<PolicyDefaults> }
  ) {
    const data = onboardingStore.getData();
    const shop = data.shops.find((item) => item.id === shopId);
    if (!shop) throw new OnboardingError("Shop not found.", 404, "SHOP_NOT_FOUND");
    if (shop.status === "launched") throw new OnboardingError("Launched shop basics are locked in onboarding.", 409, "SHOP_LAUNCHED");

    if (input.subdomain && normalizeSubdomain(input.subdomain) !== shop.subdomain) {
      const check = this.checkSubdomain(input.subdomain);
      if (!check.available) throw new OnboardingError("Subdomain is not available.", 409, "SUBDOMAIN_TAKEN");
      shop.subdomain = check.subdomain;
    }

    shop.legalName = input.legalName ?? shop.legalName;
    shop.displayName = input.displayName ?? shop.displayName;
    shop.category = input.category ?? shop.category;
    shop.country = input.country ?? shop.country;
    shop.currency = input.currency?.toUpperCase() ?? shop.currency;
    shop.address = input.address ?? shop.address;
    shop.logoUrl = input.logoUrl ?? shop.logoUrl;
    shop.language = input.language ?? shop.language;
    shop.policyDefaults = {
      ...shop.policyDefaults,
      ...input.policyDefaults
    };
    shop.updatedAt = new Date().toISOString();

    data.audit.push(this.audit(shop.id, "owner", "shop.updated", "shop", shop.id));
    onboardingStore.save();
    return this.getState(shop.id);
  }

  addProduct(shopId: string, input: Omit<FirstProduct, "id" | "shopId" | "status" | "createdAt">) {
    const data = onboardingStore.getData();
    const shop = data.shops.find((item) => item.id === shopId);
    if (!shop) throw new OnboardingError("Shop not found.", 404, "SHOP_NOT_FOUND");
    if (shop.status === "launched") throw new OnboardingError("Use products module after launch.", 409, "SHOP_LAUNCHED");

    const now = new Date().toISOString();
    const product: FirstProduct = {
      id: randomUUID(),
      shopId,
      ...input,
      status: "active",
      createdAt: now
    };

    data.products.push(product);
    shop.onboardingStep = "channels";
    shop.updatedAt = now;
    data.audit.push(this.audit(shop.id, "owner", "product.created", "product", product.id));
    onboardingStore.save();
    return this.getState(shop.id);
  }

  skipMeta(shopId: string) {
    const data = onboardingStore.getData();
    const shop = data.shops.find((item) => item.id === shopId);
    if (!shop) throw new OnboardingError("Shop not found.", 404, "SHOP_NOT_FOUND");

    const existing = data.channels.find((item) => item.shopId === shopId && item.provider === "meta");
    if (!existing) {
      const channel: ChannelConnection = {
        id: randomUUID(),
        shopId,
        provider: "meta",
        status: "skipped",
        reason: "website-only-start",
        createdAt: new Date().toISOString()
      };
      data.channels.push(channel);
    }

    shop.onboardingStep = "ai_mode";
    shop.updatedAt = new Date().toISOString();
    data.audit.push(this.audit(shop.id, "owner", "channel.meta_skipped", "shop", shop.id));
    onboardingStore.save();
    return this.getState(shop.id);
  }

  updateAiMode(shopId: string, aiMode: AiMode) {
    const data = onboardingStore.getData();
    const shop = data.shops.find((item) => item.id === shopId);
    if (!shop) throw new OnboardingError("Shop not found.", 404, "SHOP_NOT_FOUND");

    shop.aiMode = aiMode;
    shop.onboardingStep = "launch";
    shop.updatedAt = new Date().toISOString();
    data.audit.push(this.audit(shop.id, "owner", "ai_mode.updated", "shop", shop.id, { aiMode }));
    onboardingStore.save();
    return this.getState(shop.id);
  }

  chooseTemplate(shopId: string, templateId: string) {
    const data = onboardingStore.getData();
    const shop = data.shops.find((item) => item.id === shopId);
    if (!shop) throw new OnboardingError("Shop not found.", 404, "SHOP_NOT_FOUND");
    if (shop.status === "launched") throw new OnboardingError("Use storefront module after launch.", 409, "SHOP_LAUNCHED");

    const template = templateCatalog.find((item) => item.id === templateId);
    if (!template) throw new OnboardingError("Template not found.", 404, "TEMPLATE_NOT_FOUND");

    shop.selectedTemplateId = template.id;
    shop.updatedAt = new Date().toISOString();
    data.audit.push(this.audit(shop.id, "owner", "template.selected", "template", template.id));
    onboardingStore.save();
    return this.getState(shop.id);
  }

  launch(shopId: string) {
    const data = onboardingStore.getData();
    const shop = data.shops.find((item) => item.id === shopId);
    if (!shop) throw new OnboardingError("Shop not found.", 404, "SHOP_NOT_FOUND");

    const products = data.products.filter((item) => item.shopId === shopId);
    const checklist = this.launchChecklist(shop, products);
    if (!checklist.canLaunch) {
      throw new OnboardingError(`Launch blocked: ${checklist.blockers.join(", ")}`, 409, "LAUNCH_BLOCKED");
    }

    shop.status = "launched";
    shop.launchedAt = new Date().toISOString();
    shop.updatedAt = shop.launchedAt;
    data.audit.push(this.audit(shop.id, "owner", "shop.launched", "shop", shop.id));
    onboardingStore.save();
    return this.getState(shop.id);
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

  private takenSubdomains() {
    return new Set(onboardingStore.getData().shops.map((shop) => shop.subdomain));
  }

  private audit(
    shopId: string,
    actor: AuditEvent["actor"],
    action: string,
    targetType: string,
    targetId: string,
    metadata?: Record<string, unknown>
  ): AuditEvent {
    return {
      id: randomUUID(),
      shopId,
      actor,
      action,
      targetType,
      targetId,
      metadata,
      createdAt: new Date().toISOString()
    };
  }
}

export const onboardingService = new OnboardingService();

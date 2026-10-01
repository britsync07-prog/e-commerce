export type ModuleStatus = "active" | "planned";

export type BackendModule = {
  key: string;
  name: string;
  status: ModuleStatus;
  owns: string[];
  apiBase?: string;
  apiDoc?: string;
  phase: "foundation" | "p0" | "p1" | "p2" | "p3" | "p4";
};

export const backendModules: BackendModule[] = [
  {
    key: "assets",
    name: "Asset storage",
    status: "active",
    owns: ["image uploads", "asset metadata", "local dev storage"],
    apiBase: "/api/v1/assets",
    apiDoc: "assets.md",
    phase: "foundation"
  },
  {
    key: "health",
    name: "Health",
    status: "active",
    owns: ["liveness checks"],
    apiBase: "/api/v1/health",
    apiDoc: "health.md",
    phase: "foundation"
  },
  {
    key: "system",
    name: "System",
    status: "active",
    owns: ["module map", "backend capability discovery"],
    apiBase: "/api/v1/system",
    apiDoc: "system.md",
    phase: "foundation"
  },
  {
    key: "onboarding",
    name: "Onboarding and store setup",
    status: "active",
    owns: ["owner start", "shop draft", "subdomain reservation", "template selection", "launch checklist"],
    apiBase: "/api/v1/onboarding",
    apiDoc: "onboarding.md",
    phase: "p0"
  },
  {
    key: "storefront",
    name: "Public storefront",
    status: "active",
    owns: ["published shop lookup", "public product reads", "template metadata"],
    apiBase: "/api/v1/storefront",
    apiDoc: "storefront.md",
    phase: "p0"
  },
  {
    key: "auth",
    name: "Auth and sessions",
    status: "active",
    owns: ["users", "password login", "sessions"],
    apiBase: "/api/v1/auth",
    apiDoc: "auth.md",
    phase: "foundation"
  },
  {
    key: "shops",
    name: "Shops and staff",
    status: "active",
    owns: ["shop settings", "roles", "permissions"],
    apiBase: "/api/v1/shops",
    apiDoc: "shops.md",
    phase: "foundation"
  },
  {
    key: "catalog",
    name: "Catalog",
    status: "active",
    owns: ["products", "variants", "images", "categories"],
    apiBase: "/api/v1/catalog",
    apiDoc: "catalog.md",
    phase: "p0"
  },
  {
    key: "inventory",
    name: "Inventory",
    status: "active",
    owns: ["stock ledger", "reservations", "low stock"],
    apiBase: "/api/v1/inventory",
    apiDoc: "inventory.md",
    phase: "p0"
  },
  {
    key: "inbox",
    name: "Inbox",
    status: "active",
    owns: ["conversations", "messages", "assignments", "suggest-only AI drafts"],
    apiBase: "/api/v1/inbox",
    apiDoc: "inbox.md",
    phase: "p0"
  },
  {
    key: "comments",
    name: "Comment automation and lead capture",
    status: "active",
    owns: ["social posts", "comment rules", "lead capture", "moderation queue", "reply previews"],
    apiBase: "/api/v1/comments",
    apiDoc: "comments.md",
    phase: "p2"
  },
  {
    key: "orders",
    name: "Orders",
    status: "active",
    owns: ["storefront checkout", "confirmed orders", "timeline", "stock reservation"],
    apiBase: "/api/v1/orders",
    apiDoc: "orders.md",
    phase: "p0"
  },
  {
    key: "delivery",
    name: "Delivery",
    status: "active",
    owns: ["manual courier accounts", "shipments", "tracking events", "failed delivery notes"],
    apiBase: "/api/v1/delivery",
    apiDoc: "delivery.md",
    phase: "p0"
  },
  { key: "payments", name: "Payments", status: "active", owns: ["COD ledger", "proofs", "reconciliation"], apiBase: "/api/v1/payments", apiDoc: "payments.md", phase: "p1" },
  { key: "customers", name: "Customers", status: "active", owns: ["profiles", "addresses", "tags", "consent", "timeline"], apiBase: "/api/v1/customers", apiDoc: "customers.md", phase: "p2" },
  { key: "marketing", name: "Marketing", status: "active", owns: ["coupons", "saved segments", "broadcast safety"], apiBase: "/api/v1/marketing", apiDoc: "marketing.md", phase: "p2" },
  { key: "analytics", name: "Analytics", status: "active", owns: ["dashboard metrics", "reports"], apiBase: "/api/v1/analytics", apiDoc: "analytics.md", phase: "p2" },
  { key: "meta", name: "Meta connections", status: "active", owns: ["Meta connection metadata", "credential references"], apiBase: "/api/v1/meta", apiDoc: "meta.md", phase: "p1" },
  { key: "webhooks", name: "Webhooks", status: "active", owns: ["signed Meta event ingestion", "webhook idempotency"], apiBase: "/api/v1/webhooks", apiDoc: "webhooks.md", phase: "foundation" },
  { key: "ai", name: "AI command center", status: "active", owns: ["command records", "risk classification", "source citations", "action approvals", "review-only ad creative drafts"], apiBase: "/api/v1/ai", apiDoc: "ai.md", phase: "p1" },
  { key: "settings", name: "Settings, billing, and security", status: "active", owns: ["policies", "security", "billing usage", "sessions", "external connections"], apiBase: "/api/v1/shops", apiDoc: "shops.md", phase: "foundation" },
  { key: "jobs", name: "Workers and jobs", status: "active", owns: ["queues", "retries", "dead letters", "operator retry"], apiBase: "/api/v1/jobs", apiDoc: "jobs.md", phase: "foundation" },
  { key: "legal", name: "Legal, privacy, and consent", status: "active", owns: ["legal policies", "cookie consent", "privacy requests"], apiBase: "/api/v1/legal", apiDoc: "legal.md", phase: "p1" }
];

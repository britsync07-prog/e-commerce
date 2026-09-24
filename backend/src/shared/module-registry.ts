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
  { key: "auth", name: "Auth and sessions", status: "planned", owns: ["users", "sessions", "invitations"], phase: "foundation" },
  { key: "shops", name: "Shops and staff", status: "planned", owns: ["shop settings", "roles", "permissions"], phase: "foundation" },
  { key: "catalog", name: "Catalog", status: "planned", owns: ["products", "variants", "images", "categories"], phase: "p0" },
  { key: "inventory", name: "Inventory", status: "planned", owns: ["stock ledger", "reservations", "low stock"], phase: "p0" },
  { key: "inbox", name: "Inbox", status: "planned", owns: ["conversations", "messages", "assignments"], phase: "p0" },
  { key: "orders", name: "Orders", status: "planned", owns: ["draft orders", "confirmed orders", "timeline"], phase: "p0" },
  { key: "delivery", name: "Delivery", status: "planned", owns: ["couriers", "shipments", "tracking events"], phase: "p0" },
  { key: "payments", name: "Payments", status: "planned", owns: ["COD ledger", "proofs", "reconciliation"], phase: "p1" },
  { key: "customers", name: "Customers", status: "planned", owns: ["profiles", "addresses", "tags", "consent"], phase: "p2" },
  { key: "marketing", name: "Marketing", status: "planned", owns: ["coupons", "campaigns", "broadcast safety"], phase: "p3" },
  { key: "analytics", name: "Analytics", status: "planned", owns: ["events", "reports", "dashboards"], phase: "p2" },
  { key: "ai", name: "AI automation", status: "planned", owns: ["drafts", "extraction", "action approvals"], phase: "p0" },
  { key: "settings", name: "Settings", status: "planned", owns: ["policies", "security", "external connections"], phase: "foundation" },
  { key: "webhooks", name: "Webhooks", status: "planned", owns: ["Meta", "courier", "payment provider events"], phase: "foundation" },
  { key: "jobs", name: "Workers and jobs", status: "planned", owns: ["queues", "retries", "dead letters"], phase: "foundation" }
];


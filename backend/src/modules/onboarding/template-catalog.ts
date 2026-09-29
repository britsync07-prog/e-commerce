import type { StoreTemplate } from "./onboarding.types.js";

export const templateCatalog: StoreTemplate[] = [
  {
    id: "fashion-editorial",
    name: "Fashion Editorial",
    type: "storefront",
    sourceUrl: "internal:production-theme",
    license: "Internal production metadata",
    stack: ["Storefront renderer", "Backend catalog metadata"],
    bestFor: ["fashion", "clothing", "beauty"],
    sections: ["hero", "products", "policies", "contact"],
    defaultTheme: { accent: "#111827", background: "#ffffff", text: "#111827" },
    notes: "Editorial product-first layout with large imagery and policy blocks.",
    status: "production"
  },
  {
    id: "gadget-grid",
    name: "Gadget Grid",
    type: "storefront",
    sourceUrl: "internal:production-theme",
    license: "Internal production metadata",
    stack: ["Storefront renderer", "Backend catalog metadata"],
    bestFor: ["gadgets", "electronics", "accessories"],
    sections: ["hero", "products", "policies", "contact"],
    defaultTheme: { accent: "#2563eb", background: "#f8fafc", text: "#0f172a" },
    notes: "Dense catalog grid for variants, specs, and fast checkout.",
    status: "production"
  },
  {
    id: "beauty-soft",
    name: "Beauty Soft",
    type: "storefront",
    sourceUrl: "internal:production-theme",
    license: "Internal production metadata",
    stack: ["Storefront renderer", "Backend catalog metadata"],
    bestFor: ["beauty", "skincare", "cosmetics"],
    sections: ["hero", "products", "policies", "contact"],
    defaultTheme: { accent: "#be185d", background: "#fff7fb", text: "#1f2937" },
    notes: "Soft brand-led layout for bundles, repeat buyers, and policy clarity.",
    status: "production"
  },
  {
    id: "home-warm",
    name: "Home Warm",
    type: "storefront",
    sourceUrl: "internal:production-theme",
    license: "Internal production metadata",
    stack: ["Storefront renderer", "Backend catalog metadata"],
    bestFor: ["home", "decor", "lifestyle"],
    sections: ["hero", "products", "policies", "contact"],
    defaultTheme: { accent: "#0f766e", background: "#fbfaf7", text: "#1c1917" },
    notes: "Warm catalog layout for home goods and lifestyle products.",
    status: "production"
  },
  {
    id: "minimal-market",
    name: "Minimal Market",
    type: "storefront",
    sourceUrl: "internal:production-theme",
    license: "Internal production metadata",
    stack: ["Storefront renderer", "Backend catalog metadata"],
    bestFor: ["general", "grocery", "daily essentials"],
    sections: ["hero", "products", "policies", "contact"],
    defaultTheme: { accent: "#16a34a", background: "#ffffff", text: "#111827" },
    notes: "Clean fast-loading theme for broad catalogs and repeat orders.",
    status: "production"
  }
];

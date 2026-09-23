import type { StoreTemplate } from "./onboarding.types.js";

export const templateCatalog: StoreTemplate[] = [
  {
    id: "test-fashion-basic",
    name: "Test Fashion Basic",
    type: "storefront",
    sourceUrl: "internal:test-template",
    license: "Internal test-only, not for production",
    stack: ["Backend catalog metadata only"],
    bestFor: ["fashion", "clothing", "beauty"],
    notes: "Basic test template for onboarding flow only. No external source code. Replace before production.",
    status: "test_only"
  },
  {
    id: "test-gadget-basic",
    name: "Test Gadget Basic",
    type: "storefront",
    sourceUrl: "internal:test-template",
    license: "Internal test-only, not for production",
    stack: ["Backend catalog metadata only"],
    bestFor: ["gadgets", "electronics", "accessories"],
    notes: "Basic test template for onboarding flow only. No external source code. Replace before production.",
    status: "test_only"
  }
];

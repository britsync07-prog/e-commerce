import assert from "node:assert/strict";
import { buildApp } from "../dist/app.js";
import { onboardingStore } from "../dist/modules/onboarding/onboarding.store.js";

async function testLaunchFlow() {
  onboardingStore.resetForTests();
  const app = await buildApp();

  const started = await app.inject({
    method: "POST",
    url: "/api/v1/onboarding/start",
    payload: {
      ownerName: "Nafis",
      phone: "+8801700000000",
      language: "bn-en",
      shopName: "Nafis Fashion",
      category: "fashion",
      country: "Bangladesh",
      currency: "BDT"
    }
  });

  assert.equal(started.statusCode, 201);
  const state = started.json();
  assert.equal(state.shop.status, "draft");
  assert.equal(state.shop.subdomain, "nafis-fashion");

  const product = await app.inject({
    method: "POST",
    url: `/api/v1/onboarding/${state.shop.id}/products`,
    payload: {
      name: "Black Panjabi",
      price: 1200,
      stock: 10
    }
  });

  assert.equal(product.statusCode, 201);

  const skippedMeta = await app.inject({
    method: "POST",
    url: `/api/v1/onboarding/${state.shop.id}/channels/meta/skip`
  });

  assert.equal(skippedMeta.statusCode, 200);

  const aiMode = await app.inject({
    method: "PATCH",
    url: `/api/v1/onboarding/${state.shop.id}/ai-mode`,
    payload: { aiMode: "suggest" }
  });

  assert.equal(aiMode.statusCode, 200);

  const launched = await app.inject({
    method: "POST",
    url: `/api/v1/onboarding/${state.shop.id}/launch`
  });

  assert.equal(launched.statusCode, 200);
  assert.equal(launched.json().shop.status, "launched");

  const storefront = await app.inject({
    method: "GET",
    url: "/api/v1/storefront/nafis-fashion"
  });

  assert.equal(storefront.statusCode, 200);
  assert.equal(storefront.json().shop.subdomain, "nafis-fashion");
  assert.equal(storefront.json().products.length, 1);

  await app.close();
}

async function testSubdomainSuggestions() {
  onboardingStore.resetForTests();
  const app = await buildApp();

  await app.inject({
    method: "POST",
    url: "/api/v1/onboarding/start",
    payload: {
      ownerName: "Owner",
      language: "en",
      shopName: "Demo Store",
      category: "gadgets",
      country: "Bangladesh",
      currency: "BDT"
    }
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/v1/onboarding/subdomain/check",
    payload: { subdomain: "Demo Store" }
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().available, false);
  assert.equal(response.json().suggestions.length, 3);

  await app.close();
}

async function testTemplateCatalogAndSelection() {
  onboardingStore.resetForTests();
  const app = await buildApp();

  const catalog = await app.inject({
    method: "GET",
    url: "/api/v1/onboarding/templates"
  });

  assert.equal(catalog.statusCode, 200);
  assert.equal(catalog.json().templates.length, 2);
  assert.ok(catalog.json().templates.every((template) => template.status === "test_only"));

  const started = await app.inject({
    method: "POST",
    url: "/api/v1/onboarding/start",
    payload: {
      ownerName: "Template Owner",
      language: "en",
      shopName: "Template Store",
      category: "fashion",
      country: "Bangladesh",
      currency: "BDT"
    }
  });

  const shopId = started.json().shop.id;
  const selected = await app.inject({
    method: "POST",
    url: `/api/v1/onboarding/${shopId}/template`,
    payload: {
      templateId: "test-fashion-basic"
    }
  });

  assert.equal(selected.statusCode, 200);
  assert.equal(selected.json().shop.selectedTemplateId, "test-fashion-basic");
  assert.equal(selected.json().launchChecklist.hasTemplate, true);

  await app.close();
}

async function testSystemModules() {
  const app = await buildApp();

  const response = await app.inject({
    method: "GET",
    url: "/api/v1/system/modules"
  });

  assert.equal(response.statusCode, 200);
  assert.ok(response.json().modules.some((module) => module.key === "orders" && module.status === "planned"));
  assert.ok(response.json().modules.some((module) => module.key === "onboarding" && module.status === "active"));

  await app.close();
}

await testLaunchFlow();
await testSubdomainSuggestions();
await testTemplateCatalogAndSelection();
await testSystemModules();
console.log("Onboarding integration checks passed.");

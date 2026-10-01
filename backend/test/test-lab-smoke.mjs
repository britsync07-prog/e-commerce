import assert from "node:assert/strict";
import { buildApp } from "../dist/app.js";
import { verifyKeys } from "../dist/modules/test-lab/test-lab.service.js";

async function run() {
  console.log("Starting Test Lab smoke verification...");

  // 1. Verify key handling
  console.log("Checking verifyKeys fallback logic...");
  const emptyCheck = await verifyKeys(undefined, undefined);
  assert.equal(emptyCheck.gemini.valid, false, "Gemini should report false when no key is set");
  assert.equal(emptyCheck.groq.valid, false, "Groq should report false when no key is set");

  // 2. Build Fastify app instance
  console.log("Building Fastify application...");
  const app = await buildApp();
  await app.ready();

  // 3. Test /lab shortcut redirect
  console.log("Testing GET /lab shortcut...");
  const labRes = await app.inject({
    method: "GET",
    url: "/lab"
  });
  assert.equal(labRes.statusCode, 302, "GET /lab should redirect with 302");
  assert.equal(labRes.headers.location, "/api/v1/test-lab/ui", "Redirect location should be /api/v1/test-lab/ui");

  // 4. Test UI template delivery
  console.log("Testing GET /api/v1/test-lab/ui...");
  const uiRes = await app.inject({
    method: "GET",
    url: "/api/v1/test-lab/ui"
  });
  assert.equal(uiRes.statusCode, 200, "GET /api/v1/test-lab/ui should return 200");
  assert(uiRes.headers["content-type"]?.includes("text/html"), "Content-Type must be text/html");
  assert(uiRes.body.includes("AI Social Commerce Lab"), "HTML should include test bench title");
  assert(uiRes.body.includes("Google Gemini API Key"), "HTML should contain Gemini key input");
  assert(uiRes.body.includes("Groq API Key"), "HTML should contain Groq key input");
  assert(uiRes.body.includes("Save &amp; Vectorize All 10 Products") || uiRes.body.includes("Save & Vectorize All 10 Products"), "HTML should contain 10-product batch action");

  // 5. Test status endpoint
  console.log("Testing GET /api/v1/test-lab/status...");
  const statusRes = await app.inject({
    method: "GET",
    url: "/api/v1/test-lab/status"
  });
  assert.equal(statusRes.statusCode, 200, "Status endpoint should return 200");
  const statusData = JSON.parse(statusRes.body);
  assert.equal(statusData.status, "ready", "Status must be ready");
  assert.equal(statusData.testShop.id, "a0000000-0000-0000-0000-000000000001", "Shop must be isolated test shop");

  // 6. Test batch products creation with 10 custom items
  console.log("Testing POST /api/v1/test-lab/batch-products with 10 user items...");
  const sampleBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
  const batchRes = await app.inject({
    method: "POST",
    url: "/api/v1/test-lab/batch-products",
    payload: {
      products: [
        { name: "User Custom Panjabi 1", price: 1550, stock: 12, imageBase64: sampleBase64, sizes: ["M", "L"] },
        { name: "User Custom Shirt 2", price: 1250, stock: 15, imageBase64: sampleBase64, sizes: ["M", "XL"] },
        { name: "User Custom Saree 3", price: 4200, stock: 5, imageBase64: sampleBase64 },
        { name: "User Custom Shoe 4", price: 2100, stock: 8, imageBase64: sampleBase64 },
        { name: "User Custom Bag 5", price: 1800, stock: 12, imageBase64: sampleBase64 },
        { name: "User Custom Watch 6", price: 3500, stock: 7, imageBase64: sampleBase64 },
        { name: "User Custom Wallet 7", price: 900, stock: 25, imageBase64: sampleBase64 },
        { name: "User Custom Jacket 8", price: 2600, stock: 14, imageBase64: sampleBase64 },
        { name: "User Custom Earbuds 9", price: 2300, stock: 20, imageBase64: sampleBase64 },
        { name: "User Custom Glasses 10", price: 950, stock: 30, imageBase64: sampleBase64 }
      ]
    }
  });
  assert.equal(batchRes.statusCode, 201, "Batch products endpoint should return 201");
  const batchData = JSON.parse(batchRes.body);
  assert.equal(batchData.count, 10, "Batch count must be 10");
  assert(batchData.success, "Batch success must be true");

  // 7. Verify listing reflects the 10 custom products
  console.log("Testing GET /api/v1/test-lab/products...");
  const productsRes = await app.inject({
    method: "GET",
    url: "/api/v1/test-lab/products"
  });
  assert.equal(productsRes.statusCode, 200, "Products endpoint should return 200");
  const productsData = JSON.parse(productsRes.body);
  assert(Array.isArray(productsData.products), "Response must contain products array");
  assert.equal(productsData.products.length, 10, "Catalog should have exactly 10 uploaded products");

  const panjabi = productsData.products.find((p) => p.name.includes("Panjabi"));
  assert(panjabi, "Catalog should have the custom Panjabi product");
  assert.equal(panjabi.price, 1550, "Panjabi price must be 1550");

  // 8. Test simulated chat with text inquiry
  console.log("Testing POST /api/v1/test-lab/chat with text query...");
  const chatTextRes = await app.inject({
    method: "POST",
    url: "/api/v1/test-lab/chat",
    payload: {
      text: "User Custom Panjabi 1 er price koto? Stock ache?",
      aiBrain: {
        shopName: "Saimon Lifestyle",
        tone: "friendly"
      }
    }
  });
  assert.equal(chatTextRes.statusCode, 200, "Chat simulation should return 200");
  const chatTextData = JSON.parse(chatTextRes.body);
  assert(chatTextData.reply, "Chat response must have reply text");
  assert(chatTextData.reply.includes("1550") || chatTextData.reply.includes("১,৫৫০") || chatTextData.reply.includes("Panjabi"), "Reply must quote live price or product name");
  assert.equal(chatTextData.matchedProduct.name, "User Custom Panjabi 1");

  // 9. Test simulated chat with visual inquiry (image base64)
  console.log("Testing POST /api/v1/test-lab/chat with visual screenshot...");
  const chatVisionRes = await app.inject({
    method: "POST",
    url: "/api/v1/test-lab/chat",
    payload: {
      text: "Eta ki ache? Price koto?",
      imageBase64: sampleBase64,
      mimeType: "image/png"
    }
  });
  assert.equal(chatVisionRes.statusCode, 200, "Chat visual simulation should return 200");
  const chatVisionData = JSON.parse(chatVisionRes.body);
  assert(chatVisionData.matchedProduct, "Visual search must return matchedProduct");
  assert(chatVisionData.visualInspection.hasImage, "visualInspection.hasImage must be true");
  assert(chatVisionData.visualInspection.similarityScore > 0, "Similarity score must be > 0");
  assert(chatVisionData.reply, "Visual inquiry must generate grounded reply");

  await app.close();
  console.log("All Test Lab smoke tests passed successfully!");
}

run().catch((err) => {
  console.error("Test Lab smoke test failed:", err);
  process.exit(1);
});

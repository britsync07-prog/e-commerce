import assert from "node:assert/strict";
import { deterministicEmbedding } from "../dist/modules/ai/gemini-embedding.service.js";
import { cosineSimilarityJs } from "../dist/shared/vector-store/postgres-vector.store.js";
import { generateGroundedReply } from "../dist/modules/ai/groq.service.js";
import { extractMetaMessengerEvents } from "../dist/modules/meta/meta.service.js";

async function run() {
  console.log("Running Messenger RAG & Multimodal Visual Search smoke tests...");

  // 1. Vector Embedding Unit-Norm & Determinism
  const v1 = deterministicEmbedding("product-shirt-black-dot");
  const v2 = deterministicEmbedding("product-shirt-black-dot");
  const v3 = deterministicEmbedding("product-red-dress");

  assert.equal(v1.length, 768, "Embedding dimensions must be 768");
  assert.deepEqual(v1, v2, "Identical inputs must yield identical embeddings");

  const norm = Math.sqrt(v1.reduce((sum, val) => sum + val * val, 0));
  assert(Math.abs(norm - 1.0) < 0.05, `Vector must be unit-normalized, got ${norm}`);

  // 2. Cosine Similarity Correctness
  const simSelf = cosineSimilarityJs(v1, v2);
  assert(Math.abs(simSelf - 1.0) < 0.001, `Self-similarity must be 1.0, got ${simSelf}`);

  const simDiff = cosineSimilarityJs(v1, v3);
  assert(simDiff < 0.95, `Different products must have lower similarity, got ${simDiff}`);

  // 3. Grounded Groq Response Generation (Authoritative Price & Stock)
  const aiBrain = {
    enabled: true,
    shopName: "Saimon Lifestyle",
    tone: "friendly",
    systemPrompt: "Answer politely.",
    fallbackMessage: "Please provide more details."
  };

  const inStockProduct = {
    id: "prod-1",
    name: "Black Cotton Panjabi",
    price: 1450,
    currency: "BDT",
    stock: 15,
    variants: [
      { id: "v1", title: "M", price: 1450, stock: 5 },
      { id: "v2", title: "L", price: 1450, stock: 10 }
    ],
    policies: { deliveryCharge: 80, codAllowed: true }
  };

  const responseInStock = await generateGroundedReply({
    aiBrain,
    customerInquiry: "Eta koto? Available ache?",
    matchedProduct: inStockProduct
  });

  assert(responseInStock.includes("1450"), "Response must quote exact price 1450");
  assert(responseInStock.includes("Black Cotton Panjabi"), "Response must mention product name");

  // Test Out-of-Stock grounding
  const outOfStockProduct = {
    ...inStockProduct,
    stock: 0,
    variants: [{ id: "v1", title: "M", price: 1450, stock: 0 }]
  };

  const responseOutOfStock = await generateGroundedReply({
    aiBrain,
    customerInquiry: "Available ache?",
    matchedProduct: outOfStockProduct
  });

  assert(
    responseOutOfStock.toLowerCase().includes("স্টক আউট") || responseOutOfStock.toLowerCase().includes("out of stock"),
    "Response must report out-of-stock without inventing availability"
  );

  // Test Unmatched Product Fallback
  const responseFallback = await generateGroundedReply({
    aiBrain,
    customerInquiry: "Random question",
    matchedProduct: null
  });

  assert(
    responseFallback.includes("Please provide more details") || responseFallback.includes("ধন্যবাদ"),
    "Unmatched inquiry must trigger polite fallback without inventing products or prices"
  );

  // 4. Meta Messenger Webhook Image Extraction
  const metaWebhookPayload = {
    object: "page",
    entry: [
      {
        id: "page-123456",
        time: 1727789000000,
        messaging: [
          {
            sender: { id: "customer-psid-789" },
            recipient: { id: "page-123456" },
            timestamp: 1727789000000,
            message: {
              mid: "mid.998877",
              text: "Eta koto bhai?",
              attachments: [
                {
                  type: "image",
                  payload: {
                    url: "https://lookaside.fbsbx.com/ig_messaging_cdn/?mid=..."
                  }
                }
              ]
            }
          }
        ]
      }
    ]
  };

  const parsedEvents = extractMetaMessengerEvents(metaWebhookPayload);
  assert.equal(parsedEvents.length, 1, "Must extract exactly 1 messenger event");
  assert.equal(parsedEvents[0].senderId, "customer-psid-789");
  assert.equal(parsedEvents[0].text, "Eta koto bhai?");
  assert.equal(parsedEvents[0].attachmentType, "image");
  assert(parsedEvents[0].attachmentUrl?.startsWith("https://lookaside.fbsbx.com"));

  console.log("All Messenger RAG & Multimodal Visual Search smoke tests passed!");
}

run().catch((err) => {
  console.error("Smoke test failed:", err);
  process.exit(1);
});

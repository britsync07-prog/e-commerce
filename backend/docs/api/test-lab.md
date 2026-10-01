# Test Lab API

Purpose: Standalone workbench and testing environment for multimodal product RAG, visual screenshot search, Gemini 002 image embeddings, and Groq LLM grounded answering without requiring a live Facebook Page connection.

Auth: Public / Development test bench. No session token required for `/api/v1/test-lab/*` or `/lab`. Data is isolated to dedicated test shop ID `a0000000-0000-0000-0000-000000000001`.

## `GET /lab` & `GET /api/v1/test-lab/ui`

Request: None.

Response: HTML workbench application (`text/html`) containing the interactive 3-tab workbench: API Keys & AI Persona, 10 Products Catalog & Demo Seeder, and Live Messenger Vision Chat Simulator.

Side effects: None.

Audit/timeline: None.

Cache: No-cache in development.

Errors: None.

## `GET /api/v1/test-lab/status`

Request: None.

Response: `{ "status": "ready", "testShop": { "id": "uuid", "name": "Test Lab Store", "currency": "BDT" }, "totalProducts": 10, "embeddedCount": 10 }`.

Side effects: Automatically creates test shop record and initial test catalog if not existing.

Audit/timeline: None.

Cache: None.

Errors: None.

## `POST /api/v1/test-lab/verify-keys`

Request: `{ "geminiKey": "AIzaSy...", "groqKey": "gsk_..." }`.

Response: `{ "gemini": { "valid": true, "message": "Gemini API key is active and multimodal embedding works." }, "groq": { "valid": true, "message": "Groq API key is valid and responded successfully." } }`.

Side effects: Makes test ping calls to Gemini embedding and Groq chat completion.

Audit/timeline: None.

Cache: None.

Errors: `VALIDATION_ERROR`.

## `GET /api/v1/test-lab/products`

Request: None.

Response: `{ "products": [{ "id": "uuid", "name": "...", "price": 1250, "stock": 10, "sizes": ["M", "L"], "image_url": "...", "is_embedded": true }] }`.

Side effects: None.

Audit/timeline: None.

Cache: None.

Errors: None.

## `POST /api/v1/test-lab/products`

Request: `{ "name": "Black Dot Shirt", "price": 1250, "stock": 12, "imageUrl": "https://...", "description": "Cotton slim fit", "sizes": ["M", "L", "XL"], "geminiKey": "optional-key" }`.

Response: `201` with `{ "product": { ... }, "embedded": true }`.

Side effects: Inserts product into `products` table for test shop and computes Gemini multimodal vector embedding stored in `product_image_embeddings`.

Audit/timeline: None.

Cache: None.

Errors: `VALIDATION_ERROR`.

## `POST /api/v1/test-lab/seed-demo`

Request: `{ "geminiKey": "optional-key" }`.

Response: `201` with `{ "message": "Seeded 10 demo products", "count": 10, "embeddedCount": 10, "products": [...] }`.

Side effects: Clears test shop's previous demo catalog, inserts 10 realistic ecommerce demo items (clothing, shoes, bags, watch, sunglasses) with high-res images, and computes multimodal vector embeddings for all of them.

Audit/timeline: None.

Cache: None.

Errors: `SEED_FAILED`.

## `POST /api/v1/test-lab/batch-products`

Request: `{ "products": [{ "name": "Shirt", "price": 1200, "stock": 10, "imageBase64": "...", "description": "...", "sizes": ["M", "L"] }], "geminiKey": "optional-key" }`.

Response: `201` with `{ "success": true, "count": 10, "products": [...] }`.

Side effects: Clears previous products for test shop, batch inserts up to 10 user products with variants, computes multimodal Gemini image embeddings, and indexes them in PostgreSQL vector store.

Audit/timeline: None.

Cache: None.

Errors: `BATCH_UPLOAD_FAILED`.

## `POST /api/v1/test-lab/chat`

Request: `{ "text": "Eta koto? Stock ache?", "imageUrl": "https://...", "imageBase64": "...", "mimeType": "image/jpeg", "geminiKey": "optional-key", "groqKey": "optional-key", "aiBrain": { "shopName": "Fashion Hub", "tone": "friendly banglish" } }`.

Response:
```json
{
  "reply": "এই Black Dot Shirt টির দাম ১,২৫০ টাকা। M, L এবং XL সাইজ স্টকে আছে! 😊",
  "matchedProduct": {
    "id": "uuid",
    "name": "Black Cotton Casual Shirt with Dots",
    "price": 1250,
    "stock": 15,
    "sizes": ["M", "L", "XL"],
    "similarity": 0.94
  },
  "visualInspection": {
    "hasImage": true,
    "similarityScore": 0.94,
    "vectorSearchMatched": true,
    "vectorLatencyMs": 142,
    "groqLatencyMs": 310
  }
}
```

Side effects: Creates incoming message record in test inbox, performs vector similarity query against PostgreSQL `product_image_embeddings`, generates grounded response with Groq LLM, and records outgoing assistant message.

Audit/timeline: Writes test inbox event.

Cache: None.

Errors: `CHAT_SIMULATION_FAILED`, `VALIDATION_ERROR`.

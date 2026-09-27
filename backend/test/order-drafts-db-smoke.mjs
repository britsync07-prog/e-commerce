import assert from "node:assert/strict";
import pg from "pg";
import { buildApp } from "../dist/app.js";

if (!process.env.DATABASE_URL) {
  console.log("Skipping order drafts DB smoke: DATABASE_URL is not set.");
  process.exit(0);
}

const app = await buildApp();
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });

try {
  await client.connect();
} catch {
  await app.close();
  console.log("Skipping order drafts DB smoke: database is not reachable.");
  process.exit(0);
}

try {
  const stamp = Date.now();
  const email = `order-draft-${stamp}@example.com`;
  const subdomain = `order-draft-${stamp}`;
  const phone = `+88017${stamp.toString().slice(-8)}`;

  const registered = await app.inject({
    method: "POST",
    url: "/api/v1/auth/register",
    payload: { name: "Order Draft Smoke", email, password: "strong-password-123", language: "en" }
  });
  assert.equal(registered.statusCode, 201, registered.body);

  const login = await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { identifier: email, password: "strong-password-123" } });
  assert.equal(login.statusCode, 200, login.body);
  const token = login.json().token;

  const started = await app.inject({
    method: "POST",
    url: "/api/v1/onboarding/start",
    headers: { authorization: `Bearer ${token}` },
    payload: {
      ownerName: "Order Draft Smoke",
      language: "en",
      shopName: "Order Draft Shop",
      subdomain,
      category: "test",
      country: "Bangladesh",
      currency: "BDT"
    }
  });
  assert.equal(started.statusCode, 201, started.body);
  const shopId = started.json().shop.id;

  const product = await app.inject({ method: "POST", url: `/api/v1/onboarding/${shopId}/products`, payload: { name: "Draft Shirt", price: 500, stock: 4 } });
  assert.equal(product.statusCode, 201, product.body);
  await app.inject({ method: "POST", url: `/api/v1/onboarding/${shopId}/channels/meta/skip` });
  await app.inject({ method: "PATCH", url: `/api/v1/onboarding/${shopId}/ai-mode`, payload: { aiMode: "suggest" } });
  const launched = await app.inject({ method: "POST", url: `/api/v1/onboarding/${shopId}/launch` });
  assert.equal(launched.statusCode, 200, launched.body);

  const variant = await client.query("select id from product_variants where shop_id = $1 limit 1", [shopId]);
  const variantId = variant.rows[0].id;

  const conversation = await app.inject({
    method: "POST",
    url: `/api/v1/inbox/shops/${shopId}/conversations`,
    headers: { authorization: `Bearer ${token}` },
    payload: { channel: "manual", buyerExternalId: `buyer-${stamp}`, buyerName: "Buyer One", buyerPhone: phone, message: "I want Draft Shirt" }
  });
  assert.equal(conversation.statusCode, 201, conversation.body);
  const conversationId = conversation.json().conversation.id;

  const draft = await app.inject({
    method: "POST",
    url: `/api/v1/orders/shops/${shopId}/drafts`,
    headers: { authorization: `Bearer ${token}` },
    payload: {
      conversationId,
      customer: { name: "Buyer One", phone },
      items: [{ variantId, quantity: 2, confidence: 0.9 }],
      confidence: 0.8
    }
  });
  assert.equal(draft.statusCode, 201, draft.body);
  assert.equal(draft.json().draft.status, "draft");
  assert.ok(draft.json().draft.risk_reasons.includes("address_missing"));
  const draftId = draft.json().draft.id;

  const blocked = await app.inject({
    method: "POST",
    url: `/api/v1/orders/shops/${shopId}/drafts/${draftId}/confirm`,
    headers: { authorization: `Bearer ${token}` }
  });
  assert.equal(blocked.statusCode, 409, blocked.body);

  const ready = await app.inject({
    method: "PATCH",
    url: `/api/v1/orders/shops/${shopId}/drafts/${draftId}`,
    headers: { authorization: `Bearer ${token}` },
    payload: { customer: { address: "House 1, Road 2, Dhaka" }, status: "ready" }
  });
  assert.equal(ready.statusCode, 200, ready.body);
  assert.equal(ready.json().draft.status, "ready");

  const confirmed = await app.inject({
    method: "POST",
    url: `/api/v1/orders/shops/${shopId}/drafts/${draftId}/confirm`,
    headers: { authorization: `Bearer ${token}` }
  });
  assert.equal(confirmed.statusCode, 201, confirmed.body);
  assert.equal(confirmed.json().order.status, "confirmed");
  assert.equal(Number(confirmed.json().order.total), 1000);

  const stock = await client.query("select coalesce(sum(delta_quantity), 0)::int as quantity from inventory_ledger where shop_id = $1 and variant_id = $2", [
    shopId,
    variantId
  ]);
  assert.equal(Number(stock.rows[0].quantity), 2);

  const again = await app.inject({
    method: "POST",
    url: `/api/v1/orders/shops/${shopId}/drafts/${draftId}/confirm`,
    headers: { authorization: `Bearer ${token}` }
  });
  assert.equal(again.statusCode, 409, again.body);

  console.log("Order drafts DB smoke passed.");
} finally {
  await client.end();
  await app.close();
}

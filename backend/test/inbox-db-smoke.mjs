import assert from "node:assert/strict";
import pg from "pg";
import { buildApp } from "../dist/app.js";

if (!process.env.DATABASE_URL) {
  console.log("Skipping inbox DB smoke: DATABASE_URL is not set.");
  process.exit(0);
}

const app = await buildApp();
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });

try {
  await client.connect();
} catch {
  await app.close();
  console.log("Skipping inbox DB smoke: database is not reachable.");
  process.exit(0);
}

try {
  const stamp = Date.now();
  const email = `inbox-${stamp}@example.com`;
  const subdomain = `inbox-${stamp}`;

  const registered = await app.inject({
    method: "POST",
    url: "/api/v1/auth/register",
    payload: { name: "Inbox Smoke", email, password: "strong-password-123", language: "en" }
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
      ownerName: "Inbox Smoke",
      language: "en",
      shopName: "Inbox Shop",
      subdomain,
      category: "test",
      country: "Bangladesh",
      currency: "BDT"
    }
  });
  assert.equal(started.statusCode, 201, started.body);
  const shopId = started.json().shop.id;

  const product = await app.inject({ method: "POST", url: `/api/v1/onboarding/${shopId}/products`, payload: { name: "Black Shirt", price: 500, stock: 4 } });
  assert.equal(product.statusCode, 201, product.body);
  await app.inject({ method: "POST", url: `/api/v1/onboarding/${shopId}/channels/meta/skip` });
  await app.inject({ method: "PATCH", url: `/api/v1/onboarding/${shopId}/ai-mode`, payload: { aiMode: "suggest" } });
  const launched = await app.inject({ method: "POST", url: `/api/v1/onboarding/${shopId}/launch` });
  assert.equal(launched.statusCode, 200, launched.body);

  const created = await app.inject({
    method: "POST",
    url: `/api/v1/inbox/shops/${shopId}/conversations`,
    headers: { authorization: `Bearer ${token}` },
    payload: {
      channel: "manual",
      buyerExternalId: `buyer-${stamp}`,
      buyerName: "Buyer One",
      buyerPhone: `+88017${stamp.toString().slice(-8)}`,
      message: "Is black shirt available and price?"
    }
  });
  assert.equal(created.statusCode, 201, created.body);
  assert.equal(created.json().messages.length, 1);
  const conversationId = created.json().conversation.id;

  const draft = await app.inject({
    method: "POST",
    url: `/api/v1/inbox/shops/${shopId}/conversations/${conversationId}/ai-drafts`,
    headers: { authorization: `Bearer ${token}` }
  });
  assert.equal(draft.statusCode, 201, draft.body);
  assert.equal(draft.json().draft.status, "suggested");
  assert.match(draft.json().draft.body, /Black Shirt/);
  assert.equal(draft.json().draft.source_refs[0].stock, 4);
  const draftId = draft.json().draft.id;

  const reviewed = await app.inject({
    method: "PATCH",
    url: `/api/v1/inbox/shops/${shopId}/conversations/${conversationId}/ai-drafts/${draftId}/review`,
    headers: { authorization: `Bearer ${token}` },
    payload: { status: "approved", note: "OK" }
  });
  assert.equal(reviewed.statusCode, 200, reviewed.body);
  assert.equal(reviewed.json().drafts[0].status, "approved");

  const listed = await app.inject({
    method: "GET",
    url: `/api/v1/inbox/shops/${shopId}/conversations`,
    headers: { authorization: `Bearer ${token}` }
  });
  assert.equal(listed.statusCode, 200, listed.body);
  assert.equal(listed.json().conversations.length, 1);

  const sensitive = await app.inject({
    method: "POST",
    url: `/api/v1/inbox/shops/${shopId}/conversations/${conversationId}/messages`,
    headers: { authorization: `Bearer ${token}` },
    payload: { source: "buyer", body: "I want refund, this is scam" }
  });
  assert.equal(sensitive.statusCode, 201, sensitive.body);

  const sensitiveDraft = await app.inject({
    method: "POST",
    url: `/api/v1/inbox/shops/${shopId}/conversations/${conversationId}/ai-drafts`,
    headers: { authorization: `Bearer ${token}` }
  });
  assert.equal(sensitiveDraft.statusCode, 201, sensitiveDraft.body);
  assert.equal(sensitiveDraft.json().draft.status, "needs_review");

  console.log("Inbox DB smoke passed.");
} finally {
  await client.end();
  await app.close();
}

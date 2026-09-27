import assert from "node:assert/strict";
import crypto from "node:crypto";
import pg from "pg";
import { buildApp } from "../dist/app.js";

if (!process.env.DATABASE_URL) { console.log("Skipping Meta DB smoke: DATABASE_URL is not set."); process.exit(0); }
if (!process.env.META_WEBHOOK_SECRET || !process.env.META_WEBHOOK_VERIFY_TOKEN) throw new Error("META_WEBHOOK_SECRET and META_WEBHOOK_VERIFY_TOKEN are required");
const app = await buildApp();
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
try { await client.connect(); } catch { await app.close(); console.log("Skipping Meta DB smoke: database is not reachable."); process.exit(0); }

try {
  const stamp = Date.now();
  const email = `meta-${stamp}@example.com`;
  const registered = await app.inject({ method: "POST", url: "/api/v1/auth/register", payload: { name: "Meta Smoke", email, password: "strong-password-123", language: "en" } });
  assert.equal(registered.statusCode, 201, registered.body);
  const login = await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { identifier: email, password: "strong-password-123" } });
  assert.equal(login.statusCode, 200, login.body);
  const token = login.json().token;
  const started = await app.inject({ method: "POST", url: "/api/v1/onboarding/start", headers: { authorization: `Bearer ${token}` }, payload: { ownerName: "Meta Smoke", language: "en", shopName: "Meta Shop", subdomain: `meta-${stamp}`, category: "test", country: "Bangladesh", currency: "BDT" } });
  assert.equal(started.statusCode, 201, started.body);
  const shopId = started.json().shop.id;
  const product = await app.inject({ method: "POST", url: `/api/v1/onboarding/${shopId}/products`, payload: { name: "Meta Catalog Product", price: 700, stock: 2 } });
  assert.equal(product.statusCode, 201, product.body);
  const oauthStart = await app.inject({ method: "GET", url: `/api/v1/meta/shops/${shopId}/oauth/start`, headers: { authorization: `Bearer ${token}` } });
  assert.equal(oauthStart.statusCode, 200, oauthStart.body);
  assert.match(oauthStart.json().authorizationUrl, /facebook\.com/);
  const state = await client.query("select id from meta_oauth_states where shop_id = $1 order by created_at desc limit 1", [shopId]);
  assert.equal(state.rowCount, 1);
  const inserted = await client.query("insert into meta_connections (shop_id, page_id, credential_ref, encrypted_access_token, settings, created_by) values ($1, $2, 'meta-oauth', 'test-encrypted-token', $3, (select owner_user_id from shops where id = $1)) returning id", [shopId, `page-${stamp}`, JSON.stringify({ pageName: "Smoke Page" })]);
  assert.equal(inserted.rowCount, 1);
  const listed = await app.inject({ method: "GET", url: `/api/v1/meta/shops/${shopId}/connections`, headers: { authorization: `Bearer ${token}` } });
  assert.equal(listed.statusCode, 200, listed.body);
  assert.equal(listed.json().connections.length, 1);
  const connectionId = listed.json().connections[0].id;
  const configured = await app.inject({ method: "PUT", url: `/api/v1/meta/shops/${shopId}/catalog-sync`, headers: { authorization: `Bearer ${token}` }, payload: { connectionId, skipUnpublished: true, skipOutOfStock: true } });
  assert.equal(configured.statusCode, 200, configured.body);
  assert.equal(configured.json().catalogSync.status, "pending");
  const preview = await app.inject({ method: "POST", url: `/api/v1/meta/shops/${shopId}/catalog-sync/preview`, headers: { authorization: `Bearer ${token}` }, payload: { skipUnpublished: true, skipOutOfStock: true } });
  assert.equal(preview.statusCode, 200, preview.body);
  assert.equal(preview.json().summary.products, 1);
  assert.equal(preview.json().summary.variants, 1);

  const payload = { object: "page", entry: [{ id: `page-${stamp}`, changes: [{ field: "messages", value: { text: "hello" } }] }] };
  const signature = `sha256=${crypto.createHmac("sha256", process.env.META_WEBHOOK_SECRET).update(JSON.stringify(payload)).digest("hex")}`;
  const event = await app.inject({ method: "POST", url: `/api/v1/webhooks/meta/${shopId}`, headers: { "x-hub-signature-256": signature, "x-meta-event-id": `event-${stamp}` }, payload });
  assert.equal(event.statusCode, 200, event.body);
  assert.equal(event.json().duplicate, false);
  const duplicate = await app.inject({ method: "POST", url: `/api/v1/webhooks/meta/${shopId}`, headers: { "x-hub-signature-256": signature, "x-meta-event-id": `event-${stamp}` }, payload });
  assert.equal(duplicate.statusCode, 200, duplicate.body);
  assert.equal(duplicate.json().duplicate, true);
  const challenge = await app.inject({ method: "GET", url: `/api/v1/webhooks/meta/${shopId}?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(process.env.META_WEBHOOK_VERIFY_TOKEN)}&hub.challenge=challenge-${stamp}` });
  assert.equal(challenge.statusCode, 200, challenge.body);
  assert.equal(challenge.body, `challenge-${stamp}`);
  console.log("Meta DB smoke passed.");
} finally { await client.end(); await app.close(); }

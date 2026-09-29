import assert from "node:assert/strict";
import pg from "pg";
import { buildApp } from "../dist/app.js";

if (!process.env.DATABASE_URL) { console.log("Skipping AI creative DB smoke: DATABASE_URL is not set."); process.exit(0); }
const app = await buildApp();
const client = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 1000 });
try { await client.connect(); } catch { await app.close(); console.log("Skipping AI creative DB smoke: database is not reachable."); process.exit(0); }

try {
  const stamp = Date.now();
  const email = `ai-creative-${stamp}@example.com`;
  const registered = await app.inject({ method: "POST", url: "/api/v1/auth/register", payload: { name: "AI Creative Smoke", email, password: "strong-password-123", language: "en" } });
  assert.equal(registered.statusCode, 201, registered.body);
  const login = await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { identifier: email, password: "strong-password-123" } });
  assert.equal(login.statusCode, 200, login.body);
  const token = login.json().token;
  const started = await app.inject({ method: "POST", url: "/api/v1/onboarding/start", headers: { authorization: `Bearer ${token}` }, payload: { ownerName: "AI Creative Smoke", language: "en", shopName: "AI Creative Shop", subdomain: `aicreative-${stamp}`, category: "fashion", country: "Bangladesh", currency: "BDT" } });
  assert.equal(started.statusCode, 201, started.body);
  const shopId = started.json().shop.id;
  const product = await app.inject({ method: "POST", url: `/api/v1/onboarding/${shopId}/products`, payload: { name: "Creative Shirt", price: 700, stock: 5 } });
  assert.equal(product.statusCode, 201, product.body);
  const productRow = await client.query("select id from products where shop_id = $1 order by created_at desc limit 1", [shopId]);
  const productId = productRow.rows[0].id;

  const rules = await app.inject({ method: "PUT", url: `/api/v1/ai/shops/${shopId}/brand-rules`, headers: { authorization: `Bearer ${token}` }, payload: { rules: { brandVoice: "clear", requiredDisclaimers: ["Stock changes quickly"] }, bannedClaims: ["instant cure"], defaultLanguage: "bn-en", defaultTone: "friendly" } });
  assert.equal(rules.statusCode, 200, rules.body);
  const template = await app.inject({ method: "POST", url: `/api/v1/ai/shops/${shopId}/creative-templates`, headers: { authorization: `Bearer ${token}` }, payload: { name: "Caption Base", format: "caption", template: { structure: "hook-value-cta" } } });
  assert.equal(template.statusCode, 201, template.body);
  const draft = await app.inject({ method: "POST", url: `/api/v1/ai/shops/${shopId}/ad-creatives`, headers: { authorization: `Bearer ${token}` }, payload: { productId, templateId: template.json().template.id, objective: "sell launch stock", offer: "10% off today", audience: "new buyers in Dhaka", language: "bn-en", tone: "friendly" } });
  assert.equal(draft.statusCode, 201, draft.body);
  assert.equal(draft.json().request.status, "awaiting_review");
  assert.equal(draft.json().outputs.length, 5);
  assert.ok(draft.json().outputs.every((output) => output.status === "review_only"));
  const blocked = await app.inject({ method: "POST", url: `/api/v1/ai/shops/${shopId}/ad-creatives`, headers: { authorization: `Bearer ${token}` }, payload: { productId, objective: "guaranteed result instant cure", audience: "everyone", tone: "urgent" } });
  assert.equal(blocked.statusCode, 201, blocked.body);
  assert.equal(blocked.json().request.status, "blocked");
  assert.equal(blocked.json().outputs.length, 0);
  const list = await app.inject({ method: "GET", url: `/api/v1/ai/shops/${shopId}/ad-creatives?productId=${productId}`, headers: { authorization: `Bearer ${token}` } });
  assert.equal(list.statusCode, 200, list.body);
  assert.equal(list.json().requests.length, 2);
  const audit = await client.query("select count(*)::int as count from audit_events where shop_id = $1 and action in ('ai.brand_rules_updated', 'ai.creative_template_created', 'ai.ad_creative_requested')", [shopId]);
  assert.ok(audit.rows[0].count >= 4);
  console.log("AI creative DB smoke passed.");
} finally {
  await client.end();
  await app.close();
}

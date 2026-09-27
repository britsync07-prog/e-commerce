import assert from "node:assert/strict";
import pg from "pg";
import { buildApp } from "../dist/app.js";

if (!process.env.DATABASE_URL) { console.log("Skipping analytics DB smoke: DATABASE_URL is not set."); process.exit(0); }
const app = await buildApp();
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
try { await client.connect(); } catch { await app.close(); console.log("Skipping analytics DB smoke: database is not reachable."); process.exit(0); }

try {
  const stamp = Date.now();
  const email = `analytics-${stamp}@example.com`;
  const registered = await app.inject({ method: "POST", url: "/api/v1/auth/register", payload: { name: "Analytics Smoke", email, password: "strong-password-123", language: "en" } });
  assert.equal(registered.statusCode, 201, registered.body);
  const login = await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { identifier: email, password: "strong-password-123" } });
  assert.equal(login.statusCode, 200, login.body);
  const token = login.json().token;
  const started = await app.inject({ method: "POST", url: "/api/v1/onboarding/start", headers: { authorization: `Bearer ${token}` }, payload: { ownerName: "Analytics Smoke", language: "en", shopName: "Analytics Shop", subdomain: `analytics-${stamp}`, category: "test", country: "Bangladesh", currency: "BDT" } });
  assert.equal(started.statusCode, 201, started.body);
  const shopId = started.json().shop.id;
  const product = await app.inject({ method: "POST", url: `/api/v1/onboarding/${shopId}/products`, payload: { name: "Analytics Shirt", price: 500, stock: 2 } });
  assert.equal(product.statusCode, 201, product.body);
  await app.inject({ method: "POST", url: `/api/v1/onboarding/${shopId}/channels/meta/skip` });
  await app.inject({ method: "PATCH", url: `/api/v1/onboarding/${shopId}/ai-mode`, payload: { aiMode: "suggest" } });
  await app.inject({ method: "POST", url: `/api/v1/onboarding/${shopId}/launch` });
  const variant = await client.query("select id from product_variants where shop_id = $1 limit 1", [shopId]);
  const checkout = await app.inject({ method: "POST", url: "/api/v1/orders/checkout", payload: { subdomain: `analytics-${stamp}`, customer: { name: "Buyer", phone: `+88017${stamp.toString().slice(-8)}`, address: "House 1, Dhaka" }, items: [{ variantId: variant.rows[0].id, quantity: 1 }], paymentMethod: "cod" } });
  assert.equal(checkout.statusCode, 201, checkout.body);
  const metrics = await app.inject({ method: "GET", url: `/api/v1/analytics/shops/${shopId}/metrics?from=2026-01-01&to=2026-12-31`, headers: { authorization: `Bearer ${token}` } });
  assert.equal(metrics.statusCode, 200, metrics.body);
  assert.equal(metrics.json().orders.confirmed, 1);
  assert.equal(Number(metrics.json().sales.grossRevenue), 500);
  assert.equal(metrics.json().delivery.failedDeliveries.total, 0);
  assert.equal(metrics.json().ai.drafts.total, 0);
  const report = await app.inject({ method: "GET", url: `/api/v1/analytics/shops/${shopId}/reports/orders?from=2026-01-01&to=2026-12-31&status=confirmed`, headers: { authorization: `Bearer ${token}` } });
  assert.equal(report.statusCode, 200, report.body);
  assert.equal(report.json().totals.count, 1);
  const csv = await app.inject({ method: "GET", url: `/api/v1/analytics/shops/${shopId}/reports/orders?from=2026-01-01&to=2026-12-31&format=csv`, headers: { authorization: `Bearer ${token}` } });
  assert.equal(csv.statusCode, 200, csv.body);
  assert.match(csv.body, /id,status,source,total/);
  const events = await app.inject({ method: "GET", url: `/api/v1/analytics/shops/${shopId}/events?from=2026-01-01&to=2026-12-31`, headers: { authorization: `Bearer ${token}` } });
  assert.equal(events.statusCode, 200, events.body);
  assert.ok(events.json().events.some((event) => event.entity_type === "orders"));
  console.log("Analytics DB smoke passed.");
} finally { await client.end(); await app.close(); }

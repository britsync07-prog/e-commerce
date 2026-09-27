import assert from "node:assert/strict";
import pg from "pg";
import { buildApp } from "../dist/app.js";

if (!process.env.DATABASE_URL) { console.log("Skipping customers DB smoke: DATABASE_URL is not set."); process.exit(0); }
const app = await buildApp();
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
try { await client.connect(); } catch { await app.close(); console.log("Skipping customers DB smoke: database is not reachable."); process.exit(0); }

try {
  const stamp = Date.now();
  const email = `customers-${stamp}@example.com`;
  const phone = `+88017${stamp.toString().slice(-8)}`;
  const registered = await app.inject({ method: "POST", url: "/api/v1/auth/register", payload: { name: "Customers Smoke", email, password: "strong-password-123", language: "en" } });
  assert.equal(registered.statusCode, 201, registered.body);
  const login = await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { identifier: email, password: "strong-password-123" } });
  assert.equal(login.statusCode, 200, login.body);
  const token = login.json().token;
  const subdomain = `customers-${stamp}`;
  const started = await app.inject({ method: "POST", url: "/api/v1/onboarding/start", headers: { authorization: `Bearer ${token}` }, payload: { ownerName: "Customers Smoke", language: "en", shopName: "Customers Shop", subdomain, category: "test", country: "Bangladesh", currency: "BDT" } });
  assert.equal(started.statusCode, 201, started.body);
  const shopId = started.json().shop.id;
  const product = await app.inject({ method: "POST", url: `/api/v1/onboarding/${shopId}/products`, payload: { name: "Customer Shirt", price: 500, stock: 2 } });
  assert.equal(product.statusCode, 201, product.body);
  await app.inject({ method: "POST", url: `/api/v1/onboarding/${shopId}/channels/meta/skip` });
  await app.inject({ method: "PATCH", url: `/api/v1/onboarding/${shopId}/ai-mode`, payload: { aiMode: "suggest" } });
  await app.inject({ method: "POST", url: `/api/v1/onboarding/${shopId}/launch` });
  const variant = await client.query("select id from product_variants where shop_id = $1 limit 1", [shopId]);
  const checkout = await app.inject({ method: "POST", url: "/api/v1/orders/checkout", payload: { subdomain, customer: { name: "Customer Buyer", phone, address: "House 1, Dhaka" }, items: [{ variantId: variant.rows[0].id, quantity: 1 }], paymentMethod: "cod" } });
  assert.equal(checkout.statusCode, 201, checkout.body);
  const customer = await client.query("select id from customers where shop_id = $1 and phone = $2", [shopId, phone]);
  const customerId = customer.rows[0].id;
  const list = await app.inject({ method: "GET", url: `/api/v1/customers/shops/${shopId}/customers`, headers: { authorization: `Bearer ${token}` } });
  assert.equal(list.statusCode, 200, list.body);
  assert.equal(list.json().customers[0].order_count, 1);
  const tagged = await app.inject({ method: "POST", url: `/api/v1/customers/shops/${shopId}/customers/${customerId}/tags`, headers: { authorization: `Bearer ${token}` }, payload: { name: "vip" } });
  assert.equal(tagged.statusCode, 200, tagged.body);
  assert.equal(tagged.json().tags[0].name, "vip");
  const consent = await app.inject({ method: "PATCH", url: `/api/v1/customers/shops/${shopId}/customers/${customerId}/consent`, headers: { authorization: `Bearer ${token}` }, payload: { status: "opted_out", reason: "Buyer requested no marketing" } });
  assert.equal(consent.statusCode, 200, consent.body);
  assert.equal(consent.json().customer.consent_status, "opted_out");
  assert.ok(consent.json().timeline.some((event) => event.type === "order"));
  console.log("Customers DB smoke passed.");
} finally { await client.end(); await app.close(); }

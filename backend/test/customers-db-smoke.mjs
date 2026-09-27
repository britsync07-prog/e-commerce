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
  const coupon = await app.inject({ method: "POST", url: `/api/v1/marketing/shops/${shopId}/coupons`, headers: { authorization: `Bearer ${token}` }, payload: { code: "WELCOME10", discountType: "percent", discountValue: 10, usageLimit: 1 } });
  assert.equal(coupon.statusCode, 201, coupon.body);
  const variant = await client.query("select id from product_variants where shop_id = $1 limit 1", [shopId]);
  const checkout = await app.inject({ method: "POST", url: "/api/v1/orders/checkout", payload: { subdomain, customer: { name: "Customer Buyer", phone, address: "House 1, Dhaka" }, items: [{ variantId: variant.rows[0].id, quantity: 1 }], couponCode: "WELCOME10", paymentMethod: "cod" } });
  assert.equal(checkout.statusCode, 201, checkout.body);
  assert.equal(Number(checkout.json().order.total), 450);
  const customer = await client.query("select id from customers where shop_id = $1 and phone = $2", [shopId, phone]);
  const customerId = customer.rows[0].id;
  const list = await app.inject({ method: "GET", url: `/api/v1/customers/shops/${shopId}/customers`, headers: { authorization: `Bearer ${token}` } });
  assert.equal(list.statusCode, 200, list.body);
  assert.equal(list.json().customers[0].order_count, 1);
  const tagged = await app.inject({ method: "POST", url: `/api/v1/customers/shops/${shopId}/customers/${customerId}/tags`, headers: { authorization: `Bearer ${token}` }, payload: { name: "vip" } });
  assert.equal(tagged.statusCode, 200, tagged.body);
  assert.equal(tagged.json().tags[0].name, "vip");
  const segment = await app.inject({ method: "POST", url: `/api/v1/marketing/shops/${shopId}/segments`, headers: { authorization: `Bearer ${token}` }, payload: { name: "VIP Buyers", definition: { tag: "vip", minOrders: 1, minLifetimeValue: 0 } } });
  assert.equal(segment.statusCode, 201, segment.body);
  const segmentId = segment.json().segment.id;
  const preview = await app.inject({ method: "POST", url: `/api/v1/marketing/shops/${shopId}/segments/${segmentId}/preview`, headers: { authorization: `Bearer ${token}` } });
  assert.equal(preview.statusCode, 200, preview.body);
  assert.equal(preview.json().count, 1);
  const broadcast = await app.inject({ method: "POST", url: `/api/v1/marketing/shops/${shopId}/broadcasts`, headers: { authorization: `Bearer ${token}` }, payload: { name: "VIP Update", segmentId, channel: "messenger", body: "New stock is available", rateLimitPerMinute: 20 } });
  assert.equal(broadcast.statusCode, 201, broadcast.body);
  const broadcastId = broadcast.json().broadcast.id;
  const broadcastPreview = await app.inject({ method: "POST", url: `/api/v1/marketing/shops/${shopId}/broadcasts/${broadcastId}/preview`, headers: { authorization: `Bearer ${token}` } });
  assert.equal(broadcastPreview.statusCode, 200, broadcastPreview.body);
  assert.equal(broadcastPreview.json().audienceCount, 1);
  const approved = await app.inject({ method: "POST", url: `/api/v1/marketing/shops/${shopId}/broadcasts/${broadcastId}/approve`, headers: { authorization: `Bearer ${token}` }, payload: { reason: "Approved for the weekly VIP update" } });
  assert.equal(approved.statusCode, 200, approved.body);
  assert.equal(approved.json().broadcast.status, "approved");
  const consent = await app.inject({ method: "PATCH", url: `/api/v1/customers/shops/${shopId}/customers/${customerId}/consent`, headers: { authorization: `Bearer ${token}` }, payload: { status: "opted_out", reason: "Buyer requested no marketing" } });
  assert.equal(consent.statusCode, 200, consent.body);
  assert.equal(consent.json().customer.consent_status, "opted_out");
  assert.ok(consent.json().timeline.some((event) => event.type === "order"));
  const optedOutPreview = await app.inject({ method: "POST", url: `/api/v1/marketing/shops/${shopId}/segments/${segmentId}/preview`, headers: { authorization: `Bearer ${token}` } });
  assert.equal(optedOutPreview.statusCode, 200, optedOutPreview.body);
  assert.equal(optedOutPreview.json().count, 0);
  const optedOutBroadcastPreview = await app.inject({ method: "POST", url: `/api/v1/marketing/shops/${shopId}/broadcasts/${broadcastId}/preview`, headers: { authorization: `Bearer ${token}` } });
  assert.equal(optedOutBroadcastPreview.statusCode, 200, optedOutBroadcastPreview.body);
  assert.equal(optedOutBroadcastPreview.json().audienceCount, 0);
  console.log("Customers DB smoke passed.");
} finally { await client.end(); await app.close(); }

import assert from "node:assert/strict";
import pg from "pg";
import { buildApp } from "../dist/app.js";

if (!process.env.DATABASE_URL) { console.log("Skipping payments DB smoke: DATABASE_URL is not set."); process.exit(0); }
const app = await buildApp();
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
try { await client.connect(); } catch { await app.close(); console.log("Skipping payments DB smoke: database is not reachable."); process.exit(0); }

try {
  const stamp = Date.now();
  const email = `payments-${stamp}@example.com`;
  const started = await app.inject({ method: "POST", url: "/api/v1/auth/register", payload: { name: "Payments Test", email, password: "strong-password-123", language: "en" } });
  assert.equal(started.statusCode, 201, started.body);
  const login = await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { identifier: email, password: "strong-password-123" } });
  assert.equal(login.statusCode, 200, login.body);
  const token = login.json().token;
  const onboarding = await app.inject({ method: "POST", url: "/api/v1/onboarding/start", headers: { authorization: `Bearer ${token}` }, payload: { ownerName: "Payments Test", language: "en", shopName: "Payments Shop", subdomain: `payments-${stamp}`, category: "test", country: "Bangladesh", currency: "BDT" } });
  assert.equal(onboarding.statusCode, 201, onboarding.body);
  const shopId = onboarding.json().shop.id;
  const product = await app.inject({ method: "POST", url: `/api/v1/onboarding/${shopId}/products`, payload: { name: "Payment Shirt", price: 500, stock: 2 } });
  assert.equal(product.statusCode, 201, product.body);
  await app.inject({ method: "POST", url: `/api/v1/onboarding/${shopId}/channels/meta/skip` });
  await app.inject({ method: "PATCH", url: `/api/v1/onboarding/${shopId}/ai-mode`, payload: { aiMode: "suggest" } });
  await app.inject({ method: "POST", url: `/api/v1/onboarding/${shopId}/launch` });
  const variant = await client.query("select id from product_variants where shop_id = $1 limit 1", [shopId]);
  const checkout = await app.inject({ method: "POST", url: "/api/v1/orders/checkout", payload: { subdomain: `payments-${stamp}`, customer: { name: "Buyer", phone: `+88017${stamp.toString().slice(-8)}`, address: "House 1, Dhaka" }, items: [{ variantId: variant.rows[0].id, quantity: 1 }], paymentMethod: "cod" } });
  assert.equal(checkout.statusCode, 201, checkout.body);
  const orderId = checkout.json().order.id;
  const marked = await app.inject({ method: "POST", url: `/api/v1/payments/shops/${shopId}/orders/${orderId}/payments/manual`, headers: { authorization: `Bearer ${token}`, "idempotency-key": `payment-${stamp}` }, payload: { note: "Cash received" } });
  assert.equal(marked.statusCode, 201, marked.body);
  assert.equal(marked.json().payment.status, "marked_paid");
  assert.equal(marked.json().events.length, 2);
  const paymentReplay = await app.inject({ method: "POST", url: `/api/v1/payments/shops/${shopId}/orders/${orderId}/payments/manual`, headers: { authorization: `Bearer ${token}`, "idempotency-key": `payment-${stamp}` }, payload: { note: "Cash received" } });
  assert.equal(paymentReplay.statusCode, 201, paymentReplay.body);
  assert.equal(paymentReplay.json().payment.id, marked.json().payment.id);
  const listed = await app.inject({ method: "GET", url: `/api/v1/payments/shops/${shopId}/payments`, headers: { authorization: `Bearer ${token}` } });
  assert.equal(listed.statusCode, 200, listed.body);
  const paymentId = listed.json().payments[0].id;
  const refunded = await app.inject({ method: "POST", url: `/api/v1/payments/shops/${shopId}/payments/${paymentId}/refund`, headers: { authorization: `Bearer ${token}` }, payload: { note: "Buyer cancelled" } });
  assert.equal(refunded.statusCode, 200, refunded.body);
  assert.equal(refunded.json().payment.status, "refunded");
  assert.equal(refunded.json().events.length, 3);
  const settlement = await app.inject({ method: "POST", url: `/api/v1/payments/shops/${shopId}/cod-settlements`, headers: { authorization: `Bearer ${token}` }, payload: {
    statementRef: `statement-${stamp}`, courierName: "Test Courier", statementDate: "2026-09-28", collectedAmount: 500,
    rows: [{ externalRef: "matched-row", orderId, amount: 500 }, { externalRef: "unknown-row", amount: 100 }]
  } });
  assert.equal(settlement.statusCode, 201, settlement.body);
  assert.equal(settlement.json().settlement.status, "issue");
  assert.equal(settlement.json().rows.filter((row) => row.status === "unmatched").length, 1);
  const settlements = await app.inject({ method: "GET", url: `/api/v1/payments/shops/${shopId}/cod-settlements`, headers: { authorization: `Bearer ${token}` } });
  assert.equal(settlements.statusCode, 200, settlements.body);
  assert.equal(settlements.json().settlements[0].unmatched_count, 1);
  const audit = await app.inject({ method: "GET", url: `/api/v1/shops/${shopId}/audit`, headers: { authorization: `Bearer ${token}` } });
  assert.equal(audit.statusCode, 200, audit.body);
  assert.ok(audit.json().audit.some((event) => event.action === "payment.marked_paid"));
  assert.ok(audit.json().audit.some((event) => event.action === "payment.refunded"));
  assert.ok(audit.json().audit.some((event) => event.action === "payment.cod_settlement_imported"));
  console.log("Payments DB smoke passed.");
} finally { await client.end(); await app.close(); }

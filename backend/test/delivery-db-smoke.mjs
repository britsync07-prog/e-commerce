import assert from "node:assert/strict";
import pg from "pg";
import { buildApp } from "../dist/app.js";

if (!process.env.DATABASE_URL) {
  console.log("Skipping delivery DB smoke: DATABASE_URL is not set.");
  process.exit(0);
}

const app = await buildApp();
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });

try {
  await client.connect();
} catch {
  await app.close();
  console.log("Skipping delivery DB smoke: database is not reachable.");
  process.exit(0);
}

try {
  const stamp = Date.now();
  const email = `delivery-${stamp}@example.com`;
  const subdomain = `delivery-${stamp}`;
  const phone = `+88017${stamp.toString().slice(-8)}`;

  const registered = await app.inject({
    method: "POST",
    url: "/api/v1/auth/register",
    payload: { name: "Delivery Smoke", email, password: "strong-password-123", language: "en" }
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
      ownerName: "Delivery Smoke",
      language: "en",
      shopName: "Delivery Shop",
      subdomain,
      category: "test",
      country: "Bangladesh",
      currency: "BDT"
    }
  });
  assert.equal(started.statusCode, 201, started.body);
  const shopId = started.json().shop.id;

  const product = await app.inject({ method: "POST", url: `/api/v1/onboarding/${shopId}/products`, payload: { name: "Delivery Shirt", price: 500, stock: 4 } });
  assert.equal(product.statusCode, 201, product.body);
  await app.inject({ method: "POST", url: `/api/v1/onboarding/${shopId}/channels/meta/skip` });
  await app.inject({ method: "PATCH", url: `/api/v1/onboarding/${shopId}/ai-mode`, payload: { aiMode: "suggest" } });
  const launched = await app.inject({ method: "POST", url: `/api/v1/onboarding/${shopId}/launch` });
  assert.equal(launched.statusCode, 200, launched.body);

  const variant = await client.query("select id from product_variants where shop_id = $1 limit 1", [shopId]);
  const checkout = await app.inject({
    method: "POST",
    url: "/api/v1/orders/checkout",
    payload: {
      subdomain,
      customer: { name: "Buyer One", phone, address: "House 1, Road 2, Dhaka", city: "Dhaka" },
      items: [{ variantId: variant.rows[0].id, quantity: 1 }],
      paymentMethod: "cod"
    }
  });
  assert.equal(checkout.statusCode, 201, checkout.body);
  const orderId = checkout.json().order.id;

  const packed = await app.inject({
    method: "PATCH",
    url: `/api/v1/orders/shops/${shopId}/orders/${orderId}/status`,
    headers: { authorization: `Bearer ${token}` },
    payload: { status: "packed" }
  });
  assert.equal(packed.statusCode, 200, packed.body);

  const booked = await app.inject({
    method: "POST",
    url: `/api/v1/delivery/shops/${shopId}/shipments/manual`,
    headers: { authorization: `Bearer ${token}` },
    payload: { orderId, courierName: "Manual Courier", trackingNumber: `TRK-${stamp}`, fee: 80, note: "Booked from smoke" }
  });
  assert.equal(booked.statusCode, 201, booked.body);
  assert.equal(booked.json().shipment.status, "booked");
  assert.equal(booked.json().shipment.order_status, "shipped");
  const shipmentId = booked.json().shipment.id;

  const list = await app.inject({
    method: "GET",
    url: `/api/v1/delivery/shops/${shopId}/shipments`,
    headers: { authorization: `Bearer ${token}` }
  });
  assert.equal(list.statusCode, 200, list.body);
  assert.equal(list.json().shipments.length, 1);

  const noReason = await app.inject({
    method: "PATCH",
    url: `/api/v1/delivery/shops/${shopId}/shipments/${shipmentId}/status`,
    headers: { authorization: `Bearer ${token}` },
    payload: { status: "failed" }
  });
  assert.equal(noReason.statusCode, 400, noReason.body);

  const failed = await app.inject({
    method: "PATCH",
    url: `/api/v1/delivery/shops/${shopId}/shipments/${shipmentId}/status`,
    headers: { authorization: `Bearer ${token}` },
    payload: { status: "failed", note: "Buyer unavailable", contactResult: "Buyer requested tomorrow", rescheduleDate: "2026-10-01" }
  });
  assert.equal(failed.statusCode, 200, failed.body);
  assert.equal(failed.json().shipment.status, "failed");
  assert.equal(failed.json().failedDeliveries[0].status, "open");

  const rescheduled = await app.inject({
    method: "POST",
    url: `/api/v1/delivery/shops/${shopId}/shipments/${shipmentId}/reschedule`,
    headers: { authorization: `Bearer ${token}` },
    payload: { rescheduleDate: "2026-10-01", contactResult: "Buyer confirmed tomorrow", note: "Retry approved" }
  });
  assert.equal(rescheduled.statusCode, 200, rescheduled.body);
  assert.equal(rescheduled.json().shipment.status, "in_transit");
  assert.equal(rescheduled.json().failedDeliveries[0].status, "rescheduled");

  const delivered = await app.inject({
    method: "PATCH",
    url: `/api/v1/delivery/shops/${shopId}/shipments/${shipmentId}/status`,
    headers: { authorization: `Bearer ${token}` },
    payload: { status: "delivered", note: "Delivered by courier" }
  });
  assert.equal(delivered.statusCode, 200, delivered.body);
  assert.equal(delivered.json().shipment.status, "delivered");
  assert.equal(delivered.json().shipment.order_status, "delivered");
  assert.equal(delivered.json().events.length, 4);

  const tracked = await app.inject({ method: "GET", url: `/api/v1/orders/track?orderId=${orderId}&phone=${encodeURIComponent(phone)}` });
  assert.equal(tracked.statusCode, 200, tracked.body);
  assert.equal(tracked.json().order.status, "delivered");

  console.log("Delivery DB smoke passed.");
} finally {
  await client.end();
  await app.close();
}

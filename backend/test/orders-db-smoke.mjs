import assert from "node:assert/strict";
import pg from "pg";
import { buildApp } from "../dist/app.js";

if (!process.env.DATABASE_URL) {
  console.log("Skipping orders DB smoke: DATABASE_URL is not set.");
  process.exit(0);
}

const app = await buildApp();
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

try {
  const stamp = Date.now();
  const registered = await app.inject({
    method: "POST",
    url: "/api/v1/auth/register",
    payload: {
      name: "Order Smoke",
      email: `order-smoke-${stamp}@example.com`,
      password: "strong-password-123",
      language: "en"
    }
  });
  assert.equal(registered.statusCode, 201, registered.body);

  const login = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: {
      identifier: `order-smoke-${stamp}@example.com`,
      password: "strong-password-123"
    }
  });
  const token = login.json().token;

  const started = await app.inject({
    method: "POST",
    url: "/api/v1/onboarding/start",
    headers: { authorization: `Bearer ${token}` },
    payload: {
      ownerName: "Order Smoke",
      language: "en",
      shopName: "Order Smoke Shop",
      subdomain: `order-smoke-${stamp}`,
      category: "test",
      country: "Bangladesh",
      currency: "BDT"
    }
  });
  assert.equal(started.statusCode, 201, started.body);
  const shopId = started.json().shop.id;

  const product = await app.inject({
    method: "POST",
    url: `/api/v1/onboarding/${shopId}/products`,
    payload: { name: "Checkout Shirt", price: 500, stock: 4 }
  });
  assert.equal(product.statusCode, 201, product.body);

  await app.inject({ method: "POST", url: `/api/v1/onboarding/${shopId}/channels/meta/skip` });
  await app.inject({ method: "PATCH", url: `/api/v1/onboarding/${shopId}/ai-mode`, payload: { aiMode: "suggest" } });
  const launched = await app.inject({ method: "POST", url: `/api/v1/onboarding/${shopId}/launch` });
  assert.equal(launched.statusCode, 200, launched.body);

  const variant = await client.query("select id from product_variants where shop_id = $1 limit 1", [shopId]);
  const variantId = variant.rows[0].id;

  const checkout = await app.inject({
    method: "POST",
    url: "/api/v1/orders/checkout",
    headers: { "idempotency-key": `checkout-${stamp}` },
    payload: {
      subdomain: `order-smoke-${stamp}`,
      customer: {
        name: "Buyer One",
        phone: `+88017${stamp.toString().slice(-8)}`,
        address: "House 1, Road 2, Dhaka",
        city: "Dhaka"
      },
      items: [{ variantId, quantity: 2 }],
      paymentMethod: "cod"
    }
  });
  assert.equal(checkout.statusCode, 201, checkout.body);
  assert.equal(checkout.json().order.status, "confirmed");
  assert.equal(Number(checkout.json().order.total), 1000);

  const replay = await app.inject({
    method: "POST",
    url: "/api/v1/orders/checkout",
    headers: { "idempotency-key": `checkout-${stamp}` },
    payload: {
      subdomain: `order-smoke-${stamp}`,
      customer: { name: "Buyer One", phone: `+88017${stamp.toString().slice(-8)}`, address: "House 1, Road 2, Dhaka", city: "Dhaka" },
      items: [{ variantId, quantity: 2 }],
      paymentMethod: "cod"
    }
  });
  assert.equal(replay.statusCode, 201, replay.body);
  assert.equal(replay.json().order.id, checkout.json().order.id);

  const stock = await client.query("select coalesce(sum(delta_quantity), 0)::int as quantity from inventory_ledger where variant_id = $1", [variantId]);
  assert.equal(Number(stock.rows[0].quantity), 2);

  const concurrentPayload = (phone) => ({
    subdomain: `order-smoke-${stamp}`,
    customer: { name: "Concurrent Buyer", phone, address: "House 2, Road 3, Dhaka" },
    items: [{ variantId, quantity: 2 }],
    paymentMethod: "cod"
  });
  const concurrent = await Promise.all([
    app.inject({ method: "POST", url: "/api/v1/orders/checkout", payload: concurrentPayload(`+88019${stamp.toString().slice(-8)}`) }),
    app.inject({ method: "POST", url: "/api/v1/orders/checkout", payload: concurrentPayload(`+88016${stamp.toString().slice(-8)}`) })
  ]);
  assert.deepEqual(concurrent.map((response) => response.statusCode).sort((a, b) => a - b), [201, 409], concurrent.map((response) => response.body));

  const depleted = await client.query("select coalesce(sum(delta_quantity), 0)::int as quantity from inventory_ledger where variant_id = $1", [variantId]);
  assert.equal(Number(depleted.rows[0].quantity), 0);

  const tracked = await app.inject({
    method: "GET",
    url: `/api/v1/orders/track?orderId=${checkout.json().order.id}&phone=${encodeURIComponent(`+88017${stamp.toString().slice(-8)}`)}`
  });
  assert.equal(tracked.statusCode, 200, tracked.body);
  assert.equal(tracked.json().order.id, checkout.json().order.id);

  const blocked = await app.inject({
    method: "POST",
    url: "/api/v1/orders/checkout",
    payload: {
      subdomain: `order-smoke-${stamp}`,
      customer: {
        name: "Buyer Two",
        phone: `+88018${stamp.toString().slice(-8)}`,
        address: "House 1, Road 2, Dhaka"
      },
      items: [{ variantId, quantity: 99 }],
      paymentMethod: "cod"
    }
  });
  assert.equal(blocked.statusCode, 409, blocked.body);

  console.log("Orders DB smoke passed.");
} finally {
  await client.end();
  await app.close();
}

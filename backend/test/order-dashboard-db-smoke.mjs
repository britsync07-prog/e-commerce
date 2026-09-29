import assert from "node:assert/strict";
import pg from "pg";
import { buildApp } from "../dist/app.js";

if (!process.env.DATABASE_URL) {
  console.log("Skipping order dashboard DB smoke: DATABASE_URL is not set.");
  process.exit(0);
}

const app = await buildApp();
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
try {
  await client.connect();
} catch {
  await app.close();
  console.log("Skipping order dashboard DB smoke: database is not reachable.");
  process.exit(0);
}

try {
  const stamp = Date.now();
  const email = `order-dashboard-${stamp}@example.com`;
  const subdomain = `order-dashboard-${stamp}`;
  const phone = `+88017${stamp.toString().slice(-8)}`;

  const registered = await app.inject({
    method: "POST",
    url: "/api/v1/auth/register",
    payload: { name: "Order Dashboard", email, password: "strong-password-123", language: "en" }
  });
  assert.equal(registered.statusCode, 201, registered.body);

  const login = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: { identifier: email, password: "strong-password-123" }
  });
  assert.equal(login.statusCode, 200, login.body);
  const token = login.json().token;

  const started = await app.inject({
    method: "POST",
    url: "/api/v1/onboarding/start",
    headers: { authorization: `Bearer ${token}` },
    payload: {
      ownerName: "Order Dashboard",
      language: "en",
      shopName: "Order Dashboard Shop",
      subdomain,
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
    payload: { name: "Dashboard Shirt", price: 500, stock: 4 }
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
    payload: {
      subdomain,
      customer: { name: "Buyer One", phone, address: "House 1, Road 2, Dhaka", city: "Dhaka" },
      items: [{ variantId, quantity: 2 }],
      paymentMethod: "cod"
    }
  });
  assert.equal(checkout.statusCode, 201, checkout.body);
  const orderId = checkout.json().order.id;

  const list = await app.inject({
    method: "GET",
    url: `/api/v1/orders/shops/${shopId}/orders`,
    headers: { authorization: `Bearer ${token}` }
  });
  assert.equal(list.statusCode, 200, list.body);
  assert.equal(list.json().orders.length, 1);

  const detail = await app.inject({
    method: "GET",
    url: `/api/v1/orders/shops/${shopId}/orders/${orderId}`,
    headers: { authorization: `Bearer ${token}` }
  });
  assert.equal(detail.statusCode, 200, detail.body);
  assert.equal(detail.json().order.status, "confirmed");

  const noReason = await app.inject({
    method: "PATCH",
    url: `/api/v1/orders/shops/${shopId}/orders/${orderId}/status`,
    headers: { authorization: `Bearer ${token}` },
    payload: { status: "cancelled" }
  });
  assert.equal(noReason.statusCode, 400, noReason.body);

  const packed = await app.inject({
    method: "PATCH",
    url: `/api/v1/orders/shops/${shopId}/orders/${orderId}/status`,
    headers: { authorization: `Bearer ${token}` },
    payload: { status: "packed" }
  });
  assert.equal(packed.statusCode, 200, packed.body);
  assert.equal(packed.json().order.status, "packed");

  const skipped = await app.inject({
    method: "PATCH",
    url: `/api/v1/orders/shops/${shopId}/orders/${orderId}/status`,
    headers: { authorization: `Bearer ${token}` },
    payload: { status: "delivered" }
  });
  assert.equal(skipped.statusCode, 409, skipped.body);

  const cancelled = await app.inject({
    method: "PATCH",
    url: `/api/v1/orders/shops/${shopId}/orders/${orderId}/status`,
    headers: { authorization: `Bearer ${token}` },
    payload: { status: "cancelled", reason: "Buyer requested cancel" }
  });
  assert.equal(cancelled.statusCode, 200, cancelled.body);
  assert.equal(cancelled.json().order.status, "cancelled");

  const stock = await client.query("select coalesce(sum(delta_quantity), 0)::int as quantity from inventory_ledger where shop_id = $1 and variant_id = $2", [
    shopId,
    variantId
  ]);
  assert.equal(Number(stock.rows[0].quantity), 4);

  const finalMove = await app.inject({
    method: "PATCH",
    url: `/api/v1/orders/shops/${shopId}/orders/${orderId}/status`,
    headers: { authorization: `Bearer ${token}` },
    payload: { status: "shipped" }
  });
  assert.equal(finalMove.statusCode, 409, finalMove.body);

  const bookableCheckout = await app.inject({
    method: "POST",
    url: "/api/v1/orders/checkout",
    payload: {
      subdomain,
      customer: { name: "Buyer Two", phone: `+88018${stamp.toString().slice(-8)}`, address: "House 2, Road 3, Dhaka" },
      items: [{ variantId, quantity: 1 }],
      paymentMethod: "cod"
    }
  });
  assert.equal(bookableCheckout.statusCode, 201, bookableCheckout.body);
  const bookableOrderId = bookableCheckout.json().order.id;

  const unreadyCheckout = await app.inject({
    method: "POST",
    url: "/api/v1/orders/checkout",
    payload: {
      subdomain,
      customer: { name: "Buyer Three", phone: `+88019${stamp.toString().slice(-8)}`, address: "House 3, Road 4, Dhaka" },
      items: [{ variantId, quantity: 1 }],
      paymentMethod: "cod"
    }
  });
  assert.equal(unreadyCheckout.statusCode, 201, unreadyCheckout.body);
  const unreadyOrderId = unreadyCheckout.json().order.id;

  const packedForBook = await app.inject({
    method: "PATCH",
    url: `/api/v1/orders/shops/${shopId}/orders/${bookableOrderId}/status`,
    headers: { authorization: `Bearer ${token}` },
    payload: { status: "packed" }
  });
  assert.equal(packedForBook.statusCode, 200, packedForBook.body);

  const issues = await app.inject({ method: "GET", url: `/api/v1/orders/shops/${shopId}/issues`, headers: { authorization: `Bearer ${token}` } });
  assert.equal(issues.statusCode, 200, issues.body);
  assert.ok(issues.json().issues.some((issue) => issue.order_id === bookableOrderId && issue.issue_type === "shipment_missing"));

  const preview = await app.inject({
    method: "POST",
    url: `/api/v1/orders/shops/${shopId}/orders/bulk/preview`,
    headers: { authorization: `Bearer ${token}` },
    payload: { action: "book", orderIds: [bookableOrderId, unreadyOrderId] }
  });
  assert.equal(preview.statusCode, 200, preview.body);
  assert.equal(preview.json().ready, 1);
  assert.equal(preview.json().skipped, 1);
  assert.equal(preview.json().items.find((item) => item.orderId === unreadyOrderId).reason, "ORDER_NOT_PACKED");

  const exported = await app.inject({
    method: "POST",
    url: `/api/v1/orders/shops/${shopId}/orders/bulk/export`,
    headers: { authorization: `Bearer ${token}` },
    payload: { action: "export", orderIds: [bookableOrderId, unreadyOrderId] }
  });
  assert.equal(exported.statusCode, 200, exported.body);
  assert.match(exported.body, /id,status,total,currency,buyer_name,buyer_phone,created_at/);
  assert.match(exported.headers["content-type"], /text\/csv/);

  const bulkBooked = await app.inject({
    method: "POST",
    url: `/api/v1/orders/shops/${shopId}/orders/bulk/book`,
    headers: { authorization: `Bearer ${token}` },
    payload: { orderIds: [bookableOrderId, unreadyOrderId], courierName: "Manual Courier", fee: 80, note: "Bulk book smoke" }
  });
  assert.equal(bulkBooked.statusCode, 200, bulkBooked.body);
  assert.equal(bulkBooked.json().booked, 1);
  assert.equal(bulkBooked.json().skipped, 1);

  const shippedDetail = await app.inject({
    method: "GET",
    url: `/api/v1/orders/shops/${shopId}/orders/${bookableOrderId}`,
    headers: { authorization: `Bearer ${token}` }
  });
  assert.equal(shippedDetail.statusCode, 200, shippedDetail.body);
  assert.equal(shippedDetail.json().order.status, "shipped");

  console.log("Order dashboard DB smoke passed.");
} finally {
  await client.end();
  await app.close();
}

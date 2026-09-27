import assert from "node:assert/strict";
import pg from "pg";
import { buildApp } from "../dist/app.js";

if (!process.env.DATABASE_URL) {
  console.log("Skipping catalog DB smoke: DATABASE_URL is not set.");
  process.exit(0);
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

try {
  const stamp = Date.now();
  const user = await client.query(
    "insert into users (name, email, language) values ($1, $2, 'en') returning id",
    ["Catalog Smoke", `catalog-smoke-${stamp}@example.com`]
  );
  const shop = await client.query(
    `
      insert into shops (display_name, subdomain, category, country, currency)
      values ($1, $2, $3, $4, $5)
      returning id
    `,
    [`Smoke ${stamp}`, `smoke-${stamp}`, "test", "Bangladesh", "BDT"]
  );
  await client.query("insert into shop_staff (shop_id, user_id, role) values ($1, $2, 'owner')", [shop.rows[0].id, user.rows[0].id]);

  const app = await buildApp();
  const login = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: {
      identifier: `catalog-smoke-${stamp}@example.com`,
      password: "not-used"
    }
  });
  assert.equal(login.statusCode, 401);
  const tokenUser = await app.inject({
    method: "POST",
    url: "/api/v1/auth/register",
    payload: {
      name: "Catalog Token",
      email: `catalog-token-${stamp}@example.com`,
      password: "strong-password-123",
      language: "en"
    }
  });
  assert.equal(tokenUser.statusCode, 201, tokenUser.body);
  const tokenLogin = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: {
      identifier: `catalog-token-${stamp}@example.com`,
      password: "strong-password-123"
    }
  });
  const token = tokenLogin.json().token;
  await client.query("insert into shop_staff (shop_id, user_id, role) values ($1, $2, 'owner')", [shop.rows[0].id, tokenUser.json().user.id]);

  const created = await app.inject({
    method: "POST",
    url: `/api/v1/catalog/shops/${shop.rows[0].id}/products`,
    headers: { authorization: `Bearer ${token}` },
    payload: {
      name: "Smoke Product",
      status: "active",
      basePrice: 100,
      currency: "BDT",
      openingStock: 3
    }
  });

  assert.equal(created.statusCode, 201, created.body);
  const variantId = created.json().variants[0].id;

  const stock = await app.inject({
    method: "GET",
    url: `/api/v1/inventory/shops/${shop.rows[0].id}/variants/${variantId}/stock`,
    headers: { authorization: `Bearer ${token}` }
  });
  assert.equal(stock.statusCode, 200, stock.body);
  assert.equal(stock.json().quantity, 3);

  const adjusted = await app.inject({
    method: "POST",
    url: `/api/v1/inventory/shops/${shop.rows[0].id}/variants/${variantId}/adjustments`,
    headers: { authorization: `Bearer ${token}` },
    payload: { deltaQuantity: 2, reason: "restock" }
  });
  assert.equal(adjusted.statusCode, 201, adjusted.body);
  assert.equal(adjusted.json().stock.quantity, 5);

  await app.close();
  console.log("Catalog DB smoke passed.");
} finally {
  await client.end();
}

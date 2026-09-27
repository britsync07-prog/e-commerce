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
  const shop = await client.query(
    `
      insert into shops (display_name, subdomain, category, country, currency)
      values ($1, $2, $3, $4, $5)
      returning id
    `,
    [`Smoke ${Date.now()}`, `smoke-${Date.now()}`, "test", "Bangladesh", "BDT"]
  );

  const app = await buildApp();
  const created = await app.inject({
    method: "POST",
    url: `/api/v1/catalog/shops/${shop.rows[0].id}/products`,
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
    url: `/api/v1/inventory/shops/${shop.rows[0].id}/variants/${variantId}/stock`
  });
  assert.equal(stock.statusCode, 200, stock.body);
  assert.equal(stock.json().quantity, 3);

  const adjusted = await app.inject({
    method: "POST",
    url: `/api/v1/inventory/shops/${shop.rows[0].id}/variants/${variantId}/adjustments`,
    payload: { deltaQuantity: 2, reason: "restock" }
  });
  assert.equal(adjusted.statusCode, 201, adjusted.body);
  assert.equal(adjusted.json().stock.quantity, 5);

  await app.close();
  console.log("Catalog DB smoke passed.");
} finally {
  await client.end();
}


import assert from "node:assert/strict";
import pg from "pg";
import { buildApp } from "../dist/app.js";

if (!process.env.DATABASE_URL) { console.log("Skipping launch v1 DB smoke: DATABASE_URL is not set."); process.exit(0); }
const app = await buildApp();
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
try { await client.connect(); } catch { await app.close(); console.log("Skipping launch v1 DB smoke: database is not reachable."); process.exit(0); }

try {
  const stamp = Date.now();
  const email = `launch-v1-${stamp}@example.com`;
  const password = "StrongLaunch#12345";
  const registered = await app.inject({ method: "POST", url: "/api/v1/auth/register", payload: { name: "Launch V1 Smoke", email, password, language: "en" } });
  assert.equal(registered.statusCode, 201, registered.body);
  const login = await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { identifier: email, password } });
  assert.equal(login.statusCode, 200, login.body);
  const token = login.json().token;
  const subdomain = `launch-v1-${stamp}`;
  const started = await app.inject({ method: "POST", url: "/api/v1/onboarding/start", headers: { authorization: `Bearer ${token}` }, payload: { ownerName: "Launch V1 Smoke", language: "en", shopName: "Launch V1 Shop", subdomain, category: "fashion", country: "Bangladesh", currency: "BDT" } });
  assert.equal(started.statusCode, 201, started.body);
  const shopId = started.json().shop.id;

  const product = await app.inject({ method: "POST", url: `/api/v1/catalog/shops/${shopId}/products`, headers: { authorization: `Bearer ${token}` }, payload: { name: "Launch Shirt", description: "Frontend-ready launch product", status: "active", basePrice: 1500, currency: "BDT", variantTitle: "Default", openingStock: 5 } });
  assert.equal(product.statusCode, 201, product.body);
  const productId = product.json().product.id;
  const variantId = product.json().variants[0].id;

  const asset = await client.query(
    "insert into asset_objects (shop_id, storage_driver, bucket, object_key, public_url, mime_type, byte_size, purpose, created_by) values ($1, 'local', 'assets', $2, $3, 'image/png', 128, 'image', $4) returning id",
    [shopId, `assets/${shopId}/launch.png`, "https://cdn.example.test/launch.png", registered.json().user.id]
  );
  const attached = await app.inject({ method: "POST", url: `/api/v1/assets/${shopId}/products/${productId}/images`, headers: { authorization: `Bearer ${token}` }, payload: { assetId: asset.rows[0].id, altText: "Launch product", sortOrder: 3 } });
  assert.equal(attached.statusCode, 201, attached.body);
  const imageId = attached.json().image.id;
  const imageUpdated = await app.inject({ method: "PATCH", url: `/api/v1/assets/${shopId}/products/${productId}/images/${imageId}`, headers: { authorization: `Bearer ${token}` }, payload: { altText: "Updated launch product", sortOrder: 1 } });
  assert.equal(imageUpdated.statusCode, 200, imageUpdated.body);
  assert.equal(imageUpdated.json().image.sort_order, 1);

  const stock = await app.inject({ method: "POST", url: `/api/v1/inventory/shops/${shopId}/variants/${variantId}/adjustments`, headers: { authorization: `Bearer ${token}` }, payload: { deltaQuantity: 4, reason: "admin_update", note: "Launch stock update" } });
  assert.equal(stock.statusCode, 201, stock.body);
  assert.equal(stock.json().stock.quantity, 9);

  const settings = await app.inject({
    method: "PATCH",
    url: `/api/v1/shops/${shopId}/settings`,
    headers: { authorization: `Bearer ${token}` },
    payload: {
      logoUrl: "https://cdn.example.test/logo.png",
      storefront: {
        templateId: "fashion-editorial",
        tagline: "Simple social commerce",
        description: "A hosted shop that sends buyers to WhatsApp or Facebook.",
        contact: { whatsappNumber: "+8801700000000", facebookPageUrl: "https://facebook.com/example-page" },
        orderCta: { primary: "whatsapp", label: "Order on WhatsApp" },
        sections: ["hero", "showcase", "products", "contact"],
        showcases: [{ title: "New arrivals", body: "Fresh products for launch", productIds: [productId] }],
        seo: { title: "Launch V1 Shop", description: "Buy through WhatsApp and Facebook." }
      }
    }
  });
  assert.equal(settings.statusCode, 200, settings.body);

  const publish = await app.inject({ method: "POST", url: `/api/v1/shops/${shopId}/publish`, headers: { authorization: `Bearer ${token}` } });
  assert.equal(publish.statusCode, 200, publish.body);
  assert.equal(publish.json().publish.status, "launched");

  const storefront = await app.inject({ method: "GET", url: `/api/v1/storefront/${subdomain}` });
  assert.equal(storefront.statusCode, 200, storefront.body);
  assert.equal(storefront.json().shop.contact.whatsappNumber, "+8801700000000");
  assert.equal(storefront.json().shop.orderActions[0].type, "whatsapp");
  assert.match(storefront.json().shop.orderActions[0].url, /^https:\/\/wa\.me\//);
  assert.equal(storefront.json().products[0].stock, 9);
  assert.equal(storefront.json().products[0].images[0].altText, "Updated launch product");
  assert.equal(storefront.json().products[0].orderActions[0].label, "Order on WhatsApp");

  const detail = await app.inject({ method: "GET", url: `/api/v1/storefront/${subdomain}/products/launch-shirt` });
  assert.equal(detail.statusCode, 200, detail.body);
  assert.equal(detail.json().product.variants[0].stock, 9);
  assert.equal(detail.json().product.orderActions[0].type, "whatsapp");
  console.log("Launch v1 DB smoke passed.");
} finally { await client.end(); await app.close(); }

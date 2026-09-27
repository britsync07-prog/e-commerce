import assert from "node:assert/strict";
import { buildApp } from "../dist/app.js";

if (!process.env.DATABASE_URL) {
  console.log("Skipping permissions DB smoke: DATABASE_URL is not set.");
  process.exit(0);
}

const app = await buildApp();
const stamp = Date.now();

try {
  const registered = await app.inject({
    method: "POST",
    url: "/api/v1/auth/register",
    payload: {
      name: "Permission Smoke",
      email: `permission-smoke-${stamp}@example.com`,
      password: "strong-password-123",
      language: "en"
    }
  });
  assert.equal(registered.statusCode, 201, registered.body);

  const login = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: {
      identifier: `permission-smoke-${stamp}@example.com`,
      password: "strong-password-123"
    }
  });
  assert.equal(login.statusCode, 200, login.body);
  const token = login.json().token;

  const started = await app.inject({
    method: "POST",
    url: "/api/v1/onboarding/start",
    headers: { authorization: `Bearer ${token}` },
    payload: {
      ownerName: "Permission Smoke",
      language: "en",
      shopName: "Permission Shop",
      subdomain: `permission-${stamp}`,
      category: "test",
      country: "Bangladesh",
      currency: "BDT"
    }
  });
  assert.equal(started.statusCode, 201, started.body);

  const mine = await app.inject({
    method: "GET",
    url: "/api/v1/shops/mine",
    headers: { authorization: `Bearer ${token}` }
  });
  assert.equal(mine.statusCode, 200, mine.body);
  assert.equal(mine.json().shops.length, 1);
  assert.equal(mine.json().shops[0].role, "owner");

  const permissions = await app.inject({
    method: "GET",
    url: `/api/v1/shops/${started.json().shop.id}/permissions`,
    headers: { authorization: `Bearer ${token}` }
  });
  assert.equal(permissions.statusCode, 200, permissions.body);
  assert.ok(permissions.json().permissions.includes("catalog:write"));

  const denied = await app.inject({
    method: "GET",
    url: `/api/v1/shops/${started.json().shop.id}/permissions`
  });
  assert.equal(denied.statusCode, 401, denied.body);

  console.log("Permissions DB smoke passed.");
} finally {
  await app.close();
}


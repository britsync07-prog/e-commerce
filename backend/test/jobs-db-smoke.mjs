import assert from "node:assert/strict";
import { buildApp } from "../dist/app.js";

if (!process.env.DATABASE_URL) { console.log("Skipping jobs DB smoke: DATABASE_URL is not set."); process.exit(0); }
const app = await buildApp();
try {
  const stamp = Date.now();
  const email = `jobs-${stamp}@example.com`;
  const registered = await app.inject({ method: "POST", url: "/api/v1/auth/register", payload: { name: "Jobs Smoke", email, password: "strong-password-123", language: "en" } });
  assert.equal(registered.statusCode, 201, registered.body);
  const login = await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { identifier: email, password: "strong-password-123" } });
  assert.equal(login.statusCode, 200, login.body);
  const token = login.json().token;
  const started = await app.inject({ method: "POST", url: "/api/v1/onboarding/start", headers: { authorization: `Bearer ${token}` }, payload: { ownerName: "Jobs Smoke", language: "en", shopName: "Jobs Shop", subdomain: `jobs-${stamp}`, category: "test", country: "Bangladesh", currency: "BDT" } });
  assert.equal(started.statusCode, 201, started.body);
  const shopId = started.json().shop.id;
  const enqueued = await app.inject({ method: "POST", url: `/api/v1/jobs/shops/${shopId}/jobs`, headers: { authorization: `Bearer ${token}` }, payload: { queue: "analytics", jobType: "analytics.rebuild", payload: { from: "2026-01-01" }, maxAttempts: 3 } });
  assert.equal(enqueued.statusCode, 201, enqueued.body);
  const listed = await app.inject({ method: "GET", url: `/api/v1/jobs/shops/${shopId}/jobs?status=pending`, headers: { authorization: `Bearer ${token}` } });
  assert.equal(listed.statusCode, 200, listed.body);
  assert.equal(listed.json().jobs[0].max_attempts, 3);
  assert.equal(listed.json().jobs[0].status, "pending");
  console.log("Jobs DB smoke passed.");
} finally { await app.close(); }

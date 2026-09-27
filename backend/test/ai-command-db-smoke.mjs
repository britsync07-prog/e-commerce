import assert from "node:assert/strict";
import pg from "pg";
import { buildApp } from "../dist/app.js";

if (!process.env.DATABASE_URL) { console.log("Skipping AI command DB smoke: DATABASE_URL is not set."); process.exit(0); }
const app = await buildApp();
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
try { await client.connect(); } catch { await app.close(); console.log("Skipping AI command DB smoke: database is not reachable."); process.exit(0); }
try {
  const stamp = Date.now();
  const email = `ai-command-${stamp}@example.com`;
  const registered = await app.inject({ method: "POST", url: "/api/v1/auth/register", payload: { name: "AI Command Smoke", email, password: "strong-password-123", language: "en" } });
  assert.equal(registered.statusCode, 201, registered.body);
  const login = await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { identifier: email, password: "strong-password-123" } });
  assert.equal(login.statusCode, 200, login.body);
  const token = login.json().token;
  const started = await app.inject({ method: "POST", url: "/api/v1/onboarding/start", headers: { authorization: `Bearer ${token}` }, payload: { ownerName: "AI Command Smoke", language: "en", shopName: "AI Command Shop", subdomain: `aicmd-${stamp}`, category: "test", country: "Bangladesh", currency: "BDT" } });
  assert.equal(started.statusCode, 201, started.body);
  const shopId = started.json().shop.id;
  const question = await app.inject({ method: "POST", url: `/api/v1/ai/shops/${shopId}/commands`, headers: { authorization: `Bearer ${token}` }, payload: { prompt: "Show my latest orders", actionType: "question" } });
  assert.equal(question.statusCode, 201, question.body);
  assert.equal(question.json().command.risk_level, "low");
  assert.equal(question.json().command.status, "drafted");
  const action = await app.inject({ method: "POST", url: `/api/v1/ai/shops/${shopId}/commands`, headers: { authorization: `Bearer ${token}` }, payload: { prompt: "Refund this order", actionType: "action" } });
  assert.equal(action.statusCode, 201, action.body);
  assert.equal(action.json().command.risk_level, "critical");
  assert.equal(action.json().command.required_permission, "payments:write");
  assert.equal(action.json().command.status, "awaiting_approval");
  const approved = await app.inject({ method: "POST", url: `/api/v1/ai/shops/${shopId}/commands/${action.json().command.id}/approve`, headers: { authorization: `Bearer ${token}` }, payload: { reason: "Reviewed the preview; approve for later executor" } });
  assert.equal(approved.statusCode, 200, approved.body);
  assert.equal(approved.json().command.status, "approved");
  assert.equal(approved.json().command.preview.execution, "not_connected");
  console.log("AI command DB smoke passed.");
} finally { await client.end(); await app.close(); }

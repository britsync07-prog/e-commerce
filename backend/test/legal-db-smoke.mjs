import assert from "node:assert/strict";
import pg from "pg";
import { buildApp } from "../dist/app.js";

if (!process.env.DATABASE_URL) { console.log("Skipping legal DB smoke: DATABASE_URL is not set."); process.exit(0); }
const app = await buildApp();
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
try { await client.connect(); } catch { await app.close(); console.log("Skipping legal DB smoke: database is not reachable."); process.exit(0); }

try {
  const stamp = Date.now();
  const email = `legal-${stamp}@example.com`;
  const password = "StrongLegal#12345";
  const registered = await app.inject({ method: "POST", url: "/api/v1/auth/register", payload: { name: "Legal Smoke", email, password, language: "en" } });
  assert.equal(registered.statusCode, 201, registered.body);
  const login = await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { identifier: email, password } });
  assert.equal(login.statusCode, 200, login.body);
  const token = login.json().token;
  const subdomain = `legal-${stamp}`;
  const started = await app.inject({ method: "POST", url: "/api/v1/onboarding/start", headers: { authorization: `Bearer ${token}` }, payload: { ownerName: "Legal Smoke", language: "en", shopName: "Legal Shop", subdomain, category: "test", country: "Bangladesh", currency: "BDT" } });
  assert.equal(started.statusCode, 201, started.body);
  const shopId = started.json().shop.id;
  await app.inject({ method: "POST", url: `/api/v1/onboarding/${shopId}/products`, payload: { name: "Legal Product", price: 100, stock: 1 } });
  await app.inject({ method: "POST", url: `/api/v1/onboarding/${shopId}/channels/meta/skip` });
  await app.inject({ method: "PATCH", url: `/api/v1/onboarding/${shopId}/ai-mode`, payload: { aiMode: "suggest" } });
  await app.inject({ method: "POST", url: `/api/v1/onboarding/${shopId}/launch` });

  const policy = await app.inject({ method: "PUT", url: `/api/v1/legal/shops/${shopId}/policies/privacy_policy`, headers: { authorization: `Bearer ${token}` }, payload: { title: "Privacy Policy", body: "This shop collects only the information needed to process orders and legal privacy requests.", publish: true } });
  assert.equal(policy.statusCode, 201, policy.body);
  assert.equal(policy.json().policy.version, 1);
  assert.equal(policy.json().policy.status, "published");

  const publicPolicies = await app.inject({ method: "GET", url: `/api/v1/legal/public/${subdomain}/policies` });
  assert.equal(publicPolicies.statusCode, 200, publicPolicies.body);
  assert.equal(publicPolicies.json().policies[0].policy_type, "privacy_policy");

  const consent = await app.inject({ method: "POST", url: `/api/v1/legal/public/${subdomain}/cookie-consents`, headers: { "user-agent": "legal-smoke" }, payload: { visitorId: "visitor-1", categories: { necessary: true, analytics: true, marketing: false, preferences: true }, policyVersion: 1 } });
  assert.equal(consent.statusCode, 201, consent.body);
  assert.equal(consent.json().consent.policy_version, 1);

  const request = await app.inject({ method: "POST", url: `/api/v1/legal/public/${subdomain}/privacy-requests`, payload: { requestType: "delete", requesterEmail: email, requesterPhone: "+8801700000000", details: "Please delete my buyer data." } });
  assert.equal(request.statusCode, 201, request.body);
  const requestId = request.json().request.id;

  const listed = await app.inject({ method: "GET", url: `/api/v1/legal/shops/${shopId}/privacy-requests?status=open`, headers: { authorization: `Bearer ${token}` } });
  assert.equal(listed.statusCode, 200, listed.body);
  assert.equal(listed.json().requests.length, 1);

  const updated = await app.inject({ method: "PATCH", url: `/api/v1/legal/shops/${shopId}/privacy-requests/${requestId}`, headers: { authorization: `Bearer ${token}` }, payload: { status: "completed", resolutionNote: "Verified and completed in smoke test." } });
  assert.equal(updated.statusCode, 200, updated.body);
  assert.equal(updated.json().request.status, "completed");

  const audit = await client.query("select action from audit_events where shop_id = $1 and action in ('legal.policy_published', 'privacy_request.updated') order by created_at", [shopId]);
  assert.deepEqual(audit.rows.map((row) => row.action).sort(), ["legal.policy_published", "privacy_request.updated"]);
  console.log("Legal DB smoke passed.");
} finally { await client.end(); await app.close(); }

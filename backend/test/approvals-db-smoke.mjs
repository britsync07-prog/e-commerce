import assert from "node:assert/strict";
import pg from "pg";
import { buildApp } from "../dist/app.js";
import { db } from "../dist/shared/db.js";

if (!process.env.DATABASE_URL) { console.log("Skipping approvals DB smoke: DATABASE_URL is not set."); process.exit(0); }
const app = await buildApp();
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
try { await client.connect(); await client.end(); } catch { await app.close(); console.log("Skipping approvals DB smoke: database is not reachable."); process.exit(0); }

try {
  const stamp = Date.now();
  const email = `approvals-${stamp}@example.com`;
  const password = "StrongApproval#12345";
  const registered = await app.inject({ method: "POST", url: "/api/v1/auth/register", payload: { name: "Approvals Smoke", email, password, language: "en" } });
  assert.equal(registered.statusCode, 201, registered.body);
  const login = await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { identifier: email, password } });
  assert.equal(login.statusCode, 200, login.body);
  const token = login.json().token;
  const started = await app.inject({ method: "POST", url: "/api/v1/onboarding/start", headers: { authorization: `Bearer ${token}` }, payload: { ownerName: "Approvals Smoke", language: "en", shopName: "Approvals Shop", subdomain: `approvals-${stamp}`, category: "test", country: "Bangladesh", currency: "BDT" } });
  assert.equal(started.statusCode, 201, started.body);
  const shopId = started.json().shop.id;
  const job = await db.query(
    "insert into outbox_jobs (shop_id, queue, job_type, payload, status, attempts, max_attempts, last_error, dead_at) values ($1, 'analytics', 'analytics.rebuild', $2, 'dead', 3, 3, 'provider outage', now()) returning id",
    [shopId, JSON.stringify({ from: "2026-01-01" })]
  );

  const requested = await app.inject({ method: "POST", url: `/api/v1/approvals/shops/${shopId}/approvals`, headers: { authorization: `Bearer ${token}` }, payload: { actionType: "job.retry", targetId: job.rows[0].id, reason: "Retry after outage was fixed" } });
  assert.equal(requested.statusCode, 201, requested.body);
  assert.equal(requested.json().approval.status, "pending");
  assert.equal(requested.json().approval.preview.job.status, "dead");
  const approvalId = requested.json().approval.id;

  const listed = await app.inject({ method: "GET", url: `/api/v1/approvals/shops/${shopId}/approvals?status=pending`, headers: { authorization: `Bearer ${token}` } });
  assert.equal(listed.statusCode, 200, listed.body);
  assert.equal(listed.json().approvals.length, 1);

  const approved = await app.inject({ method: "POST", url: `/api/v1/approvals/shops/${shopId}/approvals/${approvalId}/approve`, headers: { authorization: `Bearer ${token}` }, payload: { reason: "Payload reviewed and safe" } });
  assert.equal(approved.statusCode, 200, approved.body);
  assert.equal(approved.json().approval.status, "executed");
  assert.equal(approved.json().approval.result.job.status, "pending");

  const retried = await db.query("select status, attempts, last_error, dead_at from outbox_jobs where id = $1", [job.rows[0].id]);
  assert.equal(retried.rows[0].status, "pending");
  assert.equal(retried.rows[0].attempts, 0);
  assert.equal(retried.rows[0].last_error, null);
  assert.equal(retried.rows[0].dead_at, null);

  const audit = await db.query("select action from audit_events where shop_id = $1 and action in ('approval.requested', 'approval.executed', 'job.retried') order by created_at", [shopId]);
  assert.deepEqual(audit.rows.map((row) => row.action).sort(), ["approval.executed", "approval.requested", "job.retried"]);
  console.log("Approvals DB smoke passed.");
} finally { await app.close(); }

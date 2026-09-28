import assert from "node:assert/strict";
import { buildApp } from "../dist/app.js";
import { claimNextJob, recordWorkerHeartbeat } from "../dist/modules/jobs/jobs.service.js";
import { db } from "../dist/shared/db.js";

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
  const stats = await app.inject({ method: "GET", url: `/api/v1/jobs/shops/${shopId}/jobs/stats`, headers: { authorization: `Bearer ${token}` } });
  assert.equal(stats.statusCode, 200, stats.body);
  assert.equal(stats.json().byStatus.pending, 1);
  assert.equal(stats.json().byQueue.analytics, 1);
  assert.ok(stats.json().oldestPendingRunAfter);
  const workerId = `worker-smoke-${stamp}`;
  await recordWorkerHeartbeat(workerId, process.pid);
  const workers = await app.inject({ method: "GET", url: `/api/v1/jobs/shops/${shopId}/workers`, headers: { authorization: `Bearer ${token}` } });
  assert.equal(workers.statusCode, 200, workers.body);
  const worker = workers.json().workers.find((item) => item.worker_id === workerId);
  assert.equal(worker.healthy, true);
  const stale = await db.query(
    "insert into outbox_jobs (shop_id, queue, job_type, payload, status, attempts, max_attempts, locked_at, locked_by) values ($1, 'analytics', 'analytics.rebuild', '{}', 'running', 1, 3, now() - interval '10 minutes', 'dead-worker') returning id",
    [shopId]
  );
  await claimNextJob(`recovery-smoke-${stamp}`);
  const recovered = await db.query("select status, locked_at, locked_by, last_error from outbox_jobs where id = $1", [stale.rows[0].id]);
  assert.equal(recovered.rows[0].status, "failed");
  assert.equal(recovered.rows[0].locked_at, null);
  assert.equal(recovered.rows[0].locked_by, null);
  assert.match(recovered.rows[0].last_error, /^STALE_LOCK:/);
  console.log("Jobs DB smoke passed.");
} finally { await app.close(); }

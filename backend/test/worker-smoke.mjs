import assert from "node:assert/strict";
import pg from "pg";
import { runOnce } from "../dist/worker.js";

if (!process.env.DATABASE_URL) { console.log("Skipping worker smoke: DATABASE_URL is not set."); process.exit(0); }
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  const stamp = Date.now();
  const shop = await client.query("select id from shops order by created_at desc limit 1");
  if (!shop.rowCount) { console.log("Skipping worker smoke: no shop exists."); process.exit(0); }
  await client.query("update outbox_jobs set status = 'done', completed_at = now() where status in ('pending', 'failed')");
  const job = await client.query("insert into outbox_jobs (shop_id, queue, job_type, payload, max_attempts) values ($1, 'analytics', 'analytics.rebuild', $2, 3) returning id", [shop.rows[0].id, JSON.stringify({ stamp })]);
  assert.equal(await runOnce(), true);
  const state = await client.query("select status, attempts from outbox_jobs where id = $1", [job.rows[0].id]);
  assert.equal(state.rows[0].status, "done");
  assert.equal(Number(state.rows[0].attempts), 1);
  console.log("Worker smoke passed.");
} finally { await client.end(); }

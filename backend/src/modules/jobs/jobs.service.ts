import { randomUUID } from "node:crypto";
import { db } from "../../shared/db.js";

export class JobsError extends Error {
  constructor(message: string, public readonly statusCode: number, public readonly code: string) { super(message); }
}

export async function enqueueJob(shopId: string, input: { queue: string; jobType: string; payload: Record<string, unknown>; maxAttempts: number }, actorId: string) {
  const result = await db.query("insert into outbox_jobs (shop_id, queue, job_type, payload, max_attempts) values ($1, $2, $3, $4, $5) returning id, shop_id, queue, job_type, payload, status, attempts, max_attempts, run_after, created_at", [shopId, input.queue, input.jobType, JSON.stringify(input.payload), input.maxAttempts]);
  await audit(shopId, actorId, "job.enqueued", "outbox_job", result.rows[0].id, { queue: input.queue, jobType: input.jobType });
  return { job: result.rows[0] };
}

export async function listJobs(shopId: string, input: { status?: string; limit: number }) {
  const values: unknown[] = [shopId, input.limit];
  const filter = input.status ? ` and status = $${values.push(input.status)}` : "";
  const result = await db.query(`select id, shop_id, queue, job_type, payload, status, attempts, max_attempts, run_after, last_error, locked_at, locked_by, completed_at, dead_at, created_at, updated_at from outbox_jobs where shop_id = $1${filter} order by created_at desc limit $2`, values);
  return { jobs: result.rows };
}

export async function retryDeadJob(shopId: string, jobId: string, reason: string, actorId: string) {
  const result = await db.query("update outbox_jobs set status = 'pending', attempts = 0, run_after = now(), last_error = null, dead_at = null, locked_at = null, locked_by = null, updated_at = now() where shop_id = $1 and id = $2 and status = 'dead' returning id, status, attempts, run_after", [shopId, jobId]);
  if (!result.rowCount) throw new JobsError("Only dead jobs can be retried.", 409, "JOB_NOT_RETRYABLE");
  await audit(shopId, actorId, "job.retried", "outbox_job", jobId, { reason });
  return { job: result.rows[0] };
}

export async function claimNextJob(workerId = randomUUID()) {
  const client = await db.connect();
  try {
    await client.query("begin");
    const result = await client.query("select id, shop_id, queue, job_type, payload, attempts, max_attempts from outbox_jobs where status in ('pending', 'failed') and run_after <= now() and attempts < max_attempts order by run_after asc, created_at asc for update skip locked limit 1");
    if (!result.rowCount) { await client.query("commit"); return null; }
    const job = await client.query("update outbox_jobs set status = 'running', attempts = attempts + 1, locked_at = now(), locked_by = $2, updated_at = now() where id = $1 returning id, shop_id, queue, job_type, payload, attempts, max_attempts", [result.rows[0].id, workerId]);
    await client.query("commit");
    return job.rows[0];
  } catch (error) { await client.query("rollback"); throw error; } finally { client.release(); }
}

export async function completeJob(jobId: string, workerId: string) {
  const result = await db.query("update outbox_jobs set status = 'done', completed_at = now(), locked_at = null, updated_at = now() where id = $1 and status = 'running' and locked_by = $2 returning id", [jobId, workerId]);
  if (!result.rowCount) throw new JobsError("Job is not owned by this worker.", 409, "JOB_LOCK_INVALID");
  return { ok: true };
}

export async function failJob(jobId: string, workerId: string, errorMessage: string, retryable: boolean) {
  const result = await db.query(`update outbox_jobs set status = case when $3 = false or attempts >= max_attempts then 'dead' else 'failed' end, last_error = $4, dead_at = case when $3 = false or attempts >= max_attempts then now() else null end, run_after = case when $3 = false or attempts >= max_attempts then run_after else now() + ((2 ^ least(attempts, 8)) * interval '30 seconds') end, locked_at = null, updated_at = now() where id = $1 and status = 'running' and locked_by = $2 returning id, status, attempts, run_after`, [jobId, workerId, retryable, errorMessage]);
  if (!result.rowCount) throw new JobsError("Job is not owned by this worker.", 409, "JOB_LOCK_INVALID");
  return { job: result.rows[0] };
}

async function audit(shopId: string, actorId: string, action: string, targetType: string, targetId: string, metadata: unknown) {
  await db.query("insert into audit_events (shop_id, actor_type, actor_id, action, target_type, target_id, metadata) values ($1, 'staff', $2, $3, $4, $5, $6)", [shopId, actorId, action, targetType, targetId, JSON.stringify(metadata)]);
}

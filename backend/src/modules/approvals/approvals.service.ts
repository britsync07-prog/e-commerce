import { db } from "../../shared/db.js";
import { retryDeadJob } from "../jobs/jobs.service.js";

export class ApprovalError extends Error {
  constructor(message: string, public readonly statusCode: number, public readonly code: string) { super(message); }
}

export async function createApproval(shopId: string, input: { actionType: "job.retry"; targetId: string; reason: string }, actorId: string) {
  const preview = await buildPreview(shopId, input.actionType, input.targetId);
  const result = await db.query(
    `insert into action_approvals (shop_id, action_type, target_type, target_id, reason, preview, requested_by)
     values ($1, $2, $3, $4, $5, $6, $7)
     returning id, shop_id, action_type, target_type, target_id, status, reason, preview, requested_by, created_at, updated_at`,
    [shopId, input.actionType, targetType(input.actionType), input.targetId, input.reason, JSON.stringify(preview), actorId]
  );
  await audit(shopId, actorId, "approval.requested", "action_approval", result.rows[0].id, { actionType: input.actionType, targetId: input.targetId });
  return { approval: result.rows[0] };
}

export async function listApprovals(shopId: string, input: { status?: string; limit: number }) {
  const values: unknown[] = [shopId, input.limit];
  const filter = input.status ? ` and status = $${values.push(input.status)}` : "";
  const result = await db.query(
    `select id, shop_id, action_type, target_type, target_id, status, reason, preview, result, requested_by, decided_by, decided_at, executed_at, created_at, updated_at
     from action_approvals where shop_id = $1${filter} order by created_at desc limit $2`,
    values
  );
  return { approvals: result.rows };
}

export async function rejectApproval(shopId: string, approvalId: string, reason: string, actorId: string) {
  const result = await db.query(
    `update action_approvals set status = 'rejected', result = $4, decided_by = $3, decided_at = now(), updated_at = now()
     where shop_id = $1 and id = $2 and status = 'pending'
     returning id, shop_id, action_type, target_type, target_id, status, reason, preview, result, requested_by, decided_by, decided_at, created_at, updated_at`,
    [shopId, approvalId, actorId, JSON.stringify({ reason })]
  );
  if (!result.rowCount) throw new ApprovalError("Only pending approvals can be rejected.", 409, "APPROVAL_NOT_PENDING");
  await audit(shopId, actorId, "approval.rejected", "action_approval", approvalId, { reason });
  return { approval: result.rows[0] };
}

export async function approveAndExecute(shopId: string, approvalId: string, reason: string, actorId: string) {
  const client = await db.connect();
  let approval: Record<string, unknown>;
  try {
    await client.query("begin");
    const result = await client.query("select * from action_approvals where shop_id = $1 and id = $2 for update", [shopId, approvalId]);
    if (!result.rowCount) throw new ApprovalError("Approval not found.", 404, "APPROVAL_NOT_FOUND");
    if (result.rows[0].status !== "pending") throw new ApprovalError("Only pending approvals can be approved.", 409, "APPROVAL_NOT_PENDING");
    await client.query(
      "update action_approvals set status = 'approved', decided_by = $3, decided_at = now(), result = $4, updated_at = now() where shop_id = $1 and id = $2",
      [shopId, approvalId, actorId, JSON.stringify({ reason })]
    );
    await client.query("commit");
    approval = result.rows[0];
  } catch (error) { await client.query("rollback"); throw error; } finally { client.release(); }

  const executed = await executeApproval(shopId, approval, actorId);
  await audit(shopId, actorId, "approval.executed", "action_approval", approvalId, { reason, actionType: approval.action_type });
  return { approval: executed };
}

async function executeApproval(shopId: string, approval: Record<string, unknown>, actorId: string) {
  try {
    const result = approval.action_type === "job.retry"
      ? await retryDeadJob(shopId, approval.target_id as string, approval.reason as string, actorId)
      : neverAction(approval.action_type);
    const updated = await db.query(
      `update action_approvals set status = 'executed', result = $3, executed_at = now(), updated_at = now()
       where shop_id = $1 and id = $2
       returning id, shop_id, action_type, target_type, target_id, status, reason, preview, result, requested_by, decided_by, decided_at, executed_at, created_at, updated_at`,
      [shopId, approval.id, JSON.stringify(result)]
    );
    return updated.rows[0];
  } catch (error) {
    await db.query("update action_approvals set status = 'failed', result = $3, updated_at = now() where shop_id = $1 and id = $2", [shopId, approval.id, JSON.stringify({ error: error instanceof Error ? error.message : "Action failed." })]);
    throw error;
  }
}

async function buildPreview(shopId: string, actionType: "job.retry", targetId: string) {
  if (actionType === "job.retry") {
    const result = await db.query("select id, queue, job_type, status, attempts, max_attempts, last_error, dead_at from outbox_jobs where shop_id = $1 and id = $2", [shopId, targetId]);
    if (!result.rowCount) throw new ApprovalError("Job not found.", 404, "JOB_NOT_FOUND");
    if (result.rows[0].status !== "dead") throw new ApprovalError("Only dead jobs can request retry approval.", 409, "JOB_NOT_RETRYABLE");
    return { job: result.rows[0], effect: "Reset job to pending with attempts=0 and clear last error." };
  }
}

function targetType(actionType: string) {
  if (actionType === "job.retry") return "outbox_job";
  return "unknown";
}

function neverAction(actionType: unknown): never {
  throw new ApprovalError(`Unsupported approval action: ${String(actionType)}`, 400, "APPROVAL_ACTION_UNSUPPORTED");
}

async function audit(shopId: string, actorId: string, action: string, targetType: string, targetId: string, metadata: unknown) {
  await db.query("insert into audit_events (shop_id, actor_type, actor_id, action, target_type, target_id, metadata) values ($1, 'staff', $2, $3, $4, $5, $6)", [shopId, actorId, action, targetType, targetId, JSON.stringify(metadata)]);
}

import { db } from "../../shared/db.js";

export class AiCommandError extends Error {
  constructor(message: string, public readonly statusCode: number, public readonly code: string) { super(message); }
}

type Classification = { risk: "low" | "medium" | "high" | "critical"; permission: string; status: "drafted" | "awaiting_approval" };

export async function createCommand(shopId: string, userId: string, input: { prompt: string; actionType: "question" | "draft" | "action" }) {
  const classification = classify(input.prompt, input.actionType);
  const citations = await citationsFor(shopId, input.prompt);
  const preview = { execution: "not_connected", message: classification.status === "awaiting_approval" ? "Review and explicitly approve before any action executor is connected." : "Read-only command recorded; no business mutation was made." };
  const result = await db.query(`insert into ai_commands (shop_id, requested_by, prompt, action_type, risk_level, required_permission, status, preview, citations) values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning id, shop_id, prompt, action_type, risk_level, required_permission, status, preview, citations, created_at, updated_at`, [shopId, userId, input.prompt, input.actionType, classification.risk, classification.permission, classification.status, JSON.stringify(preview), JSON.stringify(citations)]);
  await audit(shopId, userId, "ai.command_created", "ai_command", result.rows[0].id, { riskLevel: classification.risk, requiredPermission: classification.permission });
  return { command: result.rows[0] };
}

export async function listCommands(shopId: string) {
  const result = await db.query("select id, shop_id, prompt, action_type, risk_level, required_permission, status, preview, citations, approval_reason, approved_by, approved_at, executed_at, created_at, updated_at from ai_commands where shop_id = $1 order by created_at desc limit 100", [shopId]);
  return { commands: result.rows };
}

export async function approveCommand(shopId: string, commandId: string, userId: string, reason: string) {
  const result = await db.query(`update ai_commands set status = 'approved', approval_reason = $4, approved_by = $3, approved_at = now(), updated_at = now() where shop_id = $1 and id = $2 and status = 'awaiting_approval' returning id, shop_id, status, risk_level, approval_reason, approved_by, approved_at, preview, citations`, [shopId, commandId, userId, reason]);
  if (!result.rowCount) throw new AiCommandError("Only pending commands can be approved.", 409, "AI_COMMAND_NOT_APPROVABLE");
  await audit(shopId, userId, "ai.command_approved", "ai_command", commandId, { reason, execution: "not_connected" });
  return { command: result.rows[0] };
}

function classify(prompt: string, actionType: "question" | "draft" | "action"): Classification {
  const text = prompt.toLowerCase();
  if (actionType === "question") return { risk: "low", permission: "orders:read", status: "drafted" };
  if (actionType === "draft") return { risk: "medium", permission: "marketing:write", status: "awaiting_approval" };
  if (/refund|mark paid|payment/.test(text)) return { risk: "critical", permission: "payments:write", status: "awaiting_approval" };
  if (/cancel|delete|remove|return|order/.test(text)) return { risk: "high", permission: "orders:write", status: "awaiting_approval" };
  if (/send|broadcast|message|campaign/.test(text)) return { risk: "high", permission: "marketing:write", status: "awaiting_approval" };
  return { risk: "medium", permission: "settings:write", status: "awaiting_approval" };
}

async function citationsFor(shopId: string, prompt: string) {
  const citations: Array<{ type: string; id: string; label: string }> = [];
  if (/order|sale|revenue/i.test(prompt)) {
    const result = await db.query("select id, total from orders where shop_id = $1 order by created_at desc limit 5", [shopId]);
    citations.push(...result.rows.map((row) => ({ type: "order", id: row.id, label: `Order ${row.id} total ${row.total}` })));
  }
  if (/product|stock|inventory/i.test(prompt)) {
    const result = await db.query("select id, name from products where shop_id = $1 and status = 'active' order by created_at desc limit 5", [shopId]);
    citations.push(...result.rows.map((row) => ({ type: "product", id: row.id, label: row.name })));
  }
  return citations;
}

async function audit(shopId: string, actorId: string, action: string, targetType: string, targetId: string, metadata: unknown) {
  await db.query("insert into audit_events (shop_id, actor_type, actor_id, action, target_type, target_id, metadata) values ($1, 'staff', $2, $3, $4, $5, $6)", [shopId, actorId, action, targetType, targetId, JSON.stringify(metadata)]);
}

import { db } from "../../shared/db.js";

export class AiCommandError extends Error {
  constructor(message: string, public readonly statusCode: number, public readonly code: string) { super(message); }
}

type Classification = { risk: "low" | "medium" | "high" | "critical"; permission: string; status: "drafted" | "awaiting_approval" };
type AdCreativeInput = { productId?: string; templateId?: string; objective: string; offer?: string; audience: string; language?: string; tone?: string };

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

export async function getBrandRules(shopId: string) {
  const result = await db.query("select id, shop_id, rules, banned_claims, default_language, default_tone, updated_by, created_at, updated_at from ai_brand_rules where shop_id = $1", [shopId]);
  return { brandRules: result.rows[0] ?? null };
}

export async function upsertBrandRules(shopId: string, userId: string, input: { rules: Record<string, unknown>; bannedClaims: string[]; defaultLanguage: string; defaultTone: string }) {
  const result = await db.query(
    `insert into ai_brand_rules (shop_id, rules, banned_claims, default_language, default_tone, updated_by)
     values ($1, $2, $3, $4, $5, $6)
     on conflict (shop_id) do update set rules = excluded.rules, banned_claims = excluded.banned_claims, default_language = excluded.default_language, default_tone = excluded.default_tone, updated_by = excluded.updated_by, updated_at = now()
     returning id, shop_id, rules, banned_claims, default_language, default_tone, updated_by, created_at, updated_at`,
    [shopId, JSON.stringify(input.rules), input.bannedClaims, input.defaultLanguage, input.defaultTone, userId]
  );
  await audit(shopId, userId, "ai.brand_rules_updated", "ai_brand_rules", result.rows[0].id, {});
  return { brandRules: result.rows[0] };
}

export async function listCreativeTemplates(shopId: string) {
  const result = await db.query("select id, shop_id, name, format, template, status, created_by, created_at, updated_at from ai_creative_templates where shop_id = $1 order by created_at desc", [shopId]);
  return { templates: result.rows };
}

export async function createCreativeTemplate(shopId: string, userId: string, input: { name: string; format: string; template: Record<string, unknown> }) {
  try {
    const result = await db.query("insert into ai_creative_templates (shop_id, name, format, template, created_by) values ($1, $2, $3, $4, $5) returning id, shop_id, name, format, template, status, created_by, created_at", [shopId, input.name, input.format, JSON.stringify(input.template), userId]);
    await audit(shopId, userId, "ai.creative_template_created", "ai_creative_template", result.rows[0].id, { name: input.name, format: input.format });
    return { template: result.rows[0] };
  } catch (error) {
    if ((error as { code?: string }).code === "23505") throw new AiCommandError("Creative template name already exists for this shop.", 409, "AI_CREATIVE_TEMPLATE_CONFLICT");
    throw error;
  }
}

export async function listAdCreatives(shopId: string, input: { productId?: string; limit: number }) {
  const values: unknown[] = [shopId, input.limit];
  const productFilter = input.productId ? "and r.product_id = $3" : "";
  if (input.productId) values.push(input.productId);
  const result = await db.query(
    `select r.id, r.shop_id, r.product_id, p.name as product_name, r.objective, r.offer, r.audience, r.language, r.tone, r.status, r.safety_result, r.created_by, r.created_at
     from ai_ad_creative_requests r left join products p on p.shop_id = r.shop_id and p.id = r.product_id
     where r.shop_id = $1 ${productFilter} order by r.created_at desc limit $2`,
    values
  );
  return { requests: result.rows };
}

export async function getAdCreative(shopId: string, requestId: string) {
  const request = await db.query("select * from ai_ad_creative_requests where shop_id = $1 and id = $2", [shopId, requestId]);
  if (!request.rowCount) throw new AiCommandError("Ad creative request not found.", 404, "AI_AD_CREATIVE_NOT_FOUND");
  const outputs = await db.query("select id, product_id, format, content, safety_result, status, created_at from ai_ad_creative_outputs where shop_id = $1 and request_id = $2 order by created_at asc", [shopId, requestId]);
  return { request: request.rows[0], outputs: outputs.rows };
}

export async function createAdCreative(shopId: string, userId: string, input: AdCreativeInput) {
  const [brandRules, product, template] = await Promise.all([
    db.query("select rules, banned_claims, default_language, default_tone from ai_brand_rules where shop_id = $1", [shopId]),
    input.productId ? db.query("select id, name, description, base_price, currency from products where shop_id = $1 and id = $2", [shopId, input.productId]) : Promise.resolve({ rowCount: 0, rows: [] }),
    input.templateId ? db.query("select id, format, template from ai_creative_templates where shop_id = $1 and id = $2 and status = 'active'", [shopId, input.templateId]) : Promise.resolve({ rowCount: 0, rows: [] })
  ]);
  if (input.productId && !product.rowCount) throw new AiCommandError("Product not found for this shop.", 404, "PRODUCT_NOT_FOUND");
  if (input.templateId && !template.rowCount) throw new AiCommandError("Creative template not found for this shop.", 404, "AI_CREATIVE_TEMPLATE_NOT_FOUND");

  const rules = brandRules.rows[0] ?? { rules: {}, banned_claims: [], default_language: "bn-en", default_tone: "friendly" };
  const language = input.language ?? rules.default_language;
  const tone = input.tone ?? rules.default_tone;
  const safety = creativeSafetyFindings([input.objective, input.offer, input.audience, ...(rules.banned_claims ?? [])]);
  const blocked = safety.some((finding) => finding.severity === "block");
  const client = await db.connect();
  try {
    await client.query("begin");
    const request = await client.query(
      `insert into ai_ad_creative_requests (shop_id, product_id, template_id, objective, offer, audience, language, tone, format, inputs, safety_result, status, created_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8, coalesce($9, 'meta_feed'), $10, $11, $12, $13)
       returning id, shop_id, product_id, template_id, objective, offer, audience, language, tone, format, inputs, safety_result, status, created_by, created_at`,
      [shopId, input.productId ?? null, input.templateId ?? null, input.objective, input.offer ?? null, input.audience, language, tone, null, JSON.stringify({ source: "deterministic", reviewOnly: true }), JSON.stringify(safety), blocked ? "blocked" : "awaiting_review", userId]
    );
    if (!blocked) {
      for (const output of generateAdOutputs(input, product.rows[0], language, tone, rules.rules)) {
        await client.query("insert into ai_ad_creative_outputs (shop_id, request_id, product_id, format, content, safety_result) values ($1, $2, $3, $4, $5, $6)", [shopId, request.rows[0].id, input.productId ?? null, output.format, output.content, JSON.stringify(safety)]);
      }
    }
    await client.query("insert into audit_events (shop_id, actor_type, actor_id, action, target_type, target_id, metadata) values ($1, 'staff', $2, 'ai.ad_creative_requested', 'ai_ad_creative_request', $3, $4)", [shopId, userId, request.rows[0].id, JSON.stringify({ status: request.rows[0].status, productId: input.productId ?? null, safetyCount: safety.length })]);
    await client.query("commit");
    return getAdCreative(shopId, request.rows[0].id);
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
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

function creativeSafetyFindings(values: Array<string | undefined>) {
  const text = values.filter(Boolean).join(" ").toLowerCase();
  const findings: Array<{ severity: "warn" | "block"; code: string; message: string }> = [];
  const blocks: Array<[RegExp, string, string]> = [
    [/cure|diagnose|treat|miracle|instant weight loss/, "MEDICAL_CLAIM", "Medical or health outcome claims need legal review."],
    [/guaranteed profit|risk[- ]?free investment|get rich|double your money/, "FINANCIAL_CLAIM", "Financial outcome claims are blocked."],
    [/100% guaranteed|guaranteed result|copy competitor|steal/, "UNREALISTIC_OR_COPYING", "Unrealistic guarantees or copying competitor text are blocked."]
  ];
  for (const [pattern, code, message] of blocks) if (pattern.test(text)) findings.push({ severity: "block", code, message });
  if (/best|cheapest|#1|number one/.test(text)) findings.push({ severity: "warn", code: "SUPERLATIVE_CLAIM", message: "Superlative claims should be backed by proof before publishing." });
  return findings;
}

function generateAdOutputs(input: AdCreativeInput, product: Record<string, unknown> | undefined, language: string, tone: string, rules: Record<string, unknown>) {
  const productName = product?.name ?? "your product";
  const price = product ? `${product.base_price} ${product.currency}` : "today's price";
  const offer = input.offer ? ` Offer: ${input.offer}.` : "";
  const disclaimer = Array.isArray(rules.requiredDisclaimers) && rules.requiredDisclaimers[0] ? ` ${rules.requiredDisclaimers[0]}` : "";
  const base = `${productName} for ${input.audience}. ${input.objective}.${offer}`;
  return [
    { format: "hook", content: `Need ${productName}? Start here.` },
    { format: "headline", content: `${productName} from ${price}` },
    { format: "caption", content: `${base} Tone: ${tone}. Language: ${language}.${disclaimer}` },
    { format: "script", content: `Scene 1: Show ${productName}. Scene 2: Explain the buyer problem. Scene 3: Present ${input.offer ?? "the product value"}. Scene 4: Ask viewers to message before ordering.` },
    { format: "brief", content: `Creative brief: ${base} Use original wording only. Recheck price, stock, delivery, and policy before publishing.` }
  ];
}

async function audit(shopId: string, actorId: string, action: string, targetType: string, targetId: string, metadata: unknown) {
  await db.query("insert into audit_events (shop_id, actor_type, actor_id, action, target_type, target_id, metadata) values ($1, 'staff', $2, $3, $4, $5, $6)", [shopId, actorId, action, targetType, targetId, JSON.stringify(metadata)]);
}

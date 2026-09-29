import { db } from "../../shared/db.js";

export class CommentsError extends Error {
  constructor(message: string, public readonly statusCode: number, public readonly code: string) { super(message); }
}

type CommentInput = {
  postId?: string;
  platform: "facebook" | "instagram";
  commenterExternalId: string;
  commenterName?: string;
  commentText: string;
};

type MetaCommentEvent = {
  platform: "facebook" | "instagram";
  externalPostId: string;
  externalCommentId: string;
  commenterExternalId: string;
  commenterName?: string;
  commentText: string;
};

export async function listPosts(shopId: string, input: { status?: string; limit: number }) {
  const values: unknown[] = [shopId, input.limit];
  const filter = input.status ? "and sp.status = $3" : "";
  if (input.status) values.push(input.status);
  const result = await db.query(
    `select sp.*, p.name as linked_product_name,
      count(cl.id)::int as lead_count,
      count(cl.id) filter (where cl.dm_status in ('drafted', 'sent'))::int as dm_count
     from social_posts sp
     left join products p on p.shop_id = sp.shop_id and p.id = sp.linked_product_id
     left join comment_leads cl on cl.shop_id = sp.shop_id and cl.post_id = sp.id
     where sp.shop_id = $1 ${filter}
     group by sp.id, p.name
     order by sp.created_at desc limit $2`,
    values
  );
  return { posts: result.rows };
}

export async function createPost(shopId: string, input: { platform: string; externalPostId: string; mediaUrl?: string; caption?: string; linkedProductId?: string | null; status: string }, actorId: string) {
  await ensureProduct(shopId, input.linkedProductId);
  try {
    const result = await db.query(
      `insert into social_posts (shop_id, platform, external_post_id, media_url, caption, linked_product_id, status, created_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8)
       returning id, shop_id, platform, external_post_id, media_url, caption, linked_product_id, status, created_at, updated_at`,
      [shopId, input.platform, input.externalPostId, input.mediaUrl ?? null, input.caption ?? null, input.linkedProductId ?? null, input.status, actorId]
    );
    await audit(shopId, actorId, "comment.post_created", "social_post", result.rows[0].id, { platform: input.platform, externalPostId: input.externalPostId });
    return { post: result.rows[0] };
  } catch (error) {
    if ((error as { code?: string }).code === "23505") throw new CommentsError("Post already exists for this shop.", 409, "POST_CONFLICT");
    throw error;
  }
}

export async function updatePost(shopId: string, postId: string, input: { mediaUrl?: string | null; caption?: string | null; linkedProductId?: string | null; status?: string }, actorId: string) {
  await ensureProduct(shopId, input.linkedProductId);
  const current = await db.query("select id from social_posts where shop_id = $1 and id = $2", [shopId, postId]);
  if (!current.rowCount) throw new CommentsError("Post not found.", 404, "POST_NOT_FOUND");
  const result = await db.query(
    `update social_posts set
      media_url = case when $3::boolean then $4 else media_url end,
      caption = case when $5::boolean then $6 else caption end,
      linked_product_id = case when $7::boolean then $8 else linked_product_id end,
      status = coalesce($9, status),
      updated_at = now()
     where shop_id = $1 and id = $2
     returning id, shop_id, platform, external_post_id, media_url, caption, linked_product_id, status, updated_at`,
    [shopId, postId, Object.hasOwn(input, "mediaUrl"), input.mediaUrl ?? null, Object.hasOwn(input, "caption"), input.caption ?? null, Object.hasOwn(input, "linkedProductId"), input.linkedProductId ?? null, input.status ?? null]
  );
  await audit(shopId, actorId, "comment.post_updated", "social_post", postId, input);
  return { post: result.rows[0] };
}

export async function listRules(shopId: string, input: { status?: string; limit: number }) {
  const values: unknown[] = [shopId, input.limit];
  const filter = input.status ? "and status = $3" : "";
  if (input.status) values.push(input.status);
  const result = await db.query(`select id, shop_id, post_id, name, keywords, language, public_reply_template, dm_template, delay_seconds, limit_per_hour, status, created_at, updated_at from comment_automation_rules where shop_id = $1 ${filter} order by created_at desc limit $2`, values);
  return { rules: result.rows };
}

export async function createRule(shopId: string, input: { postId?: string | null; name: string; keywords: string[]; language: string; publicReplyTemplate?: string; dmTemplate?: string; delaySeconds: number; limitPerHour: number }, actorId: string) {
  await ensurePost(shopId, input.postId);
  const normalizedKeywords = [...new Set(input.keywords.map((keyword) => keyword.toLowerCase()))];
  const warnings = ruleWarnings(normalizedKeywords, input.limitPerHour);
  const result = await db.query(
    `insert into comment_automation_rules (shop_id, post_id, name, keywords, language, public_reply_template, dm_template, delay_seconds, limit_per_hour, created_by)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     returning id, shop_id, post_id, name, keywords, language, public_reply_template, dm_template, delay_seconds, limit_per_hour, status, created_at`,
    [shopId, input.postId ?? null, input.name, normalizedKeywords, input.language, input.publicReplyTemplate ?? null, input.dmTemplate ?? null, input.delaySeconds, input.limitPerHour, actorId]
  );
  await audit(shopId, actorId, "comment.rule_created", "comment_automation_rule", result.rows[0].id, { warnings });
  return { rule: result.rows[0], warnings };
}

export async function previewComment(shopId: string, input: CommentInput) {
  const context = await commentContext(shopId, input);
  const classification = classifyComment(input.commentText);
  const blocked = classification.sentiment === "angry" || classification.sentiment === "spam" || classification.intent === "complaint";
  const rule = blocked ? null : context.rule;
  const publicReply = rule?.public_reply_template ? renderTemplate(rule.public_reply_template, context) : null;
  const dm = rule?.dm_template ? renderTemplate(rule.dm_template, context) : null;
  return {
    intent: classification.intent,
    sentiment: classification.sentiment,
    matchedRule: rule ? { id: rule.id, name: rule.name, limitPerHour: rule.limit_per_hour, delaySeconds: rule.delay_seconds } : null,
    product: context.product,
    safety: {
      autoDmAllowed: Boolean(rule && dm && !blocked),
      requiresReview: blocked || !rule,
      reason: blocked ? "NEGATIVE_OR_UNSAFE_COMMENT" : rule ? null : "NO_MATCHING_RULE"
    },
    preview: {
      publicReply,
      dm,
      sending: "not_connected"
    },
    warnings: ruleWarnings(rule?.keywords ?? [], rule?.limit_per_hour ?? 0)
  };
}

export async function captureComment(shopId: string, input: CommentInput & { externalCommentId: string; customerPhone?: string }, actorId: string) {
  const preview = await previewComment(shopId, input);
  const client = await db.connect();
  try {
    await client.query("begin");
    const customerId = input.customerPhone ? await findOrCreateCustomer(client, shopId, input.commenterName, input.customerPhone) : null;
    const rateLimited = preview.matchedRule ? await isRateLimited(client, shopId, preview.matchedRule.id, preview.matchedRule.limitPerHour) : false;
    const automation = rateLimited
      ? { ...preview, safety: { ...preview.safety, autoDmAllowed: false, requiresReview: true, reason: "RATE_LIMITED" }, preview: { ...preview.preview, sending: "rate_limited" } }
      : preview;
    const lead = await client.query(
      `insert into comment_leads (shop_id, post_id, rule_id, customer_id, platform, external_comment_id, commenter_external_id, commenter_name, comment_text, intent, sentiment, product_interest_id, public_reply_preview, dm_preview, dm_status, status)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
       on conflict (shop_id, platform, external_comment_id) do update set updated_at = now()
       returning id, shop_id, post_id, rule_id, customer_id, platform, external_comment_id, commenter_external_id, commenter_name, comment_text, intent, sentiment, product_interest_id, public_reply_preview, dm_preview, dm_status, order_status, status, created_at, updated_at`,
      [
        shopId,
        input.postId ?? null,
        preview.matchedRule?.id ?? null,
        customerId,
        input.platform,
        input.externalCommentId,
        input.commenterExternalId,
        input.commenterName ?? null,
        input.commentText,
        automation.intent,
        automation.sentiment,
        automation.product?.id ?? null,
        automation.preview.publicReply,
        automation.preview.dm,
        automation.safety.autoDmAllowed ? "drafted" : "blocked",
        automation.safety.requiresReview ? "review" : "dm_drafted"
      ]
    );
    if (automation.safety.autoDmAllowed && automation.matchedRule) {
      if (automation.preview.publicReply) await createActionJob(client, shopId, automation.matchedRule.id, lead.rows[0].id, "public_reply");
      if (automation.preview.dm) await createActionJob(client, shopId, automation.matchedRule.id, lead.rows[0].id, "dm");
    }
    if (automation.safety.requiresReview) {
      await client.query("insert into comment_moderation_records (shop_id, lead_id, sentiment, hidden, reason, created_by) values ($1, $2, $3, false, $4, $5)", [shopId, lead.rows[0].id, automation.sentiment, automation.safety.reason, actorId]);
    }
    await client.query("insert into audit_events (shop_id, actor_type, actor_id, action, target_type, target_id, metadata) values ($1, 'staff', $2, 'comment.lead_captured', 'comment_lead', $3, $4)", [shopId, actorId, lead.rows[0].id, JSON.stringify({ externalCommentId: input.externalCommentId, autoDmAllowed: automation.safety.autoDmAllowed })]);
    await client.query("commit");
    return { lead: lead.rows[0], automation };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function ingestMetaCommentEvents(shopId: string, events: MetaCommentEvent[]) {
  const results = [];
  for (const event of events) {
    const post = await db.query("select id from social_posts where shop_id = $1 and platform = $2 and external_post_id = $3 and status = 'active' limit 1", [shopId, event.platform, event.externalPostId]);
    if (!post.rowCount) {
      results.push({ externalCommentId: event.externalCommentId, status: "ignored", reason: "POST_NOT_REGISTERED" });
      continue;
    }
    const captured = await captureComment(shopId, { postId: post.rows[0].id, platform: event.platform, externalCommentId: event.externalCommentId, commenterExternalId: event.commenterExternalId, commenterName: event.commenterName, commentText: event.commentText }, "system");
    results.push({ externalCommentId: event.externalCommentId, status: "captured", leadId: captured.lead.id });
  }
  await db.query("insert into audit_events (shop_id, actor_type, actor_id, action, target_type, target_id, metadata) values ($1, 'system', 'system', 'comment.meta_webhook_processed', 'shop', $1, $2)", [shopId, JSON.stringify({ total: events.length, captured: results.filter((result) => result.status === "captured").length })]);
  return { processed: results };
}

export function extractMetaCommentEvents(payload: unknown): MetaCommentEvent[] {
  const body = payload as { object?: string; entry?: Array<{ changes?: Array<{ field?: string; value?: Record<string, unknown> }>; messaging?: Array<Record<string, unknown>> }> };
  const events: MetaCommentEvent[] = [];
  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value ?? {};
      const text = stringValue(value.message) ?? stringValue(value.text);
      const commentId = stringValue(value.comment_id) ?? stringValue(value.id);
      const postId = stringValue(value.post_id) ?? stringValue(value.media_id) ?? stringValue(value.parent_id);
      if (!text || !commentId || !postId) continue;
      const from = value.from as { id?: unknown; name?: unknown } | undefined;
      events.push({
        platform: body.object === "instagram" ? "instagram" : "facebook",
        externalPostId: postId,
        externalCommentId: commentId,
        commenterExternalId: stringValue(from?.id) ?? "unknown",
        commenterName: stringValue(from?.name),
        commentText: text
      });
    }
  }
  return events;
}

export async function markCommentActionNotConnected(actionId: string) {
  const result = await db.query(
    `update comment_automation_actions
     set status = 'failed', provider_status = 'not_connected', attempts = attempts + 1, last_attempt_at = now(), updated_at = now(), error = 'META_SEND_NOT_CONNECTED'
     where id = $1 and provider_status = 'queued'
     returning id, shop_id, lead_id, action, status, provider_status, attempts`,
    [actionId]
  );
  if (!result.rowCount) return { skipped: true };
  await db.query("insert into audit_events (shop_id, actor_type, actor_id, action, target_type, target_id, metadata) values ($1, 'system', 'system', 'comment.action_not_connected', 'comment_automation_action', $2, $3)", [result.rows[0].shop_id, actionId, JSON.stringify({ action: result.rows[0].action })]);
  return { action: result.rows[0] };
}

export async function listLeads(shopId: string, input: { status?: string; limit: number }) {
  const values: unknown[] = [shopId, input.limit];
  const filter = input.status ? "and status = $3" : "";
  if (input.status) values.push(input.status);
  const result = await db.query(`select id, shop_id, post_id, rule_id, customer_id, platform, external_comment_id, commenter_name, intent, sentiment, dm_status, order_status, status, created_at, updated_at from comment_leads where shop_id = $1 ${filter} order by created_at desc limit $2`, values);
  return { leads: result.rows };
}

export async function moderateLead(shopId: string, leadId: string, input: { hidden?: boolean; reason?: string; assignedStaffId?: string | null; staffAction: string }, actorId: string) {
  const lead = await db.query("select id, sentiment from comment_leads where shop_id = $1 and id = $2", [shopId, leadId]);
  if (!lead.rowCount) throw new CommentsError("Lead not found.", 404, "LEAD_NOT_FOUND");
  const result = await db.query(
    `insert into comment_moderation_records (shop_id, lead_id, sentiment, hidden, reason, assigned_staff_id, staff_action, created_by)
     values ($1, $2, $3, $4, $5, $6, $7, $8)
     returning id, shop_id, lead_id, sentiment, hidden, reason, assigned_staff_id, staff_action, created_at`,
    [shopId, leadId, lead.rows[0].sentiment, input.hidden ?? false, input.reason ?? null, input.assignedStaffId ?? null, input.staffAction, actorId]
  );
  if (input.staffAction === "closed") await db.query("update comment_leads set status = 'closed', updated_at = now() where shop_id = $1 and id = $2", [shopId, leadId]);
  await audit(shopId, actorId, "comment.moderated", "comment_lead", leadId, input);
  return { moderation: result.rows[0] };
}

async function commentContext(shopId: string, input: CommentInput) {
  const post = input.postId ? await db.query("select id, linked_product_id from social_posts where shop_id = $1 and id = $2 and status = 'active'", [shopId, input.postId]) : { rowCount: 0, rows: [] };
  if (input.postId && !post.rowCount) throw new CommentsError("Post not found.", 404, "POST_NOT_FOUND");
  const productId = post.rows[0]?.linked_product_id as string | undefined;
  const product = productId ? await productSummary(shopId, productId) : null;
  const rules = await db.query(
    `select id, name, keywords, public_reply_template, dm_template, delay_seconds, limit_per_hour
     from comment_automation_rules
     where shop_id = $1 and status = 'active' and (post_id is null or post_id = $2)
     order by post_id nulls last, created_at desc`,
    [shopId, input.postId ?? null]
  );
  const text = input.commentText.toLowerCase();
  const rule = rules.rows.find((row) => (row.keywords as string[]).some((keyword) => text.includes(keyword.toLowerCase()))) ?? null;
  return { postId: input.postId ?? null, product, rule };
}

async function productSummary(shopId: string, productId: string) {
  const result = await db.query(
    `select p.id, p.name, p.base_price, p.currency, coalesce(sum(il.delta_quantity), 0)::int as stock
     from products p
     join product_variants pv on pv.shop_id = p.shop_id and pv.product_id = p.id and pv.status = 'active'
     left join inventory_ledger il on il.shop_id = pv.shop_id and il.variant_id = pv.id
     where p.shop_id = $1 and p.id = $2 and p.status = 'active'
     group by p.id`,
    [shopId, productId]
  );
  return result.rows[0] ? { id: result.rows[0].id, name: result.rows[0].name, price: result.rows[0].base_price, currency: result.rows[0].currency, stock: Number(result.rows[0].stock) } : null;
}

function classifyComment(text: string) {
  const value = text.toLowerCase();
  if (/spam|scam|fake|fraud|faltu/.test(value)) return { intent: "spam", sentiment: "spam" };
  if (/angry|refund|bad|complain|legal|abuse|rude|baje/.test(value)) return { intent: "complaint", sentiment: "angry" };
  if (/price|pp|dam|koto|available|stock|size|details|inbox/.test(value)) return { intent: "purchase_interest", sentiment: "neutral" };
  return { intent: "unknown", sentiment: "neutral" };
}

function renderTemplate(template: string, context: { product: { name: string; price: string; currency: string; stock: number } | null }) {
  return template
    .replaceAll("{{product_name}}", context.product?.name ?? "our shop")
    .replaceAll("{{price}}", context.product ? `${context.product.price} ${context.product.currency}` : "see product page")
    .replaceAll("{{stock}}", context.product ? String(context.product.stock) : "available items");
}

function ruleWarnings(keywords: string[], limitPerHour: number) {
  const broad = ["hi", "hello", "info", "details", "inbox"];
  const warnings: string[] = [];
  if (keywords.some((keyword) => broad.includes(keyword.toLowerCase()))) warnings.push("RULE_TOO_BROAD");
  if (limitPerHour > 60) warnings.push("RATE_LIMIT_HIGH");
  return warnings;
}

async function ensurePost(shopId: string, postId?: string | null) {
  if (!postId) return;
  const post = await db.query("select id from social_posts where shop_id = $1 and id = $2", [shopId, postId]);
  if (!post.rowCount) throw new CommentsError("Post not found.", 404, "POST_NOT_FOUND");
}

async function ensureProduct(shopId: string, productId?: string | null) {
  if (productId === undefined) return;
  if (productId === null) return;
  const product = await db.query("select id from products where shop_id = $1 and id = $2", [shopId, productId]);
  if (!product.rowCount) throw new CommentsError("Product not found.", 404, "PRODUCT_NOT_FOUND");
}

async function findOrCreateCustomer(client: { query: typeof db.query }, shopId: string, name: string | undefined, phone: string) {
  const existing = await client.query("select id from customers where shop_id = $1 and phone = $2", [shopId, phone]);
  if (existing.rowCount) return existing.rows[0].id as string;
  const created = await client.query("insert into customers (shop_id, name, phone) values ($1, $2, $3) returning id", [shopId, name ?? "Comment Lead", phone]);
  return created.rows[0].id as string;
}

async function isRateLimited(client: { query: typeof db.query }, shopId: string, ruleId: string, limitPerHour: number) {
  const result = await client.query(
    "select count(*)::int as count from comment_automation_actions where shop_id = $1 and rule_id = $2 and status in ('drafted', 'sent') and created_at >= now() - interval '1 hour'",
    [shopId, ruleId]
  );
  return Number(result.rows[0].count) >= limitPerHour;
}

async function createActionJob(client: { query: typeof db.query }, shopId: string, ruleId: string, leadId: string, action: "public_reply" | "dm") {
  const row = await client.query("insert into comment_automation_actions (shop_id, rule_id, lead_id, action, status, provider_status) values ($1, $2, $3, $4, 'drafted', 'queued') returning id", [shopId, ruleId, leadId, action]);
  const job = await client.query("insert into outbox_jobs (shop_id, queue, job_type, payload, max_attempts) values ($1, 'comments', 'comment.action.dispatch', $2, 3) returning id", [shopId, JSON.stringify({ actionId: row.rows[0].id })]);
  await client.query("update comment_automation_actions set job_id = $2 where id = $1", [row.rows[0].id, job.rows[0].id]);
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

async function audit(shopId: string, actorId: string, action: string, targetType: string, targetId: string, metadata: unknown) {
  await db.query("insert into audit_events (shop_id, actor_type, actor_id, action, target_type, target_id, metadata) values ($1, 'staff', $2, $3, $4, $5, $6)", [shopId, actorId, action, targetType, targetId, JSON.stringify(metadata)]);
}

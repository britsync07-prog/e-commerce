import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import pg from "pg";

if (!process.env.DATABASE_URL) {
  console.log("Skipping comments DB smoke: DATABASE_URL is not set.");
  process.exit(0);
}

process.env.META_WEBHOOK_SECRET ??= "comments-smoke-webhook-secret";
const { buildApp } = await import("../dist/app.js");
const { markCommentActionNotConnected } = await import("../dist/modules/comments/comments.service.js");
const { processMetaWebhookEvent } = await import("../dist/modules/meta/meta.service.js");

const app = await buildApp();
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
try { await client.connect(); } catch { await app.close(); console.log("Skipping comments DB smoke: database is not reachable."); process.exit(0); }

try {
  const stamp = Date.now();
  const email = `comments-${stamp}@example.com`;
  const registered = await app.inject({ method: "POST", url: "/api/v1/auth/register", payload: { name: "Comments Smoke", email, password: "strong-password-123", language: "en" } });
  assert.equal(registered.statusCode, 201, registered.body);
  const login = await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { identifier: email, password: "strong-password-123" } });
  assert.equal(login.statusCode, 200, login.body);
  const token = login.json().token;
  const started = await app.inject({ method: "POST", url: "/api/v1/onboarding/start", headers: { authorization: `Bearer ${token}` }, payload: { ownerName: "Comments Smoke", language: "bn-en", shopName: "Comments Shop", subdomain: `comments-${stamp}`, category: "fashion", country: "Bangladesh", currency: "BDT" } });
  assert.equal(started.statusCode, 201, started.body);
  const shopId = started.json().shop.id;
  const product = await app.inject({ method: "POST", url: `/api/v1/onboarding/${shopId}/products`, payload: { name: "Comment Shirt", price: 900, stock: 4 } });
  assert.equal(product.statusCode, 201, product.body);
  const productId = product.json().products[0].id;

  const post = await app.inject({ method: "POST", url: `/api/v1/comments/shops/${shopId}/posts`, headers: { authorization: `Bearer ${token}` }, payload: { platform: "facebook", externalPostId: `post-${stamp}`, caption: "New shirt", linkedProductId: productId } });
  assert.equal(post.statusCode, 201, post.body);
  const postId = post.json().post.id;

  const rule = await app.inject({ method: "POST", url: `/api/v1/comments/shops/${shopId}/rules`, headers: { authorization: `Bearer ${token}` }, payload: { postId, name: "Price replies", keywords: ["price", "pp", "inbox"], language: "bn-en", publicReplyTemplate: "Sent details for {{product_name}}.", dmTemplate: "{{product_name}} price is {{price}}. Stock: {{stock}}.", delaySeconds: 30, limitPerHour: 1 } });
  assert.equal(rule.statusCode, 201, rule.body);
  assert.ok(rule.json().warnings.includes("RULE_TOO_BROAD"));

  const preview = await app.inject({ method: "POST", url: `/api/v1/comments/shops/${shopId}/comments/preview`, headers: { authorization: `Bearer ${token}` }, payload: { postId, platform: "facebook", commenterExternalId: "buyer-1", commenterName: "Buyer One", commentText: "price please" } });
  assert.equal(preview.statusCode, 200, preview.body);
  assert.equal(preview.json().safety.autoDmAllowed, true);
  assert.match(preview.json().preview.dm, /900/);

  const phone = `+88019${stamp.toString().slice(-8)}`;
  const capture = await app.inject({ method: "POST", url: `/api/v1/comments/shops/${shopId}/comments/capture`, headers: { authorization: `Bearer ${token}` }, payload: { postId, platform: "facebook", externalCommentId: `comment-${stamp}`, commenterExternalId: "buyer-1", commenterName: "Buyer One", commentText: "pp?", customerPhone: phone } });
  assert.equal(capture.statusCode, 201, capture.body);
  assert.equal(capture.json().lead.dm_status, "drafted");
  const customer = await client.query("select id from customers where shop_id = $1 and phone = $2", [shopId, phone]);
  assert.equal(customer.rowCount, 1);
  assert.equal(capture.json().lead.customer_id, customer.rows[0].id);
  const actionJob = await client.query(
    `select ca.id, ca.provider_status, ca.job_id, oj.queue, oj.job_type
     from comment_automation_actions ca
     join outbox_jobs oj on oj.id = ca.job_id
     where ca.shop_id = $1 and ca.lead_id = $2
     order by ca.created_at asc limit 1`,
    [shopId, capture.json().lead.id]
  );
  assert.equal(actionJob.rowCount, 1);
  assert.equal(actionJob.rows[0].provider_status, "queued");
  assert.equal(actionJob.rows[0].queue, "comments");
  assert.equal(actionJob.rows[0].job_type, "comment.action.dispatch");

  const duplicate = await app.inject({ method: "POST", url: `/api/v1/comments/shops/${shopId}/comments/capture`, headers: { authorization: `Bearer ${token}` }, payload: { postId, platform: "facebook", externalCommentId: `comment-${stamp}`, commenterExternalId: "buyer-1", commenterName: "Buyer One", commentText: "pp?", customerPhone: phone } });
  assert.equal(duplicate.statusCode, 201, duplicate.body);
  assert.equal(duplicate.json().lead.id, capture.json().lead.id);

  const limited = await app.inject({ method: "POST", url: `/api/v1/comments/shops/${shopId}/comments/capture`, headers: { authorization: `Bearer ${token}` }, payload: { postId, platform: "facebook", externalCommentId: `limited-${stamp}`, commenterExternalId: "buyer-3", commenterName: "Buyer Three", commentText: "price?", customerPhone: `+88018${stamp.toString().slice(-8)}` } });
  assert.equal(limited.statusCode, 201, limited.body);
  assert.equal(limited.json().automation.safety.reason, "RATE_LIMITED");
  assert.equal(limited.json().lead.dm_status, "blocked");

  const angry = await app.inject({ method: "POST", url: `/api/v1/comments/shops/${shopId}/comments/capture`, headers: { authorization: `Bearer ${token}` }, payload: { postId, platform: "facebook", externalCommentId: `angry-${stamp}`, commenterExternalId: "buyer-2", commenterName: "Angry Buyer", commentText: "bad product refund now" } });
  assert.equal(angry.statusCode, 201, angry.body);
  assert.equal(angry.json().automation.safety.autoDmAllowed, false);
  assert.equal(angry.json().lead.dm_status, "blocked");
  assert.equal(angry.json().lead.status, "review");

  const moderation = await app.inject({ method: "POST", url: `/api/v1/comments/shops/${shopId}/leads/${angry.json().lead.id}/moderation`, headers: { authorization: `Bearer ${token}` }, payload: { hidden: true, reason: "Abusive refund comment", staffAction: "hidden" } });
  assert.equal(moderation.statusCode, 201, moderation.body);
  assert.equal(moderation.json().moderation.hidden, true);

  const leads = await app.inject({ method: "GET", url: `/api/v1/comments/shops/${shopId}/leads`, headers: { authorization: `Bearer ${token}` } });
  assert.equal(leads.statusCode, 200, leads.body);
  assert.equal(leads.json().leads.length, 3);
  const audit = await client.query("select action from audit_events where shop_id = $1 and action in ('comment.lead_captured', 'comment.moderated')", [shopId]);
  assert.ok(audit.rowCount >= 3);

  await markCommentActionNotConnected(actionJob.rows[0].id);
  const action = await client.query("select provider_status, status from comment_automation_actions where id = $1", [actionJob.rows[0].id]);
  assert.equal(action.rows[0].provider_status, "not_connected");
  assert.equal(action.rows[0].status, "failed");

  const webhookPayload = { object: "page", entry: [{ changes: [{ field: "feed", value: { post_id: `post-${stamp}`, comment_id: `webhook-${stamp}`, message: "price please", from: { id: "buyer-webhook", name: "Webhook Buyer" } } }] }] };
  const signature = `sha256=${createHmac("sha256", process.env.META_WEBHOOK_SECRET).update(JSON.stringify(webhookPayload)).digest("hex")}`;
  const webhook = await app.inject({ method: "POST", url: `/api/v1/webhooks/meta/${shopId}`, headers: { "x-hub-signature-256": signature, "x-meta-event-id": `comments-${stamp}` }, payload: webhookPayload });
  assert.equal(webhook.statusCode, 200, webhook.body);
  const webhookEvent = await client.query("select id, status from webhook_events where provider_event_id = $1", [`comments-${stamp}`]);
  assert.equal(webhookEvent.rows[0].status, "pending");
  await processMetaWebhookEvent(webhookEvent.rows[0].id);
  const processedWebhookEvent = await client.query("select status from webhook_events where id = $1", [webhookEvent.rows[0].id]);
  assert.equal(processedWebhookEvent.rows[0].status, "processed");
  const webhookLead = await client.query("select id from comment_leads where shop_id = $1 and external_comment_id = $2", [shopId, `webhook-${stamp}`]);
  assert.equal(webhookLead.rowCount, 1);
  console.log("Comments DB smoke passed.");
} finally {
  await client.end();
  await app.close();
}

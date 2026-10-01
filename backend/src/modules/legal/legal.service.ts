import { createHash, randomUUID } from "node:crypto";
import { db } from "../../shared/db.js";

export class LegalError extends Error {
  constructor(message: string, public readonly statusCode: number, public readonly code: string) { super(message); }
}

export async function listPolicies(shopId: string) {
  const result = await db.query(
    "select id, policy_type, title, version, status, published_at, created_at, updated_at from legal_policies where shop_id = $1 order by policy_type, version desc",
    [shopId]
  );
  return { policies: result.rows };
}

export async function upsertPolicy(shopId: string, policyType: string, input: { title: string; body: string; publish: boolean }, actorId: string) {
  const client = await db.connect();
  try {
    await client.query("begin");
    const next = await client.query("select coalesce(max(version), 0) + 1 as version from legal_policies where shop_id = $1 and policy_type = $2", [shopId, policyType]);
    if (input.publish) {
      await client.query("update legal_policies set status = 'archived', updated_at = now() where shop_id = $1 and policy_type = $2 and status = 'published'", [shopId, policyType]);
    }
    const result = await client.query(
      `insert into legal_policies (shop_id, policy_type, title, body, version, status, published_at, created_by)
       values ($1, $2, $3, $4, $5, $6, case when $6 = 'published' then now() else null end, $7)
       returning id, shop_id, policy_type, title, body, version, status, published_at, created_at, updated_at`,
      [shopId, policyType, input.title, input.body, next.rows[0].version, input.publish ? "published" : "draft", actorId]
    );
    await client.query(
      "insert into audit_events (shop_id, actor_type, actor_id, action, target_type, target_id, metadata) values ($1, 'staff', $2, $3, 'legal_policy', $4, $5)",
      [shopId, actorId, input.publish ? "legal.policy_published" : "legal.policy_drafted", result.rows[0].id, JSON.stringify({ policyType, version: result.rows[0].version })]
    );
    await client.query("commit");
    return { policy: result.rows[0] };
  } catch (error) { await client.query("rollback"); throw error; } finally { client.release(); }
}

export async function publicPolicies(subdomain: string) {
  const shop = await shopBySubdomain(subdomain);
  const result = await db.query(
    `select distinct on (policy_type) id, policy_type, title, body, version, published_at
     from legal_policies
     where shop_id = $1 and status = 'published'
     order by policy_type, version desc`,
    [shop.id]
  );
  return { shop: publicShop(shop), policies: result.rows };
}

export async function recordCookieConsent(subdomain: string, input: { visitorId?: string; categories: unknown; policyVersion?: number }, meta: { ipAddress?: string; userAgent?: string }) {
  const shop = await shopBySubdomain(subdomain);
  const result = await db.query(
    `insert into cookie_consents (shop_id, visitor_id, consent_id, categories, policy_version, ip_hash, user_agent_hash)
     values ($1, $2, $3, $4, $5, $6, $7)
     returning id, consent_id, categories, policy_version, created_at`,
    [shop.id, input.visitorId ?? null, randomUUID(), JSON.stringify(input.categories), input.policyVersion ?? null, hash(meta.ipAddress), hash(meta.userAgent)]
  );
  return { consent: result.rows[0] };
}

export async function createPrivacyRequest(subdomain: string, input: { requestType: string; requesterName?: string; requesterEmail?: string; requesterPhone?: string; details?: string }) {
  const shop = await shopBySubdomain(subdomain);
  const customer = input.requesterPhone
    ? await db.query("select id from customers where shop_id = $1 and phone = $2 and status = 'active' limit 1", [shop.id, input.requesterPhone])
    : { rows: [] };
  const result = await db.query(
    `insert into privacy_requests (shop_id, request_type, requester_name, requester_email, requester_phone, customer_id, details)
     values ($1, $2, $3, $4, $5, $6, $7)
     returning id, request_type, status, created_at`,
    [shop.id, input.requestType, input.requesterName ?? null, input.requesterEmail?.toLowerCase() ?? null, input.requesterPhone ?? null, customer.rows[0]?.id ?? null, input.details ?? null]
  );
  return { request: result.rows[0] };
}

export async function listPrivacyRequests(shopId: string, input: { status?: string; limit: number }) {
  const values: unknown[] = [shopId, input.limit];
  const filters = ["shop_id = $1"];
  if (input.status) { values.push(input.status); filters.push(`status = $${values.length}`); }
  const result = await db.query(
    `select id, request_type, status, requester_name, requester_email, requester_phone, customer_id, details, resolution_note, reviewed_by, reviewed_at, completed_at, created_at, updated_at
     from privacy_requests where ${filters.join(" and ")} order by created_at desc limit $2`,
    values
  );
  return { requests: result.rows };
}

export async function updatePrivacyRequest(shopId: string, requestId: string, input: { status: string; resolutionNote?: string }, actorId: string) {
  const result = await db.query(
    `update privacy_requests
     set status = $3, resolution_note = $4, reviewed_by = $5, reviewed_at = now(),
       completed_at = case when $3 in ('completed', 'rejected') then now() else completed_at end,
       updated_at = now()
     where shop_id = $1 and id = $2
     returning id, request_type, status, requester_name, requester_email, requester_phone, customer_id, details, resolution_note, reviewed_by, reviewed_at, completed_at, created_at, updated_at`,
    [shopId, requestId, input.status, input.resolutionNote ?? null, actorId]
  );
  if (!result.rowCount) throw new LegalError("Privacy request not found.", 404, "PRIVACY_REQUEST_NOT_FOUND");
  await db.query(
    "insert into audit_events (shop_id, actor_type, actor_id, action, target_type, target_id, metadata) values ($1, 'staff', $2, 'privacy_request.updated', 'privacy_request', $3, $4)",
    [shopId, actorId, requestId, JSON.stringify({ status: input.status, resolutionNote: input.resolutionNote ?? null })]
  );
  return { request: result.rows[0] };
}

async function shopBySubdomain(subdomain: string) {
  const result = await db.query("select id, display_name, subdomain, country, currency, language from shops where subdomain = $1 and status = 'launched' limit 1", [subdomain]);
  if (!result.rowCount) throw new LegalError("Published shop not found.", 404, "SHOP_NOT_FOUND");
  return result.rows[0];
}

function publicShop(row: Record<string, unknown>) {
  return { id: row.id, displayName: row.display_name, subdomain: row.subdomain, country: row.country, currency: row.currency, language: row.language };
}

function hash(value: unknown) {
  return typeof value === "string" && value ? createHash("sha256").update(value).digest("hex") : null;
}

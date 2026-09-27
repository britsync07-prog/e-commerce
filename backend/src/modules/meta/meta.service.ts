import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { config } from "../../shared/config.js";
import { db } from "../../shared/db.js";

export class MetaError extends Error {
  constructor(message: string, public readonly statusCode: number, public readonly code: string) { super(message); }
}

export async function listConnections(shopId: string) {
  const result = await db.query(`select id, shop_id, page_id, instagram_account_id, status, last_verified_at, last_webhook_at, settings, created_at, updated_at from meta_connections where shop_id = $1 order by created_at desc`, [shopId]);
  return { connections: result.rows.map((row) => ({ ...row, hasCredential: true })) };
}

export async function createConnection(shopId: string, input: { pageId?: string; instagramAccountId?: string; credentialRef: string; settings?: Record<string, unknown> }, actorId: string) {
  try {
    const result = await db.query(`insert into meta_connections (shop_id, page_id, instagram_account_id, credential_ref, settings, created_by) values ($1, $2, $3, $4, $5, $6) returning id, shop_id, page_id, instagram_account_id, status, settings, created_at, updated_at`, [shopId, input.pageId ?? null, input.instagramAccountId ?? null, input.credentialRef, JSON.stringify(input.settings ?? {}), actorId]);
    await audit(shopId, actorId, "meta.connection_created", "meta_connection", result.rows[0].id, { pageId: input.pageId, instagramAccountId: input.instagramAccountId });
    return { connection: { ...result.rows[0], hasCredential: true } };
  } catch (error) {
    if ((error as { code?: string }).code === "23505") throw new MetaError("This Meta account is already connected to the shop.", 409, "META_CONNECTION_CONFLICT");
    throw error;
  }
}

export async function updateConnection(shopId: string, connectionId: string, status: "active" | "disabled" | "error", actorId: string) {
  const result = await db.query(`update meta_connections set status = $3, updated_at = now() where shop_id = $1 and id = $2 returning id, shop_id, page_id, instagram_account_id, status, last_verified_at, last_webhook_at, settings, updated_at`, [shopId, connectionId, status]);
  if (!result.rowCount) throw new MetaError("Meta connection not found.", 404, "META_CONNECTION_NOT_FOUND");
  await audit(shopId, actorId, "meta.connection_status_updated", "meta_connection", connectionId, { status });
  return { connection: { ...result.rows[0], hasCredential: true } };
}

export function verifySignature(payload: unknown, signature: string | undefined) {
  if (!config.metaWebhookSecret) throw new MetaError("Meta webhook secret is not configured.", 503, "META_WEBHOOK_NOT_CONFIGURED");
  if (!signature?.startsWith("sha256=")) throw new MetaError("A valid Meta webhook signature is required.", 401, "META_WEBHOOK_SIGNATURE_INVALID");
  const received = Buffer.from(signature.slice(7), "hex");
  const expected = createHmac("sha256", config.metaWebhookSecret).update(JSON.stringify(payload)).digest();
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) throw new MetaError("A valid Meta webhook signature is required.", 401, "META_WEBHOOK_SIGNATURE_INVALID");
}

export async function ingestWebhook(shopId: string, payload: unknown, signature: string | undefined, eventId?: string) {
  verifySignature(payload, signature);
  const raw = JSON.stringify(payload);
  const providerEventId = eventId?.trim() || createHash("sha256").update(raw).digest("hex");
  const payloadHash = createHash("sha256").update(raw).digest("hex");
  const result = await db.query(`insert into webhook_events (shop_id, provider, provider_event_id, payload_hash, raw_payload, status) values ($1, 'meta', $2, $3, $4, 'pending') on conflict (provider, provider_event_id) do nothing returning id, provider_event_id, status, created_at`, [shopId, providerEventId, payloadHash, raw]);
  if (!result.rowCount) return { accepted: true, duplicate: true, providerEventId };
  await db.query("update meta_connections set last_webhook_at = now(), updated_at = now() where shop_id = $1 and status = 'active'", [shopId]);
  return { accepted: true, duplicate: false, event: result.rows[0] };
}

export async function verifyWebhook(query: { mode?: string; verifyToken?: string; challenge?: string }) {
  if (!config.metaWebhookVerifyToken || query.mode !== "subscribe" || query.verifyToken !== config.metaWebhookVerifyToken || !query.challenge) throw new MetaError("Meta webhook verification failed.", 403, "META_WEBHOOK_VERIFICATION_FAILED");
  return query.challenge;
}

async function audit(shopId: string, actorId: string, action: string, targetType: string, targetId: string, metadata: unknown) {
  await db.query("insert into audit_events (shop_id, actor_type, actor_id, action, target_type, target_id, metadata) values ($1, 'staff', $2, $3, $4, $5, $6)", [shopId, actorId, action, targetType, targetId, JSON.stringify(metadata)]);
}

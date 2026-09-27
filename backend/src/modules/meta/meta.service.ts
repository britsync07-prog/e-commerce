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

export async function getCatalogSync(shopId: string) {
  const result = await db.query(`select id, shop_id, connection_id, status, settings, products_count, skipped_count, last_started_at, last_completed_at, last_error, updated_at from meta_catalog_syncs where shop_id = $1`, [shopId]);
  return { catalogSync: result.rows[0] ?? { shopId, status: "not_configured", settings: { skipUnpublished: true, skipOutOfStock: true }, productsCount: 0, skippedCount: 0 } };
}

export async function saveCatalogSync(shopId: string, input: { connectionId: string; skipUnpublished: boolean; skipOutOfStock: boolean }, actorId: string) {
  const connection = await db.query("select id from meta_connections where shop_id = $1 and id = $2 and status = 'active'", [shopId, input.connectionId]);
  if (!connection.rowCount) throw new MetaError("An active Meta connection is required.", 409, "META_CONNECTION_REQUIRED");
  const settings = { skipUnpublished: input.skipUnpublished, skipOutOfStock: input.skipOutOfStock };
  const result = await db.query(`insert into meta_catalog_syncs (shop_id, connection_id, settings, created_by) values ($1, $2, $3, $4) on conflict (shop_id) do update set connection_id = excluded.connection_id, settings = excluded.settings, status = 'pending', last_error = null, updated_at = now() returning id, shop_id, connection_id, status, settings, products_count, skipped_count, last_started_at, last_completed_at, last_error, updated_at`, [shopId, input.connectionId, JSON.stringify(settings), actorId]);
  await audit(shopId, actorId, "meta.catalog_sync_configured", "meta_catalog_sync", result.rows[0].id, settings);
  return { catalogSync: result.rows[0] };
}

export async function previewCatalog(shopId: string, input: { skipUnpublished: boolean; skipOutOfStock: boolean }) {
  const result = await db.query(`
    select p.id as product_id, p.name, p.slug, p.description, p.status as product_status, p.base_price, p.currency,
      pv.id as variant_id, pv.sku, pv.title, pv.price, pv.status as variant_status,
      coalesce(sum(il.delta_quantity), 0)::int as stock
    from products p
    join product_variants pv on pv.shop_id = p.shop_id and pv.product_id = p.id
    left join inventory_ledger il on il.shop_id = pv.shop_id and il.variant_id = pv.id
    where p.shop_id = $1
    group by p.id, pv.id
    order by p.created_at desc, pv.created_at asc`, [shopId]);
  type PreviewProduct = { id: string; name: string; slug: string; description: string | null; status: string; basePrice: string; currency: string; variants: Array<{ id: string; sku: string | null; title: string; price: string; stock: number }> };
  const products = new Map<string, PreviewProduct>();
  let skipped = 0;
  for (const row of result.rows) {
    const eligible = row.variant_status === "active" && (!input.skipUnpublished || row.product_status === "active") && (!input.skipOutOfStock || Number(row.stock) > 0);
    if (!eligible) { skipped += 1; continue; }
    const product: PreviewProduct = products.get(row.product_id) ?? { id: row.product_id, name: row.name, slug: row.slug, description: row.description, status: row.product_status, basePrice: row.base_price, currency: row.currency, variants: [] };
    product.variants.push({ id: row.variant_id, sku: row.sku, title: row.title, price: row.price, stock: Number(row.stock) });
    products.set(row.product_id, product);
  }
  return { settings: input, summary: { products: products.size, variants: [...products.values()].reduce((total, product) => total + product.variants.length, 0), skippedVariants: skipped }, products: [...products.values()] };
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

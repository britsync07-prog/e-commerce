import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { config } from "../../shared/config.js";
import { db } from "../../shared/db.js";

export class MetaError extends Error {
  constructor(message: string, public readonly statusCode: number, public readonly code: string) { super(message); }
}

export async function listConnections(shopId: string) {
  const result = await db.query(`select id, shop_id, page_id, instagram_account_id, status, last_verified_at, last_webhook_at, settings, created_at, updated_at from meta_connections where shop_id = $1 order by created_at desc`, [shopId]);
  return { connections: result.rows.map((row) => ({ ...row, hasCredential: true })) };
}

export async function startOAuth(shopId: string, userId: string) {
  ensureOAuthConfig();
  const state = randomBytes(32).toString("base64url");
  await db.query("insert into meta_oauth_states (state_hash, shop_id, user_id, expires_at) values ($1, $2, $3, now() + interval '10 minutes')", [hash(state), shopId, userId]);
  const url = new URL(`https://www.facebook.com/${config.metaGraphVersion}/dialog/oauth`);
  url.searchParams.set("client_id", config.metaAppId!);
  url.searchParams.set("redirect_uri", oauthRedirectUri());
  url.searchParams.set("state", state);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", config.metaOAuthScopes);
  return { authorizationUrl: url.toString(), expiresInSeconds: 600 };
}

export async function handleOAuthCallback(code: string, state: string) {
  ensureOAuthConfig();
  const stateResult = await db.query("select id, shop_id, user_id, status, expires_at from meta_oauth_states where state_hash = $1", [hash(state)]);
  if (!stateResult.rowCount || stateResult.rows[0].status !== "pending" || new Date(stateResult.rows[0].expires_at).getTime() <= Date.now()) throw new MetaError("Meta OAuth state is invalid or expired.", 400, "META_OAUTH_STATE_INVALID");
  const userToken = await exchangeCode(code);
  const pages = await fetchPages(userToken);
  if (!pages.length) throw new MetaError("No Facebook Pages were granted to this account.", 409, "META_NO_PAGES");
  await db.query("update meta_oauth_states set status = 'awaiting_page', user_token_ciphertext = $2, pages = $3 where id = $1", [stateResult.rows[0].id, encrypt(userToken), JSON.stringify(pages.map((page) => ({ id: page.id, name: page.name, instagramAccountId: page.instagram_business_account?.id ?? null, accessTokenCiphertext: encrypt(page.access_token) })))]);
  return { shopId: stateResult.rows[0].shop_id, state, pageCount: pages.length };
}

export async function completeOAuth(shopId: string, userId: string, input: { state: string; pageId: string }) {
  const stateResult = await db.query("select id, user_id, status, pages from meta_oauth_states where state_hash = $1 and shop_id = $2", [hash(input.state), shopId]);
  if (!stateResult.rowCount || stateResult.rows[0].user_id !== userId || stateResult.rows[0].status !== "awaiting_page") throw new MetaError("Meta page selection is invalid or expired.", 400, "META_OAUTH_SELECTION_INVALID");
  const page = (stateResult.rows[0].pages as Array<{ id: string; name: string; instagramAccountId: string | null; accessTokenCiphertext: string }>).find((item) => item.id === input.pageId);
  if (!page) throw new MetaError("Selected Facebook Page was not granted by Meta.", 400, "META_PAGE_NOT_GRANTED");
  const result = await db.query(`insert into meta_connections (shop_id, page_id, instagram_account_id, credential_ref, encrypted_access_token, settings, created_by) values ($1, $2, $3, 'meta-oauth', $4, $5, $6) on conflict (shop_id, page_id, instagram_account_id) do update set encrypted_access_token = excluded.encrypted_access_token, status = 'active', updated_at = now() returning id, shop_id, page_id, instagram_account_id, status, settings, created_at, updated_at`, [shopId, page.id, page.instagramAccountId, page.accessTokenCiphertext, JSON.stringify({ pageName: page.name }), userId]);
  await db.query("update meta_oauth_states set status = 'used', used_at = now() where id = $1", [stateResult.rows[0].id]);
  await audit(shopId, userId, "meta.connection_created", "meta_connection", result.rows[0].id, { pageId: page.id, pageName: page.name, via: "oauth" });
  return { connection: { ...result.rows[0], hasCredential: true } };
}

async function exchangeCode(code: string) {
  const url = new URL(`https://graph.facebook.com/${config.metaGraphVersion}/oauth/access_token`);
  url.searchParams.set("client_id", config.metaAppId!);
  url.searchParams.set("client_secret", config.metaAppSecret!);
  url.searchParams.set("redirect_uri", oauthRedirectUri());
  url.searchParams.set("code", code);
  const response = await fetch(url);
  const body = await response.json() as { access_token?: string; error?: { message?: string } };
  if (!response.ok || !body.access_token) throw new MetaError(body.error?.message ?? "Meta OAuth code exchange failed.", 502, "META_OAUTH_EXCHANGE_FAILED");
  return body.access_token;
}

async function fetchPages(userToken: string) {
  const url = new URL(`https://graph.facebook.com/${config.metaGraphVersion}/me/accounts`);
  url.searchParams.set("fields", "id,name,access_token,instagram_business_account");
  url.searchParams.set("access_token", userToken);
  url.searchParams.set("appsecret_proof", createHmac("sha256", config.metaAppSecret!).update(userToken).digest("hex"));
  const response = await fetch(url);
  const body = await response.json() as { data?: Array<{ id: string; name: string; access_token: string; instagram_business_account?: { id: string } }>; error?: { message?: string } };
  if (!response.ok || !body.data) throw new MetaError(body.error?.message ?? "Meta Pages could not be loaded.", 502, "META_PAGES_LOAD_FAILED");
  return body.data;
}

function ensureOAuthConfig() { if (!config.metaAppId || !config.metaAppSecret || !config.metaOAuthRedirectUri || !config.metaTokenEncryptionKey) throw new MetaError("Meta OAuth is not configured.", 503, "META_OAUTH_NOT_CONFIGURED"); }
function oauthRedirectUri() { return config.metaOAuthRedirectUri!; }
function hash(value: string) { return createHash("sha256").update(value).digest("hex"); }
function encrypt(value: string) { const key = Buffer.from(config.metaTokenEncryptionKey!, "hex"); const iv = randomBytes(12); const cipher = createCipheriv("aes-256-gcm", key, iv); const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]); return [iv, cipher.getAuthTag(), ciphertext].map((part) => part.toString("base64url")).join("."); }
export function decryptToken(value: string) { const [iv, tag, ciphertext] = value.split(".").map((part) => Buffer.from(part, "base64url")); const decipher = createDecipheriv("aes-256-gcm", Buffer.from(config.metaTokenEncryptionKey!, "hex"), iv); decipher.setAuthTag(tag); return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8"); }

export async function createConnection(shopId: string, input: { pageId: string; encryptedAccessToken: string; instagramAccountId?: string | null; pageName?: string }, actorId: string) {
  try {
    const result = await db.query(`insert into meta_connections (shop_id, page_id, instagram_account_id, credential_ref, encrypted_access_token, settings, created_by) values ($1, $2, $3, 'meta-oauth', $4, $5, $6) returning id, shop_id, page_id, instagram_account_id, status, settings, created_at, updated_at`, [shopId, input.pageId, input.instagramAccountId ?? null, input.encryptedAccessToken, JSON.stringify({ pageName: input.pageName }), actorId]);
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

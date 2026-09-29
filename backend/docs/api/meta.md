# Meta API

Purpose: Manage shop-scoped Meta connection metadata without exposing provider credentials.

Auth: Bearer session. Reads require `settings:read`; writes require `settings:write`.

## `GET /shops/:shopId/connections`

Request: Path `shopId` UUID.

Response: `{ "connections": [{ "id": "uuid", "page_id": "...", "status": "active", "hasCredential": true }] }`. The credential reference is never returned.

Side effects: None.

Audit/timeline: None.

Cache: Client may cache briefly; refetch after connection changes.

Errors: `SHOP_ACCESS_DENIED`, `PERMISSION_DENIED`, `VALIDATION_ERROR`.

## `GET /shops/:shopId/oauth/start`

Purpose: Start the seller's Meta OAuth flow from the Connect button.

Auth: Requires `settings:write`.

Request: Path `shopId` UUID. No token or Page credential is sent by the seller.

Response: `{ "authorizationUrl": "https://www.facebook.com/...", "expiresInSeconds": 600 }`.

Side effects: Stores a short-lived, one-time OAuth state bound to the shop and current staff user.

Audit/timeline: No connection audit until a Page is selected.

Cache: Do not cache the authorization URL.

Errors: `META_OAUTH_NOT_CONFIGURED`, `SHOP_ACCESS_DENIED`, `PERMISSION_DENIED`, `VALIDATION_ERROR`.

## `GET /oauth/callback`

Purpose: Receive Meta's OAuth authorization code, exchange it server-side, and load the Pages granted by the seller.

Auth: Meta calls this public callback with `code` and `state`; state validation binds it to the original authenticated user and shop.

Request: Meta callback query parameters `code` and `state`.

Response: `{ "shopId": "uuid", "state": "...", "pageCount": 2 }`. The frontend then asks the seller to choose a Page.

Side effects: Exchanges the code without exposing the App Secret to the browser, encrypts returned tokens, and stores the granted Page list temporarily.

Audit/timeline: No connection audit until Page selection completes.

Cache: Do not cache.

Errors: `META_OAUTH_CALLBACK_INVALID`, `META_OAUTH_DENIED`, `META_OAUTH_STATE_INVALID`, `META_OAUTH_EXCHANGE_FAILED`, `META_PAGES_LOAD_FAILED`, `META_NO_PAGES`.

## `POST /shops/:shopId/oauth/complete`

Purpose: Save the Page selected by the seller after OAuth.

Auth: Requires `settings:write` and the same user who started OAuth.

Request: `{ "state": "one-time-state", "pageId": "facebook-page-id" }`.

Response: `201` with the connection and `hasCredential: true`; tokens are never returned.

Side effects: Encrypts and stores the selected Page access token server-side and enables the connection.

Audit/timeline: Writes `meta.connection_created` with `via: oauth`; token values are never audited.

Cache: Do not cache the write response.

Errors: `META_OAUTH_SELECTION_INVALID`, `META_PAGE_NOT_GRANTED`, `META_CONNECTION_CONFLICT`, `SHOP_ACCESS_DENIED`, `PERMISSION_DENIED`, `VALIDATION_ERROR`.

## `PATCH /shops/:shopId/connections/:connectionId`

Request: `{ "status": "active|disabled|error", "reason": "optional unless disabling" }`. A 3-500 character reason is required for `disabled`.

Response: Updated connection with `hasCredential: true`.

Side effects: Enables or disables future Meta processing for the connection. Disabling does not delete credentials or historical webhook data.

Audit/timeline: Writes `meta.connection_status_updated` audit with the operator reason when disabling.

Cache: Invalidate connection reads.

Errors: `META_CONNECTION_NOT_FOUND`, `SHOP_ACCESS_DENIED`, `PERMISSION_DENIED`, `VALIDATION_ERROR`.

Provider verification and outbound Graph API workers are intentionally deferred until the Meta connection is configured. Sellers never provide API tokens; the platform requires its own Meta App ID, App Secret, redirect URI, and 32-byte encryption key in server environment variables.

## `POST /shops/:shopId/campaign-stats/import`

Purpose: Store a normalized daily Meta campaign snapshot from the provider worker or an approved manual import.

Auth: Requires `marketing:write`.

Request: `{ "connectionId": "uuid", "campaignId": "campaign-1", "campaignName": "Spring", "metricDate": "2026-09-28", "spend": 100, "impressions": 5000, "clicks": 120, "providerAttributedOrders": 4, "providerPlacedRevenue": 2400, "providerDeliveredRevenue": 1800, "attributionStatus": "known|unknown" }`.

Response: `201` with the upserted daily stats row.

Side effects: Upserts one shop/campaign/date snapshot. It never changes ad budgets or local order state.

Audit/timeline: Writes `meta.campaign_stats_imported`; raw tokens are never logged.

Cache: Invalidate campaign reports after import.

Errors: `META_CONNECTION_REQUIRED`, `SHOP_ACCESS_DENIED`, `PERMISSION_DENIED`, `VALIDATION_ERROR`.

## `GET /shops/:shopId/campaign-stats`

Purpose: Report campaign spend, provider metrics, local placed revenue, and local delivered revenue.

Auth: Requires `marketing:read`.

Request: Path `shopId` UUID. Query `from` and `to` dates (`YYYY-MM-DD`).

Response: `{ "period": { "from": "...", "to": "..." }, "campaigns": [{ "campaign_id": "campaign-1", "attribution_status": "unknown", "local": { "placed_revenue": "2400", "delivered_revenue": "1800" } }], "totals": { "spend": 100, "placedRevenue": 2400, "deliveredRevenue": 1800 }, "unknownAttribution": 1 }`.

Side effects: None. Local revenue is derived from PostgreSQL orders and never inferred from spend.

Audit/timeline: None for read-only reporting.

Cache: Client may cache briefly; refetch after imports or order status changes.

Errors: `SHOP_ACCESS_DENIED`, `PERMISSION_DENIED`, `VALIDATION_ERROR`.

## `GET /shops/:shopId/catalog-sync`

Purpose: Read the shop's Meta catalog sync configuration and last known state.

Auth: Requires `settings:read`.

Request: Path `shopId` UUID.

Response: `{ "catalogSync": { "status": "pending", "settings": { "skipUnpublished": true, "skipOutOfStock": true } } }`, or `status: "not_configured"`.

Side effects: None.

Audit/timeline: None.

Cache: Client may cache briefly; refetch after configuration or catalog changes.

Errors: `SHOP_ACCESS_DENIED`, `PERMISSION_DENIED`, `VALIDATION_ERROR`.

## `PUT /shops/:shopId/catalog-sync`

Purpose: Configure which local products are eligible for the future Meta catalog worker.

Auth: Requires `settings:write`.

Request: `{ "connectionId": "uuid", "skipUnpublished": true, "skipOutOfStock": true }`.

Response: Updated `catalogSync` state with `status: "pending"`.

Side effects: Saves sync settings and enqueues `meta.catalog.sync`. It does not call Meta or change local catalog data in the request cycle. Worker marks the sync `failed` with `META_CATALOG_PROVIDER_NOT_CONNECTED` until a real Meta catalog adapter is configured.

Audit/timeline: Writes `meta.catalog_sync_configured`; worker fallback writes `meta.catalog_not_connected`.

Cache: Invalidate catalog sync state.

Errors: `META_CONNECTION_REQUIRED`, `SHOP_ACCESS_DENIED`, `PERMISSION_DENIED`, `VALIDATION_ERROR`.

## `POST /shops/:shopId/catalog-sync/preview`

Purpose: Evaluate current products and inventory against sync settings before any provider mutation.

Auth: Requires `settings:read`.

Request: `{ "skipUnpublished": true, "skipOutOfStock": true }`.

Response: `{ "summary": { "products": 1, "variants": 1, "skippedVariants": 2 }, "products": [{ "id": "uuid", "variants": [{ "stock": 4 }] }] }`.

Side effects: None. This is a read-only preview.

Audit/timeline: None.

Cache: Do not cache for the final sync decision; inventory may change.

Errors: `SHOP_ACCESS_DENIED`, `PERMISSION_DENIED`, `VALIDATION_ERROR`.

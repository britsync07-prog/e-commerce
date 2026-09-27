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

Request: `{ "status": "active|disabled|error" }`.

Response: Updated connection with `hasCredential: true`.

Side effects: Enables or disables future Meta processing for the connection.

Audit/timeline: Writes `meta.connection_status_updated` audit.

Cache: Invalidate connection reads.

Errors: `META_CONNECTION_NOT_FOUND`, `SHOP_ACCESS_DENIED`, `PERMISSION_DENIED`, `VALIDATION_ERROR`.

Provider verification and outbound Graph API workers are intentionally deferred until the Meta connection is configured. Sellers never provide API tokens; the platform requires its own Meta App ID, App Secret, redirect URI, and 32-byte encryption key in server environment variables.

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

Side effects: Saves sync settings; it does not call Meta or change local catalog data.

Audit/timeline: Writes `meta.catalog_sync_configured` audit.

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

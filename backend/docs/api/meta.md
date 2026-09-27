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

## `POST /shops/:shopId/connections`

Request: `{ "pageId": "page-id", "instagramAccountId": "instagram-id", "credentialRef": "secret-manager/path", "settings": {} }`. At least one account ID is required. `credentialRef` is an opaque reference; raw access tokens must not be sent to this API.

Response: `201` with the connection and `hasCredential: true`; the credential reference is omitted.

Side effects: Stores connection metadata for later provider workers.

Audit/timeline: Writes `meta.connection_created` audit.

Cache: Do not cache the write response.

Errors: `META_CONNECTION_CONFLICT`, `SHOP_ACCESS_DENIED`, `PERMISSION_DENIED`, `VALIDATION_ERROR`.

## `PATCH /shops/:shopId/connections/:connectionId`

Request: `{ "status": "active|disabled|error" }`.

Response: Updated connection with `hasCredential: true`.

Side effects: Enables or disables future Meta processing for the connection.

Audit/timeline: Writes `meta.connection_status_updated` audit.

Cache: Invalidate connection reads.

Errors: `META_CONNECTION_NOT_FOUND`, `SHOP_ACCESS_DENIED`, `PERMISSION_DENIED`, `VALIDATION_ERROR`.

Provider verification and outbound Graph API calls are intentionally deferred until the Meta worker and secret-manager integration are enabled.

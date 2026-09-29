# Shops API

Base path: `/api/v1/shops`

Purpose:
- Lists shops the current user can access.
- Exposes fixed role permissions for the current shop.
- Provides foundation permission checks for dashboard modules.

Auth:
- Bearer session required.
- Permissions come from `shop_staff.role`.

## `GET /mine`

Request:
- Header `Authorization: Bearer <token>`.
- No body.

Response:

```json
{
  "shops": [
    {
      "id": "uuid",
      "display_name": "Nafis Fashion",
      "subdomain": "nafis-fashion",
      "status": "draft",
      "role": "owner"
    }
  ]
}
```

Side effects:
- None.

Audit/timeline:
- None for read.

Cache:
- Client can cache briefly.
- Refetch after team/shop changes.

Errors:
- `401 AUTH_REQUIRED`
- `401 SESSION_INVALID`

## `GET /:shopId/permissions`

Request:
- Header `Authorization: Bearer <token>`.
- Path param `shopId`: shop UUID.
- No body.

Response:

```json
{
  "role": "owner",
  "permissions": ["catalog:read", "catalog:write"],
  "roles": {
    "owner": ["..."],
    "sales": ["catalog:read"]
  }
}
```

Side effects:
- None.

Audit/timeline:
- None for read.

Cache:
- Client can cache per session.
- Refetch after team/role changes.

Errors:
- `400 VALIDATION_ERROR`
- `401 AUTH_REQUIRED`
- `401 SESSION_INVALID`
- `403 SHOP_ACCESS_DENIED`
- `403 PERMISSION_DENIED`

## `GET /:shopId/team`

Purpose:
- List shop team members and fixed role permission map.

Auth/permission:
- Bearer token required.
- Requires `team:read`.

Request:
- Path `shopId`: shop UUID.

Response:
- `200`

```json
{
  "team": [
    {
      "user_id": "uuid",
      "role": "owner",
      "status": "active",
      "name": "Owner Name",
      "email": "owner@example.com"
    }
  ],
  "roles": {
    "sales": ["catalog:read", "orders:write"]
  }
}
```

Side effects:
- None.

Audit/timeline:
- None for read.

Cache:
- Client can cache briefly.
- Refetch after team changes.

Errors:
- `400 VALIDATION_ERROR`
- `401 AUTH_REQUIRED`
- `403 SHOP_ACCESS_DENIED`
- `403 PERMISSION_DENIED`

## `GET /:shopId/billing`

Purpose: Read the shop's billing plan, current usage, and issued invoices.

Auth/permission: Bearer token required; requires `settings:read`.

Request: Path `shopId` UUID. No billing credentials or payment method are accepted by this endpoint.

Response: `{ "billing": { "code": "starter", "status": "trialing", "limits": {} }, "usage": { "staff": 1, "products": 3, "orders_this_month": 4, "storage_bytes": 1200 }, "invoices": [] }`.

Side effects: Creates a default Starter billing record only when a shop has no billing record. It does not charge money.

Audit/timeline: None for read-only usage; billing provider mutations are not connected.

Cache: Client may cache briefly; refetch after team, catalog, order, or asset changes.

Errors: `SHOP_ACCESS_DENIED`, `PERMISSION_DENIED`, `VALIDATION_ERROR`.

## `PATCH /:shopId/settings`

Purpose: update shop identity, policies, AI mode, and storefront presentation settings.

Request additions:

```json
{
  "storefront": {
    "templateId": "fashion-editorial",
    "theme": { "accent": "#111827", "background": "#ffffff", "text": "#111827" },
    "banners": [{ "title": "New arrivals", "subtitle": "Fast COD delivery" }],
    "sections": ["hero", "products", "policies"],
    "seo": { "title": "Nafis Fashion", "description": "Online shop" },
    "policies": { "shipping": "Ships inside Bangladesh.", "returns": "Returns accepted within policy window." }
  }
}
```

Side effects: updates selected production template/config and writes `shop.settings_updated` audit data. Existing settings are preserved when only part of storefront config is sent.

Errors: `400 VALIDATION_ERROR`, `401 AUTH_REQUIRED`, `403 SHOP_ACCESS_DENIED`, `403 PERMISSION_DENIED`, `404 SHOP_NOT_FOUND`, `404 TEMPLATE_NOT_FOUND`.

## `POST /:shopId/publish`

Purpose: publish the current storefront draft as the buyer-facing snapshot.

Auth/permission: bearer token required; requires `settings:write`.

Rules: requires a production template plus SEO title/description and policy defaults.

Response: `{ "publish": { "status": "launched", "publish_version": 2, "domain_status": "ready" } }`.

Side effects: launches the shop if needed, increments `publish_version`, stores `published_storefront_config`, clears domain error, and writes `shop.storefront_published`.

Errors: `PUBLISH_TEMPLATE_REQUIRED`, `PUBLISH_SEO_REQUIRED`, `PUBLISH_POLICY_REQUIRED`, `SHOP_ACCESS_DENIED`, `PERMISSION_DENIED`, `VALIDATION_ERROR`.

## `POST /:shopId/domain/retry`

Purpose: retry the shop subdomain/domain status check after a previous publish/domain failure.

Auth/permission: bearer token required; requires `settings:write`.

Response: `{ "domain": { "subdomain": "nafis-fashion", "domain_status": "ready", "domain_last_checked_at": "..." } }`.

Side effects: updates domain status/check time and writes `shop.domain_retry`. Real external DNS provider verification is not connected yet.

Errors: `SHOP_NOT_FOUND`, `SHOP_ACCESS_DENIED`, `PERMISSION_DENIED`, `VALIDATION_ERROR`.

## `POST /:shopId/team`

Purpose:
- Add an already registered user to a shop with a fixed non-owner role.

Auth/permission:
- Bearer token required.
- Requires `team:write`.

Request:

```json
{
  "email": "staff@example.com",
  "role": "sales"
}
```

Response:
- `201`

```json
{
  "member": {
    "user_id": "uuid",
    "role": "sales",
    "status": "active",
    "email": "staff@example.com"
  }
}
```

Side effects:
- Inserts or reactivates `shop_staff`.
- Writes audit action `shop.team_member_added`.

Audit/timeline:
- Audit target type: `user`.

Cache:
- Do not cache write response.
- Refetch permissions and team lists.

Errors:
- `400 VALIDATION_ERROR`
- `401 AUTH_REQUIRED`
- `403 SHOP_ACCESS_DENIED`
- `403 PERMISSION_DENIED`
- `404 USER_NOT_FOUND`

## `PATCH /:shopId/team/:userId`

Purpose:
- Change a team member role or active/disabled status.
- Blocks owner self-removal and owner role changes until transfer flow exists.

Auth/permission:
- Bearer token required.
- Requires `team:write`.

Request:

```json
{
  "role": "packer",
  "status": "active"
}
```

Response:
- `200`

```json
{
  "member": {
    "user_id": "uuid",
    "role": "packer",
    "status": "active"
  }
}
```

Side effects:
- Updates `shop_staff`.
- Writes audit action `shop.team_member_updated`.

Audit/timeline:
- Audit target type: `user`.

Cache:
- Do not cache write response.
- Refetch permissions and team lists.

Errors:
- `400 VALIDATION_ERROR`
- `401 AUTH_REQUIRED`
- `403 SHOP_ACCESS_DENIED`
- `403 PERMISSION_DENIED`
- `404 TEAM_MEMBER_NOT_FOUND`
- `409 OWNER_SELF_REMOVE_BLOCKED`
- `409 OWNER_TRANSFER_REQUIRED`

## `POST /:shopId/team/transfer-owner`

Purpose: Transfer shop ownership to another active team member through an explicit confirmation flow.

Auth/permission: Bearer token required; only the current owner may transfer ownership.

Request: `{ "targetUserId": "uuid", "confirmation": "TRANSFER_OWNERSHIP", "reason": "Owner is leaving the business" }`.

Response: Returns the previous owner id and the new owner summary.

Side effects: Atomically changes the current owner to `admin`, changes the target to `owner`, and preserves both team memberships.

Audit/timeline: Writes immutable `shop.owner_transferred` audit metadata with actor, target, and reason.

Cache: Invalidate team and permission reads for every team member.

Errors: `400 VALIDATION_ERROR`, `403 OWNER_TRANSFER_REQUIRED`, `403 SHOP_ACCESS_DENIED`, `403 PERMISSION_DENIED`, `409 OWNER_TRANSFER_TARGET_INVALID`.

## `GET /:shopId/settings`

Purpose:
- Read shop settings used by dashboard, storefront, checkout, AI, and policies.

Auth/permission:
- Bearer token required.
- Requires `settings:read`.

Request:
- Path `shopId`: shop UUID.

Response:
- `200`

```json
{
  "settings": {
    "id": "uuid",
    "display_name": "Nafis Fashion",
    "subdomain": "nafis-fashion",
    "currency": "BDT",
    "policy_defaults": {
      "deliveryCharge": 80,
      "returnDays": 3,
      "codAllowed": true
    },
    "ai_mode": "suggest"
  }
}
```

Side effects:
- None.

Audit/timeline:
- None for read.

Cache:
- Client-side cache is allowed for settings reads.
- Refetch after settings changes.

Errors:
- `400 VALIDATION_ERROR`
- `401 AUTH_REQUIRED`
- `403 SHOP_ACCESS_DENIED`
- `403 PERMISSION_DENIED`
- `404 SHOP_NOT_FOUND`

## `PATCH /:shopId/settings`

Purpose:
- Update safe shop settings after launch without changing subdomain/domain routing.

Auth/permission:
- Bearer token required.
- Requires `settings:write`.

Request:

```json
{
  "displayName": "Nafis Fashion",
  "policyDefaults": {
    "deliveryCharge": 80,
    "returnDays": 7,
    "codAllowed": true
  },
  "aiMode": "suggest"
}
```

Response:
- `200`
- Same shape as settings read.

Side effects:
- Updates `shops`.
- Writes audit action `shop.settings_updated`.

Audit/timeline:
- Audit target type: `shop`.

Cache:
- Do not cache write response.
- Invalidate dashboard settings, storefront shop reads, checkout policy reads, and AI policy context.

Errors:
- `400 VALIDATION_ERROR`
- `401 AUTH_REQUIRED`
- `403 SHOP_ACCESS_DENIED`
- `403 PERMISSION_DENIED`
- `404 SHOP_NOT_FOUND`

## `GET /:shopId/audit`

Purpose:
- Read immutable audit events for shop security/history.

Auth/permission:
- Bearer token required.
- Requires `settings:read`.

Request:
- Path `shopId`: shop UUID.

Response:
- `200`

```json
{
  "audit": [
    {
      "id": "uuid",
      "actor_type": "staff",
      "actor_id": "uuid",
      "action": "shop.settings_updated",
      "target_type": "shop",
      "target_id": "uuid",
      "metadata": ["displayName"],
      "created_at": "2026-09-27T00:00:00.000Z"
    }
  ]
}
```

Side effects:
- None.

Audit/timeline:
- Audit log is append-only through backend writes.
- This endpoint does not create or mutate audit rows.

Cache:
- Client can cache briefly.
- Refetch after sensitive actions.

Errors:
- `400 VALIDATION_ERROR`
- `401 AUTH_REQUIRED`
- `403 SHOP_ACCESS_DENIED`
- `403 PERMISSION_DENIED`

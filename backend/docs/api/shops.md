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


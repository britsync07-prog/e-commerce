# Legal API

Base path: `/api/v1/legal`

Purpose:
- Publish shop legal policies.
- Record cookie consent for public storefront visitors.
- Accept and manage privacy requests.

Auth:
- Public storefront endpoints do not require auth.
- Shop policy endpoints require `legal:read` or `legal:write`.
- Privacy request admin endpoints require `privacy:read` or `privacy:write`.

## `GET /public/:subdomain/policies`

Request:
- Path: `subdomain`

Response:
- `200`

```json
{
  "shop": { "id": "uuid", "displayName": "Shop", "subdomain": "shop" },
  "policies": [
    {
      "id": "uuid",
      "policy_type": "privacy_policy",
      "title": "Privacy Policy",
      "body": "Policy text",
      "version": 1,
      "published_at": "2026-10-01T00:00:00.000Z"
    }
  ]
}
```

Side effects:
- None.

Audit/timeline:
- None for public reads.

Cache:
- Public policies may be cached briefly by storefront/CDN.

Errors:
- `404 SHOP_NOT_FOUND`

## `POST /public/:subdomain/cookie-consents`

Request:

```json
{
  "visitorId": "browser-generated-id",
  "categories": {
    "necessary": true,
    "analytics": true,
    "marketing": false,
    "preferences": true
  },
  "policyVersion": 1
}
```

Response:
- `201`

```json
{
  "consent": {
    "id": "uuid",
    "consent_id": "uuid",
    "categories": { "necessary": true, "analytics": true, "marketing": false, "preferences": true },
    "policy_version": 1,
    "created_at": "2026-10-01T00:00:00.000Z"
  }
}
```

Side effects:
- Inserts `cookie_consents`.
- Stores hashed IP/user-agent proof, not raw IP/user-agent.

Audit/timeline:
- None; consent row is the legal proof.

Cache:
- Do not cache.

Errors:
- `400 VALIDATION_ERROR`
- `404 SHOP_NOT_FOUND`
- `409` if the generated consent id collides

## `POST /public/:subdomain/privacy-requests`

Request:

```json
{
  "requestType": "delete",
  "requesterName": "Buyer",
  "requesterEmail": "buyer@example.com",
  "requesterPhone": "+8801700000000",
  "details": "Please delete my account data."
}
```

Response:
- `201`

```json
{
  "request": {
    "id": "uuid",
    "request_type": "delete",
    "status": "open",
    "created_at": "2026-10-01T00:00:00.000Z"
  }
}
```

Side effects:
- Inserts `privacy_requests`.
- Links to an existing customer when phone matches.

Audit/timeline:
- Staff review/update writes audit later.

Cache:
- Do not cache.

Errors:
- `400 VALIDATION_ERROR`
- `404 SHOP_NOT_FOUND`

## `GET /shops/:shopId/policies`

Request:
- Path: `shopId`

Response:
- `200`

```json
{
  "policies": [
    {
      "id": "uuid",
      "policy_type": "privacy_policy",
      "title": "Privacy Policy",
      "version": 1,
      "status": "published"
    }
  ]
}
```

Side effects:
- None.

Audit/timeline:
- None for reads.

Cache:
- Do not cache staff views.

Errors:
- `401 AUTH_REQUIRED`
- `403 PERMISSION_DENIED`

## `PUT /shops/:shopId/policies/:policyType`

Request:

```json
{
  "title": "Privacy Policy",
  "body": "Full legal policy text...",
  "publish": true
}
```

Response:
- `201`

```json
{
  "policy": {
    "id": "uuid",
    "policy_type": "privacy_policy",
    "version": 2,
    "status": "published"
  }
}
```

Side effects:
- Inserts a new policy version.
- Publishing archives the previous published version for the same policy type.

Audit/timeline:
- Writes `legal.policy_drafted` or `legal.policy_published` to `audit_events`.

Cache:
- Purge or expire public policy cache after publish.

Errors:
- `400 VALIDATION_ERROR`
- `401 AUTH_REQUIRED`
- `403 PERMISSION_DENIED`

## `GET /shops/:shopId/privacy-requests`

Request:
- Optional query: `status`, `limit`

Response:
- `200`

```json
{
  "requests": [
    {
      "id": "uuid",
      "request_type": "delete",
      "status": "open",
      "requester_email": "buyer@example.com"
    }
  ]
}
```

Side effects:
- None.

Audit/timeline:
- None for reads.

Cache:
- Do not cache.

Errors:
- `401 AUTH_REQUIRED`
- `403 PERMISSION_DENIED`

## `PATCH /shops/:shopId/privacy-requests/:requestId`

Request:

```json
{
  "status": "completed",
  "resolutionNote": "Verified and exported/deleted according to policy."
}
```

Response:
- `200`

```json
{
  "request": {
    "id": "uuid",
    "status": "completed",
    "resolution_note": "Verified and exported/deleted according to policy."
  }
}
```

Side effects:
- Updates request review/completion fields.

Audit/timeline:
- Writes `privacy_request.updated` to `audit_events`.

Cache:
- Do not cache.

Errors:
- `400 VALIDATION_ERROR`
- `401 AUTH_REQUIRED`
- `403 PERMISSION_DENIED`
- `404 PRIVACY_REQUEST_NOT_FOUND`

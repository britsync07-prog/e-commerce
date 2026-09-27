# Marketing API

Purpose: Manage tenant-scoped coupons and saved customer segments. Campaign sending is not enabled yet.

Auth: Bearer session. Reads require `marketing:read`; coupon/segment writes require `marketing:write`.

## `GET /shops/:shopId/coupons`

Request: Path `shopId` UUID. Optional `status` (`active`, `disabled`) and `limit` (1-100).

Response: `{ "coupons": [{ "code": "WELCOME10", "discount_type": "percent", "discount_value": "10.00", "usage_limit": 100, "usage_count": 2, "status": "active" }] }`.

Side effects: None.

Audit/timeline: None.

Cache: Client may cache reads briefly; refetch after coupon writes.

Errors: `SHOP_ACCESS_DENIED`, `PERMISSION_DENIED`, `VALIDATION_ERROR`.

## `POST /shops/:shopId/coupons`

Request: `{ "code": "WELCOME10", "discountType": "percent|fixed", "discountValue": 10, "minOrderTotal": 500, "usageLimit": 100, "expiresAt": "2026-12-31T23:59:59Z" }`. Percent values cannot exceed 100.

Response: `201` with `{ "coupon": { ... } }`.

Side effects: Creates a coupon. Checkout validates status, expiry, minimum, and usage limit inside the order transaction.

Audit/timeline: Writes `coupon.created` audit.

Cache: Do not cache the write response.

Errors: `COUPON_CONFLICT`, `SHOP_ACCESS_DENIED`, `PERMISSION_DENIED`, `VALIDATION_ERROR`.

## `PATCH /shops/:shopId/coupons/:couponId`

Request: `{ "status": "active|disabled" }`.

Response: `200` with `{ "coupon": { ... } }`.

Side effects: Enables or disables future checkout use. Existing redemptions are preserved.

Audit/timeline: Writes `coupon.status_updated` audit.

Cache: Invalidate coupon reads and checkout configuration.

Errors: `COUPON_NOT_FOUND`, `SHOP_ACCESS_DENIED`, `PERMISSION_DENIED`, `VALIDATION_ERROR`.

## `GET /shops/:shopId/segments`

Request: Path `shopId` UUID.

Response: `{ "segments": [{ "id": "uuid", "name": "VIP", "definition": { "minOrders": 2 } }] }`.

Side effects: None.

Audit/timeline: None.

Cache: Client may cache reads briefly.

Errors: `SHOP_ACCESS_DENIED`, `PERMISSION_DENIED`, `VALIDATION_ERROR`.

## `POST /shops/:shopId/segments`

Request: `{ "name": "VIP", "definition": { "consentStatus": "opted_in", "tag": "vip", "minOrders": 2, "minLifetimeValue": 1000 } }`.

Response: `201` with `{ "segment": { ... } }`.

Side effects: Saves the segment definition. Segment definitions are filters, not copied customer lists.

Audit/timeline: Writes `segment.created` audit.

Cache: Do not cache the write response.

Errors: `SEGMENT_CONFLICT`, `SHOP_ACCESS_DENIED`, `PERMISSION_DENIED`, `VALIDATION_ERROR`.

## `POST /shops/:shopId/segments/:segmentId/preview`

Purpose: Evaluate a saved segment against current customer data before any future campaign.

Request: Path `shopId` and `segmentId` UUIDs.

Response: `{ "segment": { ... }, "count": 2, "customers": [{ "id": "uuid", "consent_status": "opted_in", "order_count": 3, "lifetime_value": "1500.00" }] }`.

Side effects: None. `opted_out` customers are always excluded.

Audit/timeline: None.

Cache: No server cache; preview should be rerun before campaign approval.

Errors: `SEGMENT_NOT_FOUND`, `SHOP_ACCESS_DENIED`, `PERMISSION_DENIED`, `VALIDATION_ERROR`.

## Broadcast safety

### `GET /shops/:shopId/broadcasts`

Purpose: List broadcast drafts and approvals.

Auth: Requires `marketing:read`.

Request: Path `shopId` UUID.

Response: `{ "broadcasts": [{ "id": "uuid", "status": "draft", "channel": "messenger", "rate_limit_per_minute": 20, "audience_count": null }] }`.

Side effects: None.

Audit/timeline: None.

Cache: Client may cache reads briefly; refetch after preview or approval.

Errors: `SHOP_ACCESS_DENIED`, `PERMISSION_DENIED`, `VALIDATION_ERROR`.

### `POST /shops/:shopId/broadcasts`

Purpose: Create a bulk-message draft tied to a saved segment.

Auth: Requires `marketing:write`.

Request: `{ "name": "VIP update", "segmentId": "uuid", "channel": "messenger", "body": "New stock is available", "rateLimitPerMinute": 20 }`. Rate limit is restricted to 1-100 messages per minute.

Response: `201` with `{ "broadcast": { "status": "draft", ... } }`.

Side effects: Stores a draft only. No external message is sent.

Audit/timeline: Writes `broadcast.created` audit.

Cache: Do not cache the write response.

Errors: `SEGMENT_NOT_FOUND`, `SHOP_ACCESS_DENIED`, `PERMISSION_DENIED`, `VALIDATION_ERROR`.

### `POST /shops/:shopId/broadcasts/:broadcastId/preview`

Purpose: Re-evaluate the current audience before approval.

Auth: Requires `marketing:read`.

Request: Path `shopId` and `broadcastId` UUIDs.

Response: `{ "broadcast": { ... }, "audienceCount": 12, "customers": [{ "id": "uuid", "consent_status": "opted_in" }] }`.

Side effects: None. Saved segment filters are evaluated against current data; opted-out customers are always excluded.

Audit/timeline: None.

Cache: No server cache. Preview immediately before approval.

Errors: `BROADCAST_NOT_FOUND`, `SHOP_ACCESS_DENIED`, `PERMISSION_DENIED`, `VALIDATION_ERROR`.

### `POST /shops/:shopId/broadcasts/:broadcastId/approve`

Purpose: Explicitly approve a bulk-message draft after reviewing its audience.

Auth: Requires `marketing:write`.

Request: `{ "reason": "Approved for the weekly VIP update" }`. Reason is required.

Response: `{ "broadcast": { "status": "approved", "audience_count": 12 }, "audienceCount": 12, "customers": [...] }`.

Side effects: Rechecks the consent-safe audience inside a transaction, rejects empty audiences, stores approval actor/reason, and preserves the configured rate limit. There is intentionally no send endpoint yet.

Audit/timeline: Writes `broadcast.approved` audit with audience count and rate limit.

Cache: No cache. A future sender must recheck consent and use the stored rate limit immediately before sending.

Errors: `BROADCAST_NOT_FOUND`, `BROADCAST_NOT_DRAFT`, `BROADCAST_EMPTY_AUDIENCE`, `SHOP_ACCESS_DENIED`, `PERMISSION_DENIED`, `VALIDATION_ERROR`.

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

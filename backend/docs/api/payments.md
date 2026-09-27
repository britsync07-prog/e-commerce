# Payments API

Purpose: Track COD/manual payment records, payment event history, proof assets, audited marked-paid actions, and refunds per shop.

Auth: Staff session via `Authorization: Bearer <token>`. Read endpoints require `payments:read`; write endpoints require `payments:write`.

## `GET /shops/:shopId/payments`

Request: Path `shopId` UUID. Optional query `status` (`pending`, `marked_paid`, `refunded`, `failed`) and `limit` (1-100, default 50).

Response: `{ "payments": [{ "id": "uuid", "order_id": "uuid", "method": "cod", "status": "marked_paid", "amount": "500.00", "currency": "BDT", "proof_asset_id": "uuid|null" }] }`.

Side effects: None.

Audit/timeline: None.

Cache: No server cache. Client may cache reads briefly and must refetch after payment writes.

Errors: `SHOP_ACCESS_DENIED`, `PERMISSION_DENIED`, `VALIDATION_ERROR`.

## `GET /shops/:shopId/payments/:paymentId`

Request: Path `shopId` and `paymentId` UUIDs.

Response: `{ "payment": { ... }, "events": [{ "event_type": "marked_paid", "amount": "500.00", "note": "Cash received" }] }`.

Side effects: None.

Audit/timeline: None.

Cache: No server cache. Client may cache reads briefly.

Errors: `PAYMENT_NOT_FOUND`, `SHOP_ACCESS_DENIED`, `PERMISSION_DENIED`, `VALIDATION_ERROR`.

## `POST /shops/:shopId/orders/:orderId/payments/manual`

Request: Path `shopId` and `orderId` UUIDs. JSON body `{ "method": "cod|advance|manual", "amount": 500, "proofAssetId": "uuid", "note": "Cash received" }`. `note` is required; `amount` defaults to the order total. `proofAssetId` must be an asset owned by the same shop.

Response: `{ "payment": { "status": "marked_paid", "amount": "500.00", ... }, "events": [...] }`.

Side effects: Creates a payment record and immutable payment events. Does not claim bank confirmation. Writes `payment.marked_paid` audit metadata with `bankConfirmed: false` and adds an order timeline event.

Audit/timeline: Writes payment audit and `payment_marked_paid` order timeline event.

Cache: No cache. Client must refetch order/payment reads after success.

Errors: `ORDER_NOT_FOUND`, `ORDER_NOT_PAYABLE`, `PAYMENT_EXCEEDS_TOTAL`, `PROOF_ASSET_NOT_FOUND`, `SHOP_ACCESS_DENIED`, `PERMISSION_DENIED`, `VALIDATION_ERROR`.

## `POST /shops/:shopId/payments/:paymentId/refund`

Request: Path `shopId` and `paymentId` UUIDs. JSON body `{ "note": "Customer cancellation" }` or `{ "amount": 500, "note": "Customer cancellation" }`. Full refunds only; `note` is required.

Response: `{ "payment": { "status": "refunded", ... }, "events": [...] }`.

Side effects: Appends a refund event, marks the payment refunded, preserves all prior payment events, writes audit, and adds an order timeline event.

Audit/timeline: Writes `payment.refunded` audit and `payment_refunded` order timeline event.

Cache: No cache. Client must refetch after success.

Errors: `PAYMENT_NOT_FOUND`, `PAYMENT_NOT_REFUNDABLE`, `REFUND_EXCEEDS_PAYMENT`, `PARTIAL_REFUND_UNSUPPORTED`, `SHOP_ACCESS_DENIED`, `PERMISSION_DENIED`, `VALIDATION_ERROR`.

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

## `GET /shops/:shopId/cod-settlements`

Purpose: List courier COD settlement statements and unmatched-row counts.

Auth: Requires `payments:read`.

Request: Path `shopId` UUID. Optional `limit` query, 1-100.

Response: `{ "settlements": [{ "id": "uuid", "statement_ref": "courier-001", "status": "issue", "row_count": 3, "unmatched_count": 1 }] }`.

Side effects: None.

Audit/timeline: None.

Cache: No server cache; refetch after import.

Errors: `SHOP_ACCESS_DENIED`, `PERMISSION_DENIED`, `VALIDATION_ERROR`.

## `POST /shops/:shopId/cod-settlements`

Purpose: Import a courier cash statement and match each row by shop-scoped `orderId` or shipment `trackingNumber`.

Auth: Requires `payments:write`.

Request: `{ "statementRef": "courier-001", "courierName": "Courier", "statementDate": "2026-09-28", "collectedAmount": 500, "fee": 20, "rows": [{ "externalRef": "row-1", "trackingNumber": "TRK-1", "amount": 500 }] }`.

Response: `{ "settlement": { "status": "matched|issue", ... }, "rows": [{ "status": "matched|unmatched", "issue": "ORDER_NOT_MATCHED|null" }] }`.

Side effects: Creates a settlement statement and rows. Every unmatched row is retained with an explicit issue; the settlement status becomes `issue` until reviewed. Duplicate statement references are rejected.

Audit/timeline: Writes `payment.cod_settlement_imported` audit metadata with row and unmatched counts. Import does not change order payment status.

Cache: No cache. Client must refetch settlement and payment reads.

Errors: `SETTLEMENT_CONFLICT`, `SHOP_ACCESS_DENIED`, `PERMISSION_DENIED`, `VALIDATION_ERROR`.

## `GET /shops/:shopId/cod-settlements/:settlementId`

Purpose: Read a settlement and every matched/unmatched row.

Auth: Requires `payments:read`.

Request: Path `shopId` and `settlementId` UUIDs.

Response: `{ "settlement": { ... }, "rows": [{ "external_ref": "row-1", "status": "unmatched", "issue": "ORDER_NOT_MATCHED" }] }`.

Side effects: None.

Audit/timeline: None.

Cache: No server cache.

Errors: `SETTLEMENT_NOT_FOUND`, `SHOP_ACCESS_DENIED`, `PERMISSION_DENIED`, `VALIDATION_ERROR`.

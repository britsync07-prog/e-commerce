# Customers API

Purpose: Tenant-scoped customer profiles built from checkout and inbox data, with addresses, tags, unified activity timeline, and consent state.

Auth: Bearer session. Reads require `customers:read`; consent and tag writes require `customers:write`.

## `GET /shops/:shopId/customers`

Request: Path `shopId` UUID. Optional query `search`, `consentStatus` (`unknown`, `opted_in`, `opted_out`), and `limit` (1-100, default 50).

Response: `{ "customers": [{ "id": "uuid", "name": "Buyer", "phone": "+880...", "consent_status": "unknown", "order_count": 2, "lifetime_value": "1000.00", "tag_count": 1 }] }`.

Side effects: None.

Audit/timeline: None.

Cache: Client may cache short dashboard reads. Refetch after consent/tag writes or new orders/messages.

Errors: `SHOP_ACCESS_DENIED`, `PERMISSION_DENIED`, `VALIDATION_ERROR`.

## `GET /shops/:shopId/customers/:customerId`

Purpose: Read one customer, addresses, tags, and a unified timeline of orders, payments, messages, and shipments.

Request: Path `shopId` and `customerId` UUIDs.

Response: `{ "customer": { ... }, "addresses": [], "tags": [], "timeline": [{ "type": "order|payment|message|shipment", "created_at": "..." }] }`.

Side effects: None.

Audit/timeline: Read-only; no audit row is created.

Cache: Client may cache briefly. Refetch after any customer/order/inbox/payment/delivery mutation.

Errors: `CUSTOMER_NOT_FOUND`, `SHOP_ACCESS_DENIED`, `PERMISSION_DENIED`, `VALIDATION_ERROR`.

## `POST /shops/:shopId/customers/merge-preview`

Purpose: Compare two active customers before a merge.

Auth: Requires `customers:read`.

Request: `{ "sourceCustomerId": "uuid", "targetCustomerId": "uuid" }`.

Response: Includes both profiles, order/address/tag impact counts, and consent warnings. No records are changed.

Side effects: None.

Audit/timeline: None.

Cache: No server cache; preview immediately before applying.

Errors: `CUSTOMER_NOT_FOUND`, `CUSTOMER_NOT_ACTIVE`, `MERGE_SAME_CUSTOMER`, `SHOP_ACCESS_DENIED`, `PERMISSION_DENIED`, `VALIDATION_ERROR`.

## `POST /shops/:shopId/customers/merge`

Purpose: Apply an explicitly confirmed customer merge without deleting history.

Auth: Requires `customers:write`.

Request: `{ "sourceCustomerId": "uuid", "targetCustomerId": "uuid", "confirm": true, "reason": "Duplicate checkout profile confirmed" }`.

Response: The surviving target customer detail with moved timeline data.

Side effects: Moves source orders, addresses, and tags to the target in one transaction; marks the source `merged` with `merged_into_customer_id`; preserves the source row; and inherits `opted_out` consent onto the target when applicable.

Audit/timeline: Writes `customer.merge_completed` audit with source, target, and reason.

Cache: Invalidate both customer records, segment previews, and campaign audience previews.

Errors: `CUSTOMER_NOT_FOUND`, `CUSTOMER_NOT_ACTIVE`, `MERGE_SAME_CUSTOMER`, `SHOP_ACCESS_DENIED`, `PERMISSION_DENIED`, `VALIDATION_ERROR`.

## `PATCH /shops/:shopId/customers/:customerId/consent`

Purpose: Set customer marketing consent or opt-out state.

Request: `{ "status": "unknown|opted_in|opted_out", "reason": "Buyer requested no promotional messages" }`. A reason is required for every change.

Response: Same customer detail response.

Side effects: Updates consent state and timestamp. Campaign implementations must reject `opted_out` customers.

Audit/timeline: Writes `customer.consent_updated` audit metadata with status and reason.

Cache: No server cache. Invalidate customer reads and campaign audience caches.

Errors: `CUSTOMER_NOT_FOUND`, `SHOP_ACCESS_DENIED`, `PERMISSION_DENIED`, `VALIDATION_ERROR`.

## `POST /shops/:shopId/customers/:customerId/tags`

Purpose: Add a shop-scoped tag to a customer.

Request: `{ "name": "vip" }`.

Response: Same customer detail response.

Side effects: Creates the tag if needed, links it idempotently, and writes `customer.tag_added` audit.

Audit/timeline: Writes an audit row; the tag appears in the customer profile.

Cache: No server cache. Invalidate customer reads.

Errors: `CUSTOMER_NOT_FOUND`, `SHOP_ACCESS_DENIED`, `PERMISSION_DENIED`, `VALIDATION_ERROR`.

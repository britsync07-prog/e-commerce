# Orders API

Base path: `/api/v1/orders`

Purpose:
- Accepts public storefront COD checkout.
- Creates confirmed orders with product/price snapshots.
- Reserves stock by writing negative inventory ledger rows.
- Serializes stock reservation per variant inside the database transaction.
- Lets buyer track only with order ID plus phone.

Auth:
- Storefront checkout is public.
- Tracking is public but requires order ID and matching phone.
- Dashboard order APIs require staff session plus shop permission.

## `POST /checkout`

Optional header: `Idempotency-Key: checkout-unique-key`. Repeating the same key with the same request returns the original order. Reusing a key with a different request returns `409 IDEMPOTENCY_KEY_REUSED`.

Request:

```json
{
  "subdomain": "nafis-fashion",
  "customer": {
    "name": "Buyer Name",
    "phone": "+8801700000000",
    "address": "House 1, Road 2, Dhaka",
    "city": "Dhaka",
    "area": "Mirpur"
  },
  "items": [
    {
      "variantId": "uuid",
      "quantity": 1
    }
  ],
  "paymentMethod": "cod",
  "couponCode": "WELCOME10"
}
```

Response:
- `201`

```json
{
  "order": {
    "id": "uuid",
    "status": "confirmed",
    "currency": "BDT",
    "subtotal": "1200.00",
    "delivery_charge": "80.00",
    "total": "1280.00"
  },
  "items": [
    {
      "variant_id": "uuid",
      "quantity": 1,
      "product_snapshot": {
        "productName": "Black Panjabi",
        "unitPrice": 1200,
        "currency": "BDT"
      }
    }
  ],
  "timeline": [
    {
      "status": "confirmed",
      "note": "Storefront checkout submitted"
    }
  ]
}
```

Side effects:
- Creates or updates customer by shop phone.
- Stores customer address.
- Creates `orders` and `order_items`.
- Writes `inventory_ledger` with `order_confirmed`.
- Writes `order_timeline`.
- Writes `audit_events`.

Audit/timeline:
- Audit: `order.confirmed`.
- Timeline: `confirmed`.

Cache:
- Do not cache checkout response.
- Invalidate product/storefront stock reads after success.

Errors:
- `400 VALIDATION_ERROR`
- `404 SHOP_NOT_FOUND`
- `404 VARIANT_NOT_FOUND`
- `404 ORDER_NOT_FOUND`
- `409 COD_NOT_ALLOWED`
- `409 STOCK_UNAVAILABLE`
- `409 IDEMPOTENCY_IN_PROGRESS`
- `409 IDEMPOTENCY_KEY_REUSED`

Concurrency: simultaneous checkouts for the same final stock are serialized; one succeeds and the other receives `409 STOCK_UNAVAILABLE`.

## `GET /track`

Request:
- Query `orderId`: order UUID.
- Query `phone`: buyer phone.
- No body.

Response:
- Same shape as checkout response.

Side effects:
- None.

Audit/timeline:
- None for buyer read.

Cache:
- Do not cache private buyer order data.

Errors:
- `400 VALIDATION_ERROR`
- `404 ORDER_NOT_FOUND`

## `GET /shops/:shopId/orders`

Purpose:
- Staff dashboard order list.
- Supports status filtering for operations queues.

Auth/permission:
- Bearer token required.
- Requires `orders:read` on `shopId`.

Request:
- Path `shopId`: shop UUID.
- Query `status`: optional `new`, `confirmed`, `packed`, `shipped`, `delivered`, `cancelled`, `returned`.
- Query `limit`: optional number from `1` to `100`, default `50`.

Response:
- `200`

```json
{
  "orders": [
    {
      "id": "uuid",
      "shop_id": "uuid",
      "status": "confirmed",
      "currency": "BDT",
      "subtotal": "1000.00",
      "delivery_charge": "0.00",
      "total": "1000.00",
      "payment_method": "cod",
      "buyer_snapshot": {
        "name": "Buyer Name",
        "phone": "+8801700000000"
      },
      "item_count": 2
    }
  ]
}
```

Side effects:
- None.

Audit/timeline:
- None for reads.

Cache:
- Client-side cache is allowed for short dashboard reads.
- Server must not trust cached data for status or stock writes.

Errors:
- `400 VALIDATION_ERROR`
- `401 AUTH_REQUIRED`
- `403 PERMISSION_DENIED`

## `GET /shops/:shopId/orders/:orderId`

Purpose:
- Staff order detail with items and full timeline.

Auth/permission:
- Bearer token required.
- Requires `orders:read` on `shopId`.

Request:
- Path `shopId`: shop UUID.
- Path `orderId`: order UUID.

Response:
- Same order/items/timeline shape as checkout, with staff timeline actor fields.

Side effects:
- None.

Audit/timeline:
- None for reads.

Cache:
- Client-side cache is allowed briefly.
- Refresh after any order status update.

Errors:
- `400 VALIDATION_ERROR`
- `401 AUTH_REQUIRED`
- `403 PERMISSION_DENIED`
- `404 ORDER_NOT_FOUND`

## `PATCH /shops/:shopId/orders/:orderId/status`

Purpose:
- Staff status move for the order pipeline.
- Allowed moves: `new -> confirmed -> packed -> shipped -> delivered`, with `cancelled` before shipping and `returned` after shipping/delivery.

Auth/permission:
- Bearer token required.
- Requires `orders:write` on `shopId`.

Request:

```json
{
  "status": "packed",
  "reason": "Optional note; required for cancelled or returned"
}
```

Response:
- `200`
- Same shape as staff order detail.

Side effects:
- Updates order status.
- Writes `order_timeline`.
- Writes `audit_events` action `order.status_updated`.
- Restores inventory with `order_cancelled` or `order_returned` ledger rows when moving to `cancelled` or `returned`.

Audit/timeline:
- Timeline actor type: `staff`.
- Audit metadata stores old status, new status, and reason.

Cache:
- Do not cache write response.
- Invalidate dashboard order list/detail and storefront stock reads.

Errors:
- `400 VALIDATION_ERROR`
- `400 REASON_REQUIRED`
- `401 AUTH_REQUIRED`
- `403 PERMISSION_DENIED`
- `404 ORDER_NOT_FOUND`
- `409 ORDER_STATUS_UNCHANGED`
- `409 ORDER_STATUS_INVALID`

## `GET /shops/:shopId/drafts`

Purpose:
- Staff order-draft list for chat/manual order intake.

Auth/permission:
- Bearer token required.
- Requires `orders:read` on `shopId`.

Request:
- Path `shopId`: shop UUID.
- Query `status`: optional `draft`, `ready`, `confirmed`, `cancelled`.
- Query `limit`: optional number from `1` to `100`, default `50`.

Response:
- `200`

```json
{
  "drafts": [
    {
      "id": "uuid",
      "conversation_id": "uuid",
      "status": "ready",
      "customer_snapshot": {
        "name": "Buyer Name",
        "phone": "+8801700000000",
        "address": "House 1, Road 2, Dhaka"
      },
      "risk_status": "safe",
      "risk_reasons": [],
      "item_count": 1
    }
  ]
}
```

Side effects:
- None.

Audit/timeline:
- None for reads.

Cache:
- Client-side cache is allowed briefly.
- Refetch after draft writes or confirmation.

Errors:
- `400 VALIDATION_ERROR`
- `401 AUTH_REQUIRED`
- `403 PERMISSION_DENIED`

## `POST /shops/:shopId/drafts`

Purpose:
- Create an editable order draft from chat/manual intake.
- Allows missing fields so staff can collect one missing field at a time.

Auth/permission:
- Bearer token required.
- Requires `orders:write` on `shopId`.

Request:

```json
{
  "conversationId": "uuid",
  "customer": {
    "name": "Buyer Name",
    "phone": "+8801700000000",
    "address": "House 1, Road 2, Dhaka"
  },
  "items": [
    {
      "variantId": "uuid",
      "quantity": 1,
      "confidence": 0.8
    }
  ],
  "paymentMethod": "cod",
  "confidence": 0.8
}
```

Response:
- `201`
- Same shape as draft detail.

Side effects:
- Inserts `order_drafts` and `order_draft_items`.
- Writes audit action `order_draft.created`.

Audit/timeline:
- Audit target type: `order_draft`.
- No order timeline until confirmation creates an order.

Cache:
- Do not cache write response.
- Invalidate draft lists and conversation detail if linked.

Errors:
- `400 VALIDATION_ERROR`
- `401 AUTH_REQUIRED`
- `403 PERMISSION_DENIED`
- `404 CONVERSATION_NOT_FOUND`
- `404 VARIANT_NOT_FOUND`

## `POST /shops/:shopId/drafts/extract`

Purpose:
- Create an editable order draft from a chat message.
- Extracts phone, name, address, quantity, and a product match when the message contains an active product name.
- Missing fields stay in `risk_reasons` so staff can ask one field at a time.

Auth/permission:
- Bearer token required.
- Requires `orders:write` on `shopId`.

Request:

```json
{
  "conversationId": "uuid",
  "message": "name Buyer phone +8801700000000 address House 1, Road 2, Dhaka want 2 pcs Black Panjabi"
}
```

Response:
- `201`
- Same shape as draft detail.

Side effects:
- Inserts `order_drafts` and matched `order_draft_items`.
- Writes audit action `order_draft.created`.

Errors:
- `400 VALIDATION_ERROR`
- `401 AUTH_REQUIRED`
- `403 PERMISSION_DENIED`
- `404 CONVERSATION_NOT_FOUND`

## `GET /shops/:shopId/drafts/:draftId`

Purpose:
- Staff draft detail with current variant stock.

Auth/permission:
- Bearer token required.
- Requires `orders:read` on `shopId`.

Request:
- Path `shopId`: shop UUID.
- Path `draftId`: draft UUID.

Response:
- `200`

```json
{
  "draft": {
    "id": "uuid",
    "status": "ready",
    "risk_status": "safe",
    "risk_reasons": []
  },
  "items": [
    {
      "variant_id": "uuid",
      "quantity": 1,
      "price": "500.00",
      "stock": 4
    }
  ]
}
```

Side effects:
- None.

Audit/timeline:
- None for reads.

Cache:
- Client-side cache is allowed briefly.
- Do not trust cached stock for confirmation.

Errors:
- `400 VALIDATION_ERROR`
- `401 AUTH_REQUIRED`
- `403 PERMISSION_DENIED`
- `404 ORDER_DRAFT_NOT_FOUND`

## `PATCH /shops/:shopId/drafts/:draftId`

Purpose:
- Update customer fields, item list, status, or confidence.
- Cancelling a draft keeps conversation history.

Auth/permission:
- Bearer token required.
- Requires `orders:write` on `shopId`.

Request:

```json
{
  "customer": {
    "address": "House 1, Road 2, Dhaka"
  },
  "items": [
    {
      "variantId": "uuid",
      "quantity": 1,
      "confidence": 0.9
    }
  ],
  "status": "ready"
}
```

Response:
- `200`
- Same shape as draft detail.

Side effects:
- Updates draft customer snapshot/risk/status.
- Replaces draft items when `items` is provided.
- Writes audit action `order_draft.updated` or `order_draft.cancelled`.

Audit/timeline:
- Audit target type: `order_draft`.

Cache:
- Do not cache write response.
- Invalidate draft lists/detail.

Errors:
- `400 VALIDATION_ERROR`
- `401 AUTH_REQUIRED`
- `403 PERMISSION_DENIED`
- `404 ORDER_DRAFT_NOT_FOUND`
- `404 VARIANT_NOT_FOUND`
- `409 ORDER_DRAFT_CONFIRMED`
- `409 ORDER_DRAFT_INCOMPLETE`

## `POST /shops/:shopId/drafts/:draftId/confirm`

Purpose:
- Confirm a complete order draft.
- Creates a real order, locks product/price/customer snapshots, and reserves stock.

Auth/permission:
- Bearer token required.
- Requires `orders:write` on `shopId`.

Request:
- Path `shopId`: shop UUID.
- Path `draftId`: draft UUID.
- No body.

Response:
- `201`
- Same shape as buyer/staff order detail.

Side effects:
- Validates phone, address, item, quantity, COD policy, and stock.
- Creates or updates customer and address.
- Creates `orders` and `order_items`.
- Writes negative `inventory_ledger` rows.
- Marks draft `confirmed` with `confirmed_order_id`.
- Writes order timeline `confirmed`.
- Writes audit action `order_draft.confirmed`.

Audit/timeline:
- Audit target type: `order_draft`.
- Order timeline actor type: `staff`.

Cache:
- Do not cache write response.
- Invalidate draft lists, order lists, storefront stock reads, and buyer tracking.

Errors:
- `400 VALIDATION_ERROR`
- `401 AUTH_REQUIRED`
- `403 PERMISSION_DENIED`
- `404 ORDER_DRAFT_NOT_FOUND`
- `404 SHOP_NOT_FOUND`
- `404 VARIANT_NOT_FOUND`
- `409 ORDER_DRAFT_CANCELLED`
- `409 ORDER_DRAFT_CONFIRMED`
- `409 ORDER_DRAFT_INCOMPLETE`
- `409 COD_NOT_ALLOWED`
- `409 STOCK_UNAVAILABLE`

## `POST /shops/:shopId/drafts/:draftId/checkout-link`

Purpose:
- Create a public checkout form link for a draft from a messy chat.
- Link tokens expire and become inactive after confirmation.

Auth/permission:
- Bearer token required.
- Requires `orders:write` on `shopId`.

Request:

```json
{
  "expiresInMinutes": 1440
}
```

Response:
- `201`

```json
{
  "checkoutLink": {
    "id": "uuid",
    "token": "opaque-token",
    "status": "active",
    "expires_at": "2026-09-30T12:00:00.000Z"
  }
}
```

Side effects:
- Inserts `order_checkout_links`.
- Writes audit action `order_draft.checkout_link_created`.

Errors:
- `400 VALIDATION_ERROR`
- `401 AUTH_REQUIRED`
- `403 PERMISSION_DENIED`
- `404 ORDER_DRAFT_NOT_FOUND`
- `409 ORDER_DRAFT_CANCELLED`
- `409 ORDER_DRAFT_CONFIRMED`

## `GET /checkout-links/:token`

Purpose:
- Public checkout form read for the buyer.
- Returns the draft, items, and link expiry when the token is active.

Auth/permission:
- Public bearer token in the URL.

Errors:
- `404 CHECKOUT_LINK_NOT_FOUND`
- `410 CHECKOUT_LINK_EXPIRED`
- `410 CHECKOUT_LINK_INACTIVE`

## `PATCH /checkout-links/:token`

Purpose:
- Let the buyer fill missing customer fields on the public checkout form.

Request:

```json
{
  "customer": {
    "name": "Buyer Name",
    "phone": "+8801700000000",
    "address": "House 1, Road 2, Dhaka"
  }
}
```

Response:
- `200`
- Same shape as public checkout-link read.

Errors:
- `400 VALIDATION_ERROR`
- `404 CHECKOUT_LINK_NOT_FOUND`
- `410 CHECKOUT_LINK_EXPIRED`
- `410 CHECKOUT_LINK_INACTIVE`

## `POST /checkout-links/:token/confirm`

Purpose:
- Public buyer confirmation for a complete checkout-link draft.
- Reuses draft confirmation, so stock, COD policy, and snapshots are checked server-side.

Response:
- `201`
- Same shape as buyer order detail.

Side effects:
- Creates the confirmed order through draft confirmation.
- Marks the checkout link `used`.

Errors:
- `404 CHECKOUT_LINK_NOT_FOUND`
- `409 ORDER_DRAFT_INCOMPLETE`
- `409 STOCK_UNAVAILABLE`
- `410 CHECKOUT_LINK_EXPIRED`
- `410 CHECKOUT_LINK_INACTIVE`

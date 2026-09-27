# Orders API

Base path: `/api/v1/orders`

Purpose:
- Accepts public storefront COD checkout.
- Creates confirmed orders with product/price snapshots.
- Reserves stock by writing negative inventory ledger rows.
- Lets buyer track only with order ID plus phone.

Auth:
- Storefront checkout is public.
- Tracking is public but requires order ID and matching phone.
- Dashboard order APIs require staff session plus shop permission.

## `POST /checkout`

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
  "paymentMethod": "cod"
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

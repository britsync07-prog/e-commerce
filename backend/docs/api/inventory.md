# Inventory API

Base path: `/api/v1/inventory`

Purpose:
- Reads current stock from append-only inventory ledger.
- Applies manual stock adjustments.
- Prevents stock from going below zero.
- Serializes mutations per shop/variant inside the database transaction.

Auth:
- Bearer session required.
- `inventory:read` for stock reads.
- `inventory:write` for stock adjustments.

## `GET /shops/:shopId/variants/:variantId/stock`

Request:
- Path param `shopId`: shop UUID.
- Path param `variantId`: variant UUID.
- No body.

Response:

```json
{
  "shopId": "uuid",
  "variantId": "uuid",
  "quantity": 10
}
```

Side effects:
- None.

Audit/timeline:
- None for read.

Cache:
- Do not trust cache for checkout/order confirmation.
- Dashboard can cache briefly and refetch after stock mutation.

Errors:
- `401 AUTH_REQUIRED`
- `401 SESSION_INVALID`
- `403 SHOP_ACCESS_DENIED`
- `403 PERMISSION_DENIED`
- `404 VARIANT_NOT_FOUND`

## `POST /shops/:shopId/variants/:variantId/adjustments`

Request:
- Path param `shopId`: shop UUID.
- Path param `variantId`: variant UUID.
- Body:

```json
{
  "deltaQuantity": 5,
  "reason": "restock",
  "note": "Supplier delivery"
}
```

Response:
- `201`

```json
{
  "stock": {
    "shopId": "uuid",
    "variantId": "uuid",
    "quantity": 15
  },
  "ledger": {
    "id": "uuid",
    "reason": "restock",
    "delta_quantity": 5,
    "quantity_after": 15
  }
}
```

Side effects:
- Inserts `inventory_ledger`.
- Updates effective stock through ledger sum.

Audit/timeline:
- Writes `inventory.adjusted` audit event.
- Timeline event not yet emitted until product timeline UI exists.

Cache:
- Invalidate product detail, product list, storefront reads, and stock widgets.
- Never use a cached quantity for a write; the transaction re-reads the ledger under a variant lock.

Errors:
- `400 VALIDATION_ERROR`
- `401 AUTH_REQUIRED`
- `401 SESSION_INVALID`
- `403 SHOP_ACCESS_DENIED`
- `403 PERMISSION_DENIED`
- `404 VARIANT_NOT_FOUND`
- `409 INSUFFICIENT_STOCK`

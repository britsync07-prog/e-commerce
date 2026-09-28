# Catalog API

Base path: `/api/v1/catalog`

Purpose:
- Creates and reads shop products.
- Creates a default variant with opening stock in the inventory ledger.
- Keeps product data tenant-scoped by `shop_id`.

Auth:
- Bearer session required.
- `catalog:read` for reads.
- `catalog:write` for create/update.

## `POST /shops/:shopId/products`

Request:
- Path param `shopId`: shop UUID.
- Body:

```json
{
  "name": "Black Panjabi",
  "description": "Cotton panjabi",
  "status": "active",
  "basePrice": 1200,
  "currency": "BDT",
  "sku": "PANJABI-BLACK",
  "variantTitle": "Default",
  "openingStock": 10
}
```

Response:
- `201`

```json
{
  "product": {
    "id": "uuid",
    "shop_id": "uuid",
    "name": "Black Panjabi",
    "slug": "black-panjabi",
    "status": "active",
    "base_price": "1200.00",
    "currency": "BDT"
  },
  "variants": [
    {
      "id": "uuid",
      "product_id": "uuid",
      "sku": "PANJABI-BLACK",
      "title": "Default",
      "price": "1200.00"
    }
  ],
  "stock": 10
}
```

Side effects:
- Inserts `products`.
- Inserts default `product_variants`.
- Inserts opening row in `inventory_ledger`.

Audit/timeline:
- Writes `catalog.product_created` audit event.
- Timeline event not yet emitted until order/product timeline UI exists.

Cache:
- Invalidate catalog list, product detail, and public storefront reads.

Errors:
- `400 VALIDATION_ERROR`
- `401 AUTH_REQUIRED`
- `401 SESSION_INVALID`
- `403 SHOP_ACCESS_DENIED`
- `403 PERMISSION_DENIED`
- `400 SLUG_REQUIRED`
- `404 SHOP_NOT_FOUND`
- `409 PRODUCT_CONFLICT`
- `409 INSUFFICIENT_STOCK`

## `GET /shops/:shopId/products`

Request:
- Path param `shopId`: shop UUID.
- No body.

Response:

```json
{
  "products": [
    {
      "id": "uuid",
      "shop_id": "uuid",
      "name": "Black Panjabi",
      "slug": "black-panjabi",
      "status": "active",
      "base_price": "1200.00",
      "currency": "BDT",
      "stock": 10
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
- Refetch after product or inventory mutation.

Errors:
- `401 AUTH_REQUIRED`
- `401 SESSION_INVALID`
- `403 SHOP_ACCESS_DENIED`
- `403 PERMISSION_DENIED`
- `404 SHOP_NOT_FOUND`

## `GET /shops/:shopId/products/:productId`

Request:
- Path param `shopId`: shop UUID.
- Path param `productId`: product UUID.
- No body.

Response:

```json
{
  "product": {
    "id": "uuid",
    "shop_id": "uuid",
    "name": "Black Panjabi"
  },
  "variants": [
    {
      "id": "uuid",
      "stock": 10
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
- Refetch after product or inventory mutation.

Errors:
- `401 AUTH_REQUIRED`
- `401 SESSION_INVALID`
- `403 SHOP_ACCESS_DENIED`
- `403 PERMISSION_DENIED`
- `404 PRODUCT_NOT_FOUND`

## `PATCH /shops/:shopId/products/:productId`

Purpose: edit product fields and move a product between `draft`, `active`, and `archived`.

Auth: Bearer session required; requires `catalog:write`.

Request: any of `name`, `description`, `status`, `basePrice`, and `currency`. Publishing requires a non-empty name and non-negative price.

Side effects: updates the tenant-scoped product and writes `catalog.product_updated` audit data. Existing order snapshots are unchanged.

Errors: `400 VALIDATION_ERROR`, `400 PRODUCT_PUBLISH_INVALID`, `401 AUTH_REQUIRED`, `403 SHOP_ACCESS_DENIED`, `403 PERMISSION_DENIED`, `404 PRODUCT_NOT_FOUND`.

## `POST /shops/:shopId/products/:productId/variants`

Purpose: add a product variant with SKU, price, and opening stock.

Auth: Bearer session required; requires `catalog:write`.

Request: `{ "title": "Black / XL", "sku": "PANJABI-BLACK-XL", "price": 1350, "openingStock": 8 }`.

Side effects: inserts the tenant-scoped variant, writes opening stock to the inventory ledger, and audits `catalog.variant_created`.

Errors: `404 PRODUCT_NOT_FOUND`, `409 SKU_CONFLICT`, `409 INSUFFICIENT_STOCK`.

## `PATCH /shops/:shopId/products/:productId/variants/:variantId`

Purpose: update variant title, SKU, price, or archive status.

Auth: Bearer session required; requires `catalog:write`.

Side effects: updates the variant and audits `catalog.variant_updated`. Existing order snapshots remain unchanged.

Errors: `404 VARIANT_NOT_FOUND`, `409 SKU_CONFLICT`.

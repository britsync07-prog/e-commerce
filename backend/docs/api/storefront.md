# Storefront API

Base path: `/api/v1/storefront`

Purpose:
- Public read API used by the live-test storefront renderer.
- Looks up a launched PostgreSQL shop by subdomain.
- Returns shop profile, selected template metadata, active products, and stock from inventory ledger.

Auth:
- Public read.
- Only launched shops are returned.

## `GET /:subdomain`

Request:
- Path param `subdomain`: published shop subdomain.
- No body.

Example:

```txt
GET /api/v1/storefront/nafis-fashion
```

Response:

```json
{
  "shop": {
    "id": "uuid",
    "displayName": "Nafis Fashion",
    "subdomain": "nafis-fashion",
    "category": "fashion",
    "country": "Bangladesh",
    "currency": "BDT",
    "language": "bn-en",
    "policyDefaults": {
      "deliveryCharge": 0,
      "returnDays": 3,
      "codAllowed": true
    },
    "selectedTemplateId": "test-fashion-basic"
  },
  "template": {
    "id": "test-fashion-basic",
    "status": "test_only"
  },
  "products": []
}
```

Side effects:
- None.

Audit/timeline:
- None. Public read only.

Cache:
- CDN/storefront can cache briefly.
- Invalidate when products, shop settings, or selected template change.

Errors:
- `404 SHOP_NOT_FOUND` when shop is missing or not launched.

## `GET /:subdomain/products/:slug`

Purpose: public product detail for an active product in a launched shop.

Response: product description, image URL, active variants, prices, and current ledger stock. Address, customer, and internal shop data are never returned.

Side effects: None.

Errors: `404 PRODUCT_NOT_FOUND` when the shop is unpublished or product is unavailable.

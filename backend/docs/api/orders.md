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
- Dashboard order APIs will require staff permissions when added.

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


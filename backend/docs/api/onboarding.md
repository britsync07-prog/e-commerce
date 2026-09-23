# Onboarding API

Base path: `/api/v1/onboarding`

Purpose:
- Powers the Shopify-style first setup flow: account, shop basics, products, channels, AI mode, launch.
- Allows website-only launch when Meta is skipped.
- Keeps draft state, audit events, and launch checklist.
- Provides test-only template references for storefront selection.

Auth:
- Temporary public onboarding API until auth/session module exists.
- Production rule: bind these calls to authenticated owner session.

## `POST /subdomain/check`

Request:

```json
{
  "subdomain": "nafis fashion"
}
```

Response:

```json
{
  "subdomain": "nafis-fashion",
  "available": true,
  "suggestions": []
}
```

Side effects:
- None.

Audit/timeline:
- None.

Cache:
- Do not cache. Availability is live state.

Errors:
- `400 SUBDOMAIN_TOO_SHORT`

## `GET /templates`

Purpose:
- Lists online template references added to the system.
- Includes storefront/admin/fullstack candidates, source URL, license note, stack, best-fit categories, and reuse status.

Response:

```json
{
  "templates": [
    {
      "id": "test-fashion-basic",
      "name": "Test Fashion Basic",
      "type": "storefront",
      "sourceUrl": "internal:test-template",
      "license": "Internal test-only, not for production",
      "stack": ["Backend catalog metadata only"],
      "bestFor": ["fashion", "clothing", "beauty"],
      "notes": "Basic test template for onboarding flow only. No external source code. Replace before production.",
      "status": "test_only"
    }
  ]
}
```

Side effects:
- None.

Audit/timeline:
- None.

Cache:
- Client can cache. Refetch when template catalog changes.

Errors:
- None expected.

## `POST /start`

Request:

```json
{
  "ownerName": "Nafis",
  "phone": "+8801700000000",
  "language": "bn-en",
  "shopName": "Nafis Fashion",
  "category": "fashion",
  "country": "Bangladesh",
  "currency": "BDT"
}
```

Response:
- `201`
- Full onboarding state: owner, shop, products, channels, audit, launchChecklist.

Side effects:
- Creates owner.
- Creates draft shop.
- Reserves subdomain.
- Sets default COD policy and suggest-only AI mode.

Audit/timeline:
- Writes `onboarding.started`.

Cache:
- Invalidate onboarding state and subdomain checks.

Errors:
- `400 VALIDATION_ERROR`
- `409 SUBDOMAIN_TAKEN`

## `GET /:shopId`

Purpose:
- Reads current onboarding state.

Response:
- Full onboarding state.

Side effects:
- None.

Audit/timeline:
- None.

Cache:
- Client can cache briefly, refetch after mutations.

Errors:
- `404 SHOP_NOT_FOUND`

## `PATCH /:shopId/shop`

Purpose:
- Updates shop basics and policy defaults before launch.

Request:

```json
{
  "displayName": "Nafis Fashion",
  "address": "Dhaka",
  "policyDefaults": {
    "deliveryCharge": 80,
    "returnDays": 3,
    "codAllowed": true
  }
}
```

Side effects:
- Updates draft shop.
- Can change subdomain if available.

Audit/timeline:
- Writes `shop.updated`.

Cache:
- Invalidate shop/onboarding state and subdomain checks if subdomain changed.

Errors:
- `404 SHOP_NOT_FOUND`
- `409 SHOP_LAUNCHED`
- `409 SUBDOMAIN_TAKEN`

## `POST /:shopId/products`

Purpose:
- Adds first product during onboarding so AI and storefront have real data.

Request:

```json
{
  "name": "Black Panjabi",
  "price": 1200,
  "stock": 10
}
```

Side effects:
- Creates active first product.
- Moves onboarding step to `channels`.

Audit/timeline:
- Writes `product.created`.

Cache:
- Invalidate onboarding state and product reads.

Errors:
- `400 VALIDATION_ERROR`
- `404 SHOP_NOT_FOUND`
- `409 SHOP_LAUNCHED`

## `POST /:shopId/channels/meta/skip`

Purpose:
- Lets seller continue website-only without Meta connection.

Side effects:
- Creates skipped Meta channel record if missing.
- Moves onboarding step to `ai_mode`.

Audit/timeline:
- Writes `channel.meta_skipped`.

Cache:
- Invalidate onboarding state.

Errors:
- `404 SHOP_NOT_FOUND`

## `PATCH /:shopId/ai-mode`

Purpose:
- Sets initial AI mode: `off`, `suggest`, or `auto_low_risk`.

Request:

```json
{
  "aiMode": "suggest"
}
```

Side effects:
- Updates shop AI mode.
- Moves onboarding step to `launch`.

Audit/timeline:
- Writes `ai_mode.updated`.

Cache:
- Invalidate onboarding state.

Errors:
- `400 VALIDATION_ERROR`
- `404 SHOP_NOT_FOUND`

## `POST /:shopId/template`

Purpose:
- Selects one template reference for the shop during onboarding.
- This stores the chosen design/source direction; it does not copy template source code.

Request:

```json
{
  "templateId": "test-fashion-basic"
}
```

Side effects:
- Sets `shop.selectedTemplateId`.
- Makes launch checklist `hasTemplate=true`.

Audit/timeline:
- Writes `template.selected`.

Cache:
- Invalidate onboarding state.

Errors:
- `400 VALIDATION_ERROR`
- `404 SHOP_NOT_FOUND`
- `404 TEMPLATE_NOT_FOUND`
- `409 SHOP_LAUNCHED`

## `POST /:shopId/launch`

Purpose:
- Publishes the shop from onboarding.

Rules:
- Requires display name and subdomain.
- Allows launch with first product.
- Allows template-only launch later; templates are not built yet.

Side effects:
- Changes shop status to `launched`.
- Sets `launchedAt`.

Audit/timeline:
- Writes `shop.launched`.

Cache:
- Invalidate onboarding state and public storefront reads.

Errors:
- `404 SHOP_NOT_FOUND`
- `409 LAUNCH_BLOCKED`

# Build Priority

## Phase 0: Foundation

Build before product features:

- Auth, shops, roles, permissions.
- Shop onboarding basics and subdomain reservation.
- Audit log and action timeline.
- File upload/storage for logos, product images, proof images.
- Background jobs, retry table, webhook signature verification.
- Tenant-safe database schema and request guards.
- Docker local stack: API, worker, Postgres, Redis.
- Cache policy: client cache for reads, Redis for rate limits/jobs/idempotency, no trusted cache for stock/money/permissions.
- External integration pattern: timeout, retry, idempotency, raw payload, dead-letter, manual fallback.
- Observability base: request id, structured logs, error tracking, job metrics.

## Phase 1: P0 Revenue Path

Goal: seller can launch, receive buyer interest, create order, reserve stock, book/track delivery manually/API.

1. Onboarding and store setup.
2. Product and inventory.
3. Storefront, checkout, order tracking page.
4. AI inbox with suggest-only mode first.
5. Order extraction and confirmation.
6. Orders dashboard and timeline.
7. Courier booking/manual courier mode.
8. Basic team/settings/security.

## Phase 2: Trust and Money

- Payment records, COD ledger, proof upload, marked-paid audit.
- COD reconciliation.
- Delivery failure and reschedule workflow.
- Dashboard metrics for sales, orders, delivery, AI replies.

## Phase 3: Growth

- Comment automation and lead capture.
- Customer CRM, tags, segments, coupons.
- Safe broadcasts with consent and rate limits.
- AI ad creative studio.

## Phase 4: Ads and Command Center

- Meta CAPI, pixel, catalog sync.
- Delivered ROAS and campaign insights.
- AI command center for data questions and approved actions.

## Do Not Start With

- Full Shopify-style app store.
- Full Meta Ads Manager clone.
- Custom courier fleet.
- Enterprise SSO/custom roles.
- Complex BI builder.
- Loyalty points, barcode warehouse, multi-warehouse unless real seller need appears.
- Microservices before load/team boundaries prove need.
- Custom cache framework before Redis/HTTP/client cache falls short.

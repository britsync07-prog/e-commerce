# API and Worker Plan

## Public APIs

- Storefront by subdomain.
- Product listing/detail.
- Checkout create/submit.
- Order tracking lookup by phone plus order ID.
- Use `/api/v1` for external/public contracts.
- Public endpoints only expose published shop data.

## Dashboard APIs

- Auth/session/shop switcher.
- Onboarding save draft/continue/launch.
- Products CRUD, import, export, stock update.
- Inbox conversations/messages/AI drafts.
- Orders list/detail/status/bulk action.
- Courier settings/booking/tracking.
- Payments/proofs/COD reconciliation.
- Customers/tags/segments/coupons/campaigns.
- Analytics reports.
- Settings/team/billing/audit.
- Cursor pagination for large lists.
- Idempotency keys for mutations that create money/order/delivery side effects.
- Bulk actions return per-item success/error.

## API Documentation Rule

- Every backend API route must have matching docs under `backend/docs/api/`.
- API docs must be changed in the same commit as the route.
- Each API doc must include method/path, purpose, auth/permission, request, response, side effects, audit/timeline, cache behavior, and errors.
- `backend/scripts/check-api-docs.mjs` checks route docs exist.

## Webhooks

- Meta messages/comments.
- Courier tracking.
- Payment providers when integrated.
- Verify signatures where provider supports it.
- Store raw payload, provider event id, processing status, retry count.
- De-duplicate with provider event id or generated hash.

## Worker Queues

- `imports`
- `ai`
- `webhooks`
- `courier`
- `payments`
- `exports`
- `analytics`

## Retry Rules

- External calls use timeout plus exponential backoff with jitter.
- Failed jobs move to dead-letter after max attempts.
- Retryable local drafts remain visible to staff.
- Non-retryable validation failures go to issue queue.

## Cache Rules

- Client cache dashboard lists and settings reads.
- Invalidate/refetch after mutations.
- Redis stores sessions/rate limits/idempotency/job locks.
- Do not trust cache for stock, payment, permission, or order confirmation decisions.

## First Acceptance Gate

Before adding P1 features, verify:

- Signup to live store under 5 minutes.
- Product import has row-level errors.
- Buyer checkout under 60 seconds.
- AI cannot confirm unavailable stock.
- Order confirmation reserves stock.
- Cancellation releases stock.
- Courier API failure keeps retryable draft.
- Every status/payment/AI action writes audit.

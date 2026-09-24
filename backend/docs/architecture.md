# Backend Architecture

## Shape

Modular monolith first.

Reason:
- 1000 sellers does not require microservices.
- Shared stock/order/payment/audit rules stay simpler in one deployable.
- Modules can split later because boundaries are explicit.

## Modules

- Active: `health`, `system`, `onboarding`, `storefront`.
- Planned foundation: `auth`, `shops`, `settings`, `webhooks`, `jobs`.
- Planned P0 path: `catalog`, `inventory`, `inbox`, `orders`, `delivery`, `ai`.
- Planned growth/trust: `payments`, `customers`, `marketing`, `analytics`.

Source of truth:
- `src/shared/module-registry.ts`
- `GET /api/v1/system/modules`
- `src/modules/README.md`

## Required Infrastructure

- PostgreSQL: source of truth.
- Redis: cache, rate limits, idempotency, job locks.
- Object storage: images, proofs, invoices, exports.
- Queue/worker: imports, webhooks, AI, courier, payments, exports.
- Docker: local and deployment parity.

## Cache Rule

Client cache is allowed for reads. Server re-checks critical writes:

- stock
- payment
- permissions
- courier booking
- order confirmation
- AI approval/execution

## API Docs Rule

Every new API route must add or update `backend/docs/api/*.md` in the same change.
`npm run check:api-docs` fails when a route module has no doc or misses required sections.

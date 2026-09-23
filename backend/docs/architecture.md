# Backend Architecture

## Shape

Modular monolith first.

Reason:
- 1000 sellers does not require microservices.
- Shared stock/order/payment/audit rules stay simpler in one deployable.
- Modules can split later because boundaries are explicit.

## Modules

- `auth`
- `shops`
- `catalog`
- `inventory`
- `storefront`
- `inbox`
- `orders`
- `delivery`
- `payments`
- `customers`
- `marketing`
- `analytics`
- `ai`
- `settings`

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


# System Design

Backend target: reliable multi-tenant SaaS for 1000+ sellers, with social inbox, COD orders, courier, payment tracking, storefront, and AI automation.

## Core Architecture

Start as a modular monolith, packaged with clear module boundaries:

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

Split into services only when load or team ownership proves it. First split candidates: worker/webhooks, storefront renderer, AI jobs.

## Runtime Components

- Web/API app: dashboard and public APIs.
- Storefront app: buyer pages by subdomain.
- Worker app: imports, AI jobs, Meta webhooks, courier sync, exports, analytics rollups.
- Scheduler: recurring jobs, checkout expiry, tracking sync, settlement checks.
- Queue: async jobs and retry control.
- Database: primary relational source of truth.
- Cache: sessions, rate limits, hot reads, short-lived computed data.
- Object storage: images, invoices, proof screenshots, exports.
- CDN: storefront assets and product images.

## Recommended Core Stack

Final framework can change, but backend needs these capabilities:

- PostgreSQL for source-of-truth data.
- Redis for cache, locks, rate limits, queues if framework supports it.
- S3-compatible object storage for files.
- Docker for local dev and deployment parity.
- OpenAPI for API contracts.
- Background worker queue with retries and dead-letter handling.
- Structured logging, metrics, tracing.

## Docker

Use Docker from the first real app commit.

Minimum containers:

- `api`
- `worker`
- `postgres`
- `redis`
- `storage` for local S3-compatible dev if needed

Rules:

- App config comes from env vars.
- Secrets never live in images or git.
- Migrations run as explicit deploy step, not silently on app boot.
- Health checks exist for API, worker, database, Redis.

## Caching

Use caching carefully. Truth stays in PostgreSQL.

### Client-Side Caching

Use client-side caching for dashboard reads:

- products list
- orders list filters
- conversations list
- analytics summaries
- settings reads

Do not trust client cache for:

- stock availability
- payment status
- permissions
- courier status
- AI approval state
- order confirmation

Use short TTL plus server validation for critical actions. Any mutation must invalidate or refetch affected queries.

### HTTP/CDN Caching

Use CDN/HTTP caching for public storefront:

- product images: long cache with versioned URLs
- theme assets: long cache with versioned URLs
- product/category pages: short cache or stale-while-revalidate

Never cache buyer-private tracking results publicly.

### Server-Side Cache

Use Redis for:

- sessions or session metadata
- rate limits
- idempotency keys
- webhook duplicate detection
- short-lived storefront/product cache
- AI job locks
- courier sync locks

Avoid caching money, stock, or permissions without strict invalidation.

## Data Consistency

Strong consistency required:

- stock reservation/release
- order confirmation/cancellation
- payment edits
- staff permissions
- audit logs

Eventual consistency allowed:

- analytics dashboards
- campaign stats
- Meta catalog sync
- courier tracking sync
- AI summaries

## External Integrations

Every external integration needs:

- credential storage by shop
- webhook signature verification where supported
- request timeout
- retry with backoff and jitter
- idempotency key
- dead-letter queue
- last sync time
- raw payload storage for debugging
- manual fallback

Priority integrations:

1. Meta messaging and Instagram.
2. Courier providers.
3. Payment proof/manual payment first, gateways later.
4. Meta Pixel/CAPI and catalog sync.
5. SMS/WhatsApp provider if needed for notifications.

## API Design

- Version public APIs from day one: `/api/v1`.
- Cursor pagination for large lists.
- Idempotency keys for order confirm, courier booking, payment mark, imports, campaign sends.
- Bulk endpoints return per-item success/error.
- All dashboard APIs enforce shop membership and role permission.
- Public storefront APIs can read only published shop data.

## Automation System

Automation runs through one action gateway:

1. Validate user/shop permission.
2. Classify action risk.
3. Build preview for risky action.
4. Require approval where needed.
5. Execute with idempotency key.
6. Write audit log and timeline.
7. Emit analytics/event record.

AI can draft freely. AI cannot bypass the action gateway.

## Observability

Required from first deployment:

- request id and correlation id
- structured JSON logs
- error tracking
- API latency/error metrics
- worker job success/failure/retry metrics
- external API latency/failure metrics
- audit log viewer for business actions

Alerts:

- API error rate high
- queue backlog high
- webhook failures high
- courier booking failures high
- payment/audit write failure
- database storage/connection pressure

## Security

- Tenant isolation enforced in queries and tests.
- Password/OTP/session security before beta.
- Role checks on every mutation/export/payment action.
- Webhook signatures verified.
- Secrets stored outside git.
- Integration tokens encrypted at rest.
- Rate limits for auth, checkout, public tracking, webhooks.
- File uploads validate type, size, and malware risk where possible.
- Audit logs append-only.

## Deployment

Environments:

- local
- staging
- production

Release rules:

- CI runs lint/typecheck/test once stack exists.
- Database migrations are reviewed and reversible where possible.
- Deploy API and worker together for schema-compatible changes.
- Feature flags for risky automation, Meta sending, courier booking, broadcasts.
- Backups tested before production launch.

## Scale Notes

For 1000 sellers, do not start with microservices. Scale with:

- indexed Postgres queries
- pagination
- async workers
- Redis rate limits/locks
- CDN for storefront/media
- read replicas only when real read pressure appears
- module boundaries that can split later


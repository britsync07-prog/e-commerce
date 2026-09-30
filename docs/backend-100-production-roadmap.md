# Backend 100/100 Production Roadmap

Source: `docs/backend-production-readiness-audit-2026-09-30.md`  
Current score: **58/100**  
Target: **100/100 production-ready backend**  
Performance target: **public storefront GET p95 <= 200 ms for 1000+ active users**

## Rules For This Roadmap

- Do phases in order. Do not jump to shiny features before production proof.
- Every backend API route change must update `backend/docs/api/`.
- Every business record must stay tenant-scoped by `shop_id`.
- Every risky action must have permission, reason, idempotency, audit, and timeline/event.
- External providers must never block checkout/order correctness.
- AI must never invent price, stock, payment state, delivery charge, delivery date, or policy.
- Production readiness only counts when tested in CI or staging.

## Phase 1: Make The Current Backend Prove Itself

Target score after phase: **65/100**

Goal: stop guessing. Make tests, migrations, and docs prove the backend works against real Postgres/Redis.

### Step 1.1: CI With Postgres And Redis

Do:

- Add GitHub Actions workflow or equivalent CI.
- Start Postgres 17 and Redis 7 services.
- Install backend dependencies.
- Run migrations from empty DB.
- Run `npm run check:api-docs`.
- Run `npm run build`.
- Run every DB smoke test, not only onboarding.

Files likely touched:

- `.github/workflows/backend.yml`
- `backend/package.json`
- `backend/scripts/*`
- `backend/test/*`

Acceptance:

- CI fails if Postgres is unreachable.
- CI fails if any migration fails.
- CI fails if any smoke test fails.
- CI fails if API docs are missing.

### Step 1.2: One Command For Full Backend Verification

Do:

- Add `npm run test:db` to run all DB smoke tests.
- Add `npm run check:full` to run docs, build, unit/integration, DB smoke.
- Keep default `npm run check` fast if needed, but production score uses `check:full`.

Acceptance:

- `cd backend; npm run check:full` gives one final answer.

### Step 1.3: Migration Safety

Do:

- Add migration order check.
- Add migration idempotency check.
- Add seeded old-schema upgrade test later when schema stabilizes.
- Document migration rollback rules.

Acceptance:

- Empty DB migration works.
- Re-running migration command does not break.
- Migration docs explain deploy order.

## Phase 2: Production Environment And Storage

Target score after phase: **70/100**

Goal: make deployment real, not only local Docker.

### Step 2.1: Environment Separation

Do:

- Define `local`, `staging`, `production`.
- Add required env var docs.
- Fail app startup when production secrets are missing.
- Ensure CORS is exact per environment.
- Ensure Swagger UI is disabled or protected in production.

Files likely touched:

- `backend/src/shared/config.ts`
- `backend/.env.example`
- `backend/docs/architecture.md`
- deployment docs under `docs/` or `ops/`

Acceptance:

- Production cannot boot with weak/missing secrets.
- Staging and production use different DB/Redis/storage.

### Step 2.2: Object Storage

Do:

- Add S3/R2 storage driver for assets.
- Keep local driver for dev only.
- Store private proof files separately from public product images.
- Add signed/private URL support for proof files.
- Keep product image URLs CDN-friendly.

Acceptance:

- Product images can be uploaded to S3/R2.
- Payment proof files are not public.
- Existing local dev upload still works.

### Step 2.3: Image And File Safety

Do:

- Validate MIME by file content, not only uploaded header.
- Decode images before accepting.
- Reject SVG unless sanitized or explicitly unsupported.
- Add optional malware scan hook for proofs/attachments.
- Add image resize pipeline for storefront thumbnails.

Acceptance:

- Fake image upload is rejected.
- Oversized files are rejected.
- Product image has stable public URL.

### Step 2.4: Backup And Restore

Do:

- Add daily DB backup.
- Add object storage backup/versioning policy.
- Add Redis recovery policy; Redis should not be source of truth.
- Add restore runbook.
- Run restore drill in staging.

Acceptance:

- Staging can be restored from backup.
- Restore process is documented step by step.

## Phase 3: Observability And Operations Base

Target score after phase: **75/100**

Goal: know when backend is failing before customers tell you.

### Step 3.1: Structured Logs

Do:

- Add request id, user id, shop id, route, status, latency to logs.
- Add error code and module to error logs.
- Never log tokens, OTP codes, passwords, or provider secrets.

Acceptance:

- One request can be traced across API and worker logs.

### Step 3.2: Metrics

Do:

- Add metrics endpoint or OpenTelemetry export.
- Track API latency/error per route.
- Track DB pool usage.
- Track slow DB queries.
- Track worker queue depth.
- Track job success/fail/retry/dead-letter.
- Track webhook accepted/duplicate/failed.
- Track provider latency/error.

Acceptance:

- Dashboard shows p50/p95/p99 latency.
- Dashboard shows queue backlog by queue.

### Step 3.3: Alerts

Do:

- Alert on API 5xx spike.
- Alert on p95 latency high.
- Alert on DB connection pressure.
- Alert on worker heartbeat missing.
- Alert on queue backlog.
- Alert on webhook failure spike.
- Alert on backup failure.
- Alert on audit write failure.

Acceptance:

- Test alert reaches owner/admin channel.

### Step 3.4: Ops Admin Endpoints

Do:

- Add endpoints for job queue, workers, webhook events, dead-letter, integration health.
- Keep them permission-protected.
- Add retry/replay actions with reason and audit.

Acceptance:

- Failed job can be retried safely.
- Failed webhook can be replayed safely.

## Phase 4: Security Hardening

Target score after phase: **80/100**

Goal: protect stores, staff, buyers, payments, exports, and integrations.

### Step 4.1: Auth Hardening

Do:

- Add real email/SMS OTP provider.
- Add MFA for owner/admin.
- Add password policy.
- Add login throttling by identifier and IP.
- Add password reset throttling.
- Add revoke-all-sessions.
- Add session/device list.

Acceptance:

- Owner/admin cannot disable MFA once production policy requires it.
- Password reset cannot be spammed.

### Step 4.2: Browser Session Strategy

Do:

- Decide auth transport:
  - Bearer token only, or
  - secure HttpOnly cookie.
- If cookie auth: add CSRF protection.
- Set cookie flags: `HttpOnly`, `Secure`, `SameSite`.

Acceptance:

- Auth strategy is documented and tested.

### Step 4.3: Permission Expansion

Add permissions:

- `billing:read`
- `billing:write`
- `integrations:read`
- `integrations:write`
- `integrations:disconnect`
- `ai:read`
- `ai:write`
- `ai:approve`
- `ai:execute`
- `webhooks:read`
- `webhooks:replay`
- `jobs:read`
- `jobs:retry`
- `audit:read`
- `privacy:read`
- `privacy:write`
- `legal:write`
- `reports:read`
- `orders:cancel`
- `payments:refund`
- `payments:mark_paid`
- `delivery:book`
- `marketing:broadcast_approve`

Acceptance:

- Accountant can mark payment/refund but cannot send campaigns.
- Marketer can approve campaigns only if permission exists.
- Sales cannot export full customer data by default.

### Step 4.4: Integration Secret Security

Do:

- Encrypt all provider tokens.
- Add key rotation plan.
- Never show full credentials after save.
- Audit connect/disconnect/token refresh.
- Add disconnect warning preview.

Acceptance:

- DB leak does not expose raw provider tokens.

## Phase 5: Legal, Privacy, Cookies, Consent

Target score after phase: **84/100**

Goal: make stores legally usable, not just technically usable.

### Step 5.1: Legal Pages

Add tables and APIs for:

- Privacy Policy.
- Cookie Policy.
- Terms and Conditions.
- Return and Refund Policy.
- Shipping and Delivery Policy.
- Cancellation Policy.
- Contact Seller page.
- Payment/COD terms.

Do:

- Link legal pages in storefront footer.
- Link relevant policies at checkout.
- Save published version snapshots.

Acceptance:

- Buyer can view legal pages before checkout.
- Policy version at order time is recoverable.

### Step 5.2: Cookie Consent

Do:

- Add consent categories:
  - necessary,
  - analytics,
  - marketing.
- Store consent event with timestamp, IP hash, user agent, shop, categories.
- Gate Meta Pixel/CAPI marketing events behind consent where required.
- Add opt-out/change-consent endpoint.

Acceptance:

- Marketing tracking does not fire before consent where required.

### Step 5.3: Privacy Requests

Do:

- Add buyer data export request.
- Add buyer delete/anonymize request.
- Add retention rules.
- Add staff workflow with approval and audit.

Acceptance:

- Buyer deletion anonymizes personal data without breaking historical order/payment accounting.

## Phase 6: Real Provider Integrations

Target score after phase: **88/100**

Goal: replace `not_connected` placeholders with real adapters.

### Step 6.1: Provider Adapter Pattern

Do:

- Define adapter interface for:
  - Meta messaging,
  - Meta CAPI,
  - Meta catalog,
  - courier,
  - email/SMS,
  - AI provider.
- Each adapter must support timeout, retry class, idempotency key, raw response logging, and safe error mapping.

Acceptance:

- Adding second courier provider does not change order service logic.

### Step 6.2: Meta Messaging And Comments

Do:

- Send Messenger/Instagram outbound replies.
- Send comment reply/DM where policy allows.
- Store provider message id.
- Respect consent and platform policy.
- Add retry/dead-letter on send failure.

Acceptance:

- AI/staff approved reply sends to Meta and writes audit.

### Step 6.3: Meta CAPI And Catalog

Do:

- Send server-side events.
- Deduplicate browser/server events.
- Sync eligible product catalog.
- Show tracking health and last event time.

Acceptance:

- Delivered order revenue can be connected to campaign stats.

### Step 6.4: Courier Adapter

Do:

- Implement first real courier.
- Book shipment.
- Store tracking number/provider id.
- Verify courier webhook signature if available.
- Reconcile webhook/manual conflicts.

Acceptance:

- API shipment booking works without manual DB edits.

### Step 6.5: Email/SMS Provider

Do:

- Send OTP.
- Send order confirmation.
- Send checkout link.
- Send delivery updates if enabled.

Acceptance:

- Auth verification no longer returns dev-only code in production.

### Step 6.6: AI Provider

Do:

- Add provider for inbox drafts.
- Add provider for order extraction.
- Add provider for command center.
- Add provider for ad creative drafts.
- Store prompt version, input refs, output, model, latency, cost, safety flags.
- Add small eval set before auto-send/auto-execute.

Acceptance:

- AI output cites source data and stays review-only for risky actions.

## Phase 7: Risky Action Gateway

Target score after phase: **91/100**

Goal: no dangerous mutation happens casually.

### Step 7.1: Gateway Model

Add:

- `action_approvals`
- `action_execution_logs`
- `action_idempotency_keys` or reuse existing idempotency table cleanly

Gateway flow:

- Validate auth.
- Validate shop access.
- Validate permission.
- Classify risk.
- Build preview.
- Require reason.
- Require approval when needed.
- Reserve idempotency key.
- Execute action.
- Write audit.
- Write timeline/event.
- Return result.

Acceptance:

- Cancel order, refund, mark paid, bulk message, courier booking, integration disconnect, owner transfer, export, AI execution all use gateway.

### Step 7.2: Preview Builders

Do:

- Build preview for each risky action.
- Show before/after values.
- Show affected records.
- Show possible irreversible effects.

Acceptance:

- Bulk action returns per-item valid/invalid reasons before execution.

### Step 7.3: Approval Inbox

Do:

- Add approval list.
- Add approve/reject endpoints.
- Add approval expiry.
- Add audit for approve/reject.

Acceptance:

- High-risk AI command cannot execute without explicit approval.

## Phase 8: Admin Ops Quality

Target score after phase: **94/100**

Goal: daily business operations work from admin screens, not logs/database.

Backend APIs needed:

- Saved order views.
- Saved inbox views.
- Failed delivery queue.
- Payment proof review queue.
- COD settlement issue queue.
- Broadcast approval queue.
- AI approval queue.
- Integration health list.
- Audit search.
- Job/dead-letter list.
- Webhook replay list.

Acceptance:

- Staff can solve common failures without developer access.
- Every queue has filters, pagination, and per-record actions.

## Phase 9: 200 ms Performance Track

Target score after phase: **97/100**

Goal: prove speed under real data and 1000+ users.

### Step 9.1: Define SLOs

Targets:

- Public storefront GET p95 <= 200 ms.
- Webhook ACK p95 <= 100 ms.
- Dashboard GET p95 <= 400 ms.
- Checkout/order confirmation p95 <= 500 ms.
- Error rate < 0.5%.

Acceptance:

- SLOs are documented and visible in metrics.

### Step 9.2: Seed And Load Test

Do:

- Add seed script:
  - 1000 shops,
  - 100k products,
  - 100k orders,
  - 500k messages,
  - 100k customers,
  - webhook/job backlog samples.
- Add k6 or Artillery tests:
  - storefront browse,
  - product detail,
  - checkout submit,
  - order tracking,
  - dashboard order list,
  - inbox list/detail,
  - webhook burst.

Acceptance:

- Load test report shows p95/p99 per endpoint.

### Step 9.3: Index And Query Tuning

Do:

- Add composite indexes for hot queries:
  - `(shop_id, status, created_at desc)`
  - `(shop_id, customer_id, created_at desc)`
  - `(shop_id, phone_hash)` if tracking/customer lookup uses phone.
  - `(shop_id, sku)` for variants.
  - `(shop_id, conversation status, updated_at desc)`.
- Remove N+1 list queries.
- Use cursor pagination everywhere.
- Add slow query log threshold around 100 ms.

Acceptance:

- Hot endpoint queries have `EXPLAIN ANALYZE` proof.

### Step 9.4: Caching

Do:

- CDN cache images and theme assets.
- Redis cache public storefront settings/product lists.
- Use short TTL and explicit invalidation on publish/product update.
- Use stale-while-revalidate for public pages.
- Never trust cache for stock, payment, permission, order confirmation, AI approval.

Acceptance:

- Public storefront read p95 <= 200 ms under load.

### Step 9.5: Scale Runtime

Do:

- Run 2+ API instances.
- Run worker separately.
- Add PgBouncer if DB connections grow.
- Tune `pg.Pool` max per instance.
- Add worker concurrency per queue.
- Keep webhooks fast: verify, persist, enqueue, return.

Acceptance:

- 1000-user load test passes target SLOs.

## Phase 10: Release, Incident, And Compliance Maturity

Target score after phase: **100/100**

Goal: behave like a top-class production team.

### Step 10.1: Feature Flags

Do:

- Add feature flags by shop/environment.
- Use flags for AI execution, broadcasts, courier API booking, Meta send, payment gateway.

Acceptance:

- Risky feature can be enabled for one shop first.

### Step 10.2: Release Discipline

Do:

- Add release checklist.
- Add migration checklist.
- Add rollback checklist.
- Add changelog.
- Add versioned API docs.
- Add dependency/security scanning.

Acceptance:

- Release can be promoted staging -> production with signoff.

### Step 10.3: Incident Readiness

Do:

- Add incident severity levels.
- Add runbooks:
  - checkout failing,
  - DB down,
  - Redis down,
  - worker backlog,
  - webhook failure,
  - provider outage,
  - bad deploy,
  - backup failed.
- Run one incident drill.

Acceptance:

- Team can identify, mitigate, and document an incident.

### Step 10.4: Security Review

Do:

- Run dependency audit.
- Run basic SAST.
- Run manual permission review.
- Run tenant-isolation tests.
- Run file-upload abuse tests.
- Run pen test before public launch.
- Fix critical/high findings.

Acceptance:

- No known critical/high security findings remain.

## Final 100/100 Definition

Backend is 100/100 only when all are true:

- All DB tests pass in CI.
- Staging/prod environments are separate.
- Backups and restore drill work.
- S3/R2 storage and CDN are active.
- Real OTP/email/SMS works.
- Owner/admin MFA works.
- Legal/privacy/cookie/consent workflows work.
- Real Meta/courier/AI provider adapters work or are feature-flagged off.
- Risky action gateway covers all dangerous actions.
- Observability shows API, DB, worker, webhook, provider health.
- Ops admin can retry jobs/webhooks and inspect audit.
- Load test proves 1000+ users and 200 ms public storefront reads.
- Incident/release/rollback runbooks exist and were tested.
- No critical/high security findings remain.

## Shortcut Summary

Build order:

1. DB-backed CI.
2. Full test command.
3. Production env separation.
4. S3/R2 storage.
5. Backup/restore.
6. Logs/metrics/alerts.
7. Auth/MFA/OTP hardening.
8. Legal/privacy/cookies.
9. Real provider adapters.
10. Risky action gateway.
11. Ops admin queues.
12. Load tests/indexes/cache.
13. Feature flags/release/incident/security review.

Skip for now:

- Microservices.
- App marketplace.
- Complex BI builder.
- Enterprise SSO.
- Multi-warehouse.
- Loyalty points.
- Custom cache framework.

Add those only after 100/100 backend basics are real.

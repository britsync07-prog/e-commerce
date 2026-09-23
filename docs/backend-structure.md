# Backend Structure

Product: AI-first social-commerce platform for Facebook, Instagram, and online sellers doing roughly 0-200 COD orders/day.

## First Principles

- Multi-tenant from day one: every record belongs to a shop.
- AI never owns truth. Products, policies, stock, orders, payments, and courier state are source data.
- Risky actions need approval: cancel order, mark paid, refund, bulk message, courier booking, integration disconnect.
- Third-party failures keep local drafts and retry state.
- Audit every staff, AI, payment, stock, order, courier, and integration action.

## Core Modules

1. Identity and shops
   - Users, shops, staff roles, sessions, invitations.
   - Shop settings: country, currency, language, timezone, policies, subdomain.

2. Catalog and inventory
   - Products, variants, images, categories, active/inactive status.
   - Stock ledger, reserved stock, low-stock thresholds.
   - Product snapshots copied into orders.

3. Storefront and checkout
   - Theme settings, sections, product pages, cart, checkout form, tracking lookup.
   - COD and advance-payment rules.

4. Inbox and messaging
   - Messenger/Instagram conversations, messages, attachments, assignments.
   - AI drafts, confidence, source references, approval/send history.

5. Orders
   - Draft and confirmed orders from chat, website, staff, manual entry.
   - Status pipeline, issue queue, timeline, invoice/packing slip.

6. Delivery
   - Courier accounts, booking drafts, shipments, tracking events, failed delivery.
   - Manual courier mode for partners without API.

7. Payments
   - COD, advance, manual proof, marked-paid status, reconciliation, refund notes.
   - No real-money gateway claims unless provider confirms.

8. CRM and growth
   - Customers, addresses, tags, segments, coupons, campaigns, consent.

9. Ads and analytics
   - Meta pixel/CAPI, catalog feed, campaign stats, delivered-order revenue.
   - Metrics/events table for dashboards and AI reports.

10. AI automation
   - Command center, reply drafts, extraction, risk classification, action approvals.
   - Tool/action registry with permission and audit checks.

## Suggested Services

- API app: REST or RPC endpoints for dashboard/storefront.
- Worker app: imports, Meta webhooks, courier sync, payment proof processing, AI jobs, exports.
- Public storefront renderer: fast buyer pages by subdomain.
- Webhook receiver: Meta, courier, payment providers.
- Scheduler: retry jobs, tracking sync, report summaries, invite expiry, checkout link expiry.

## Core Infrastructure

- PostgreSQL: source of truth.
- Redis: cache, sessions, rate limits, idempotency keys, job locks.
- Queue/worker: imports, AI, webhooks, courier, payments, exports, analytics.
- Object storage: product images, logos, proof images, invoices, exports.
- CDN: storefront assets and images.
- Docker: local dev and production packaging.
- OpenAPI: dashboard/public API contract.

## Shared Backend Rules

- All writes require `shop_id`.
- All status changes write timeline/audit rows.
- All destructive actions require confirmation and permission.
- All AI-generated content is draft until approved where policy, price, payment, courier, or bulk messaging is involved.
- Stock reservation happens on order confirmation, not message intent.
- Cancellation releases stock; returns follow explicit status rules.
- Exports require permission and visible filter snapshot.
- Mutations with side effects use idempotency keys.
- External provider calls use timeout, retry, dead-letter, and manual fallback.
- Client cache is allowed for dashboard reads; server must re-check critical writes.

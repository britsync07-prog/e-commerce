# Feature Coverage Audit

Generated from `pdfs/`, `tasks/`, `docs/`, backend routes, migrations, API docs, and tests.

## Source Scope

- PDFs: `00` through `15`.
- Tasks: `task-1.txt` through `task-16.txt`.
- Note: `tasks/task-16.txt` duplicates PDF 15 / `task-15.txt`; there are 15 distinct product feature areas.
- Backend app: `backend/`.

## Status Legend

- Implemented: backed by routes, tables, docs, and smoke/integration coverage.
- Partial: backend foundation exists, but one or more requested production behaviors are missing/deferred.
- Missing: no meaningful backend implementation yet.

## Coverage Matrix

| PDF | Feature Area | Status | Applied Backend | Main Gaps |
|---|---|---:|---|---|
| 00 | Platform overview / roadmap | Partial | Multi-tenant users/shops, fixed roles, audit events, jobs, webhooks, AI command records, module registry. | Compliance tables are not explicit; AI action execution is not connected; full observability/error tracking is basic. |
| 01 | Onboarding / store setup | Partial | Start onboarding, owner/shop creation, subdomain check, shop draft, first product, skip Meta, AI mode, template choice, launch guard, audit, auth verification/reset foundation. | No CSV/Excel onboarding import mapping UI/API; launch guard allows template-only future path while templates are still test-only. |
| 02 | Website builder / themes / storefront | Partial | Storefront settings in shop settings, 5 production theme registry entries, SEO/policy/banners config, public shop/product reads, publish snapshot, domain retry status, checkout through orders API, tracking lookup. | No drag-drop builder V1 by design; custom domain provider verification is simulated until DNS/provider integration is connected. |
| 03 | Products / inventory | Implemented | Products, variants, images, import/export, stock ledger, stock adjustments, SKU conflict handling, order snapshots, stock reservation/release. | Import accepts JSON rows, not native Excel/CSV upload parsing. |
| 04 | AI inbox Messenger/Instagram | Partial | Conversations, messages, assignment, suggest-only AI drafts, confidence/source refs, review states, Meta webhook ingestion storage. | No outbound Meta send; no real LLM/provider; escalation is heuristic; auto-send intentionally absent. |
| 05 | Comment automation / lead capture | Partial | Social posts, comment rules, safe previews, lead capture, customer merge by phone, moderation records, signed Meta comment webhook processing, queued action dispatch records, audit. | No outbound public reply/DM sender yet; queued sends are marked `not_connected` until a real Meta sender is configured. |
| 06 | AI order confirmation / checkout forms | Partial | Order drafts, confidence/risk fields, missing-field validation, checkout, draft confirm, stock checks, cancellation keeps history. | No real AI extractor; no checkout-link expiry table/flow exposed. |
| 07 | Orders dashboard | Partial | Order list/detail, drafts, status pipeline, timeline, permission checks, status reason rules, stock release on cancel/return. | No bulk print/book/export endpoint; issue queue is limited to related delivery/payment records. |
| 08 | Delivery / courier | Partial | Manual courier booking, courier accounts/test status, queued API booking jobs, provider `not_connected` fallback, shipments, tracking events, failed delivery records, webhook-preferred status guard, reschedule flow, order timeline/audit sync. | No real courier provider adapter yet; no manual booking sheet export. |
| 09 | Payments / COD reconciliation | Implemented | Manual/COD payment records, proof asset reference, immutable payment events, refunds, COD settlements, unmatched rows, idempotency, audit/timeline. | Real payment gateway/bank confirmation intentionally not connected. |
| 10 | Customers / CRM / coupons / retention | Partial | Customers, addresses, tags, consent, merge preview/apply, coupons, saved segments, broadcast drafts/previews/approval, retention report. | No actual campaign sender; no advanced retention automation. |
| 11 | Ads tracking / Meta CAPI | Partial | Meta connections/OAuth shape, encrypted token storage path, catalog sync config/preview, queued catalog worker fallback, campaign stats import/report, delivered-vs-placed revenue. | No outbound CAPI/catalog provider adapter yet; real Meta app credentials required on VPS. |
| 12 | AI ad creative studio | Partial | Brand rules, saved templates, creative request/output storage, deterministic review-only drafts, safety warnings/blocks. | No real LLM/image generation provider; no ad-platform publishing; no competitor-text ingestion by design. |
| 13 | AI command center | Partial | Command records, risk classifier, citations, approval flow, audit, permission guard. | Approved actions do not execute; no undo/rollback executors. |
| 14 | Analytics dashboard | Partial | Metrics, orders report/export, analytics events, zero-state metrics, chart drill-down events. | AI insight generation is not connected; advanced dashboards are basic. |
| 15 | Team / settings / billing / security | Partial | Fixed roles, team management, owner transfer, settings, audit viewer, billing plan/usage/invoices, sessions/revoke, login events. | No paid billing provider; no enterprise SSO/custom roles; integration disconnect warning is only per-module behavior, not a unified warning flow. |

## Implemented Route Families

- `auth`, `shops`, `assets`, `catalog`, `inventory`, `onboarding`, `storefront`, `orders`, `delivery`, `payments`, `customers`, `marketing`, `meta`, `webhooks`, `analytics`, `ai`, `jobs`, `health`, `system`.

## Test Coverage Found

- Local default check: API-doc coverage, TypeScript build, onboarding integration.
- DB smoke tests exist for auth, catalog, permissions, orders, order dashboard, order drafts, delivery, inbox, payments, analytics, customers, Meta, AI command, jobs, worker, team/settings.

## Next Build Order

1. Close PDF 06 AI extraction and checkout-link expiry.
2. Close real courier/Meta provider adapters after credentials are available.
3. Close PDF 12 provider integration after a real LLM/image provider is selected.

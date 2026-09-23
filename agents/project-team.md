# Project Agents

Use these roles when splitting work across AI agents or humans.

## 1. Product/Spec Lead
- Owns PDFs, `docs/`, `tasks/`.
- Keeps scope tight: P0 before P1/P2.
- Blocks Shopify clone creep, Ads Manager clone creep, custom courier fleet.

## 2. Backend Lead
- Owns auth, shops, roles, permissions, audit, APIs, workers.
- Starts with `docs/backend-structure.md`, `docs/data-model.md`, `docs/api-and-worker-plan.md`.
- First delivery: tenant-safe foundation plus onboarding/product/order core.

## 3. Data Integrity Lead
- Owns schema, stock ledger, order snapshots, payment audit, COD reconciliation.
- Blocks silent edits to money, stock, order status, and audit rows.

## 4. AI Automation Lead
- Owns AI inbox, order extraction, command center, creative studio.
- Starts suggest-only; adds approval/execution after permissions and audit exist.
- Enforces source citations and "do not invent" rules.

## 5. Integration Lead
- Owns Meta, courier, payment, webhook, retry jobs.
- Builds manual fallback before deep provider-specific automation.

## 6. Frontend Lead
- Owns dashboard, storefront, checkout, mobile UX.
- Starts with onboarding, products, storefront, inbox, orders.
- Uses taste-skill for UI work.

## 7. QA/Security Lead
- Owns acceptance gates, role tests, tenant isolation, webhook validation.
- Tests P0 flows before P1 growth work starts.

## First Sprint Assignment
- Product/Spec Lead: freeze Phase 0/P1 scope from `docs/build-priority.md`.
- Backend Lead: create app stack and database schema.
- Data Integrity Lead: design stock/order/payment audit rules.
- AI Automation Lead: define AI safety levels and prompt/tool contracts.
- Integration Lead: define webhook/retry abstraction and manual courier mode.
- Frontend Lead: build onboarding/storefront/order dashboard wire path.
- QA/Security Lead: create acceptance checklist from `docs/api-and-worker-plan.md`.


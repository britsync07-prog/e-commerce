# Backend Modules

Modular monolith. Add real routes only when feature work starts.

Rules:
- Every business table/model belongs to one module and carries `shop_id`.
- Every mutation that changes money, stock, order, courier, AI, integration, or staff state writes audit/timeline.
- Every API route needs `backend/docs/api/<module>.md` in same change.
- Public reads can be cached. Critical writes re-check database truth.

Planned folders:
- `auth`: users, sessions, invitations.
- `shops`: shop settings, roles, permissions.
- `catalog`: products, variants, media.
- `inventory`: stock ledger, reservations.
- `inbox`: conversations, messages, assignments.
- `orders`: draft/confirmed orders, timeline.
- `delivery`: courier accounts, shipments, tracking.
- `payments`: COD ledger, proofs, reconciliation.
- `customers`: profiles, addresses, tags, consent.
- `marketing`: coupons, campaigns, broadcasts.
- `analytics`: events, reports, dashboards.
- `ai`: drafts, extraction, approvals.
- `settings`: policies, security, integrations.
- `webhooks`: provider event intake.
- `jobs`: queues, retries, dead letters.


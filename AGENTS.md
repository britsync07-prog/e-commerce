# Agent Instructions

## Project Source
- Product docs: `docs/`
- PDF task files: `tasks/task-1.txt` through `tasks/task-16.txt`
- Build order: `docs/build-priority.md`
- Backend shape: `docs/backend-structure.md`, `docs/data-model.md`, `docs/api-and-worker-plan.md`
- System design: `docs/system-design.md`, `docs/external-systems-checklist.md`
- Backend app: `backend/`

## Package Manager
- Backend uses npm:
```powershell
cd backend
npm install
npm run dev
npm run check
```

## Always-On Skills
- For architecture, "where is", flow, or implementation planning: check `graphify-out/graph.json`.
- If graph exists: run `graphify query "<question>"`, `graphify path "<A>" "<B>"`, or `graphify explain "<concept>"` before broad browsing.
- After code changes in a graphed project: run `graphify update .` when practical.
- For frontend redesign/landing/image-to-frontend: use `design-taste-frontend` / `taste-skill`.
- Use terse project updates; keep implementation notes factual.

## Build Discipline
- Start with Phase 0, then Phase 1 from `docs/build-priority.md`.
- Multi-tenant first: every business record needs `shop_id`.
- Permission, audit, and timeline checks are not optional.
- Use Docker for the real app stack.
- Use PostgreSQL as truth, Redis for cache/rate limits/jobs/idempotency, object storage for files.
- Client cache is allowed for reads only; server re-checks stock, payment, permission, and order writes.
- AI never invents price, stock, delivery charge, delivery date, payment status, or policy.
- Risky actions need explicit approval: cancel, mark paid, refund, bulk message, courier booking, disconnect, delete.
- Every backend API route must update `backend/docs/api/` in the same change.

## File-Scoped Commands
| Task | Command |
|------|---------|
| Find files | `rg --files` |
| Search text | `rg "text"` |
| Graph query | `graphify query "question"` |
| Graph update | `graphify update .` |
| Backend API docs check | `cd backend; npm run check:api-docs` |

## Commit Attribution
AI commits MUST include:
```
Co-Authored-By: (agent model name and attribution byline)
```

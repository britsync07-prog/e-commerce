# Migration Safety

## Required Checks

- Migration files must be named `NNN_short_description.sql`.
- Numbers must be contiguous: `001`, `002`, `003`, with no gaps or duplicates.
- `npm run check:migrations` validates file names, order, and non-empty SQL.
- `npm run check:full` runs migrations twice against the same database. The second run must pass without applying new files.

## Production Rules

- Migrations run as an explicit deploy step before app reload.
- Prefer additive changes: create table, add nullable column, add index, add enum-safe check only when existing data is valid.
- Do not drop columns/tables in the same deploy that removes code usage.
- Do not rewrite large tables during peak traffic.
- Do not add `not null` columns without a default/backfill plan.
- Do not rename columns directly; add new column, backfill, switch code, then remove old column in a later release.
- Destructive migrations need backup confirmation and explicit approval.

## Safe Change Pattern

1. Add new nullable column/table/index.
2. Deploy code that writes both old and new shape if needed.
3. Backfill in batches.
4. Switch reads to new shape.
5. Verify production metrics/logs.
6. Remove old shape in a later release.

## Rollback Policy

- Code rollback must be safe after migrations run.
- Schema changes should be backward-compatible for at least one deploy.
- If a migration fails, stop deploy before PM2 reload.
- Restore from backup only for data-loss or destructive-change incidents.

## Local And CI Commands

```powershell
cd backend
npm run check:migrations
npm run check:full
```

`check:full` requires a reachable Postgres database and Redis. CI provides both.

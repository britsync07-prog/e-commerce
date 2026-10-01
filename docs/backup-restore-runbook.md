# Backup And Restore Runbook

## Required Env

Set these in the deploy `.env` file:

```txt
BACKUP_DIR=/absolute/private/backup/path
BACKUP_RETENTION_DAYS=7
```

For restore drills only:

```txt
RESTORE_DATABASE_URL=postgres://user:password@host:port/staging_restore_db
```

Never set `RESTORE_DATABASE_URL` to production.

## Create DB Backup

```bash
APP_DIR=/absolute/path/to/app bash /absolute/path/to/app/ops/vps/backup-db.sh
```

Expected:

- Creates `db-YYYYMMDDTHHMMSSZ.dump`.
- Uses PostgreSQL custom format.
- Stores file with `600` permissions.
- Deletes old `db-*.dump` files older than `BACKUP_RETENTION_DAYS`.

## Verify Backup

```bash
pg_restore --list /absolute/private/backup/path/db-YYYYMMDDTHHMMSSZ.dump >/dev/null
```

## Restore Drill

Use staging or a disposable restore database:

```bash
APP_DIR=/absolute/path/to/app \
RESTORE_DATABASE_URL=postgres://user:password@host:port/staging_restore_db \
bash /absolute/path/to/app/ops/vps/restore-db.sh /absolute/private/backup/path/db-YYYYMMDDTHHMMSSZ.dump
```

After restore:

- Run backend smoke tests against restored database.
- Check tenant tables, orders, payments, assets metadata, audit events.
- Record drill date, backup file, restore target, result, and operator.

## Schedule

Run daily with cron or systemd timer:

```cron
15 2 * * * APP_DIR=/absolute/path/to/app bash /absolute/path/to/app/ops/vps/backup-db.sh >> /var/log/project-db-backup.log 2>&1
```

## Object Storage

When `STORAGE_DRIVER=s3`, enable bucket versioning/lifecycle policy in the object storage provider.

Required policy:

- Public images: versioning on, lifecycle cleanup by business retention policy.
- Private proofs/exports: versioning on, encrypted at rest, no public listing.
- Deletion follows privacy/retention workflow, not manual bucket cleanup.

## Redis Recovery

Redis is not source of truth.

- Cache can be flushed and rebuilt.
- Jobs/webhooks must be persisted in PostgreSQL before async processing.
- Idempotency and payment/order state stay in PostgreSQL.


# Operations Alerts

## Required Env

Set these in deploy `.env`:

```txt
HEALTHCHECK_URL=https://api.example.com/api/v1/health/ready
METRICS_URL=https://api.example.com/api/v1/health/metrics
BACKUP_MAX_AGE_HOURS=26
```

Optional:

```txt
ALERT_WEBHOOK_URL=https://hooks.example.com/services/project-alerts
HEALTHCHECK_TIMEOUT_SECONDS=10
```

`ALERT_WEBHOOK_URL` must stay in environment or secret manager, never source.

## Manual Check

```bash
APP_DIR=/absolute/path/to/app bash /absolute/path/to/app/ops/vps/check-backend-health.sh
```

Checks:

- API readiness endpoint returns success.
- Metrics endpoint accepts `METRICS_TOKEN`.
- Latest `db-*.dump` backup is newer than `BACKUP_MAX_AGE_HOURS`.

## Cron

Run every 5 minutes:

```cron
*/5 * * * * APP_DIR=/absolute/path/to/app bash /absolute/path/to/app/ops/vps/check-backend-health.sh >> /var/log/project-healthcheck.log 2>&1
```

## Incident: API Not Ready

1. Check PM2 state for this project only.
2. Check recent backend logs.
3. Check database connectivity.
4. If deploy caused it, roll back to previous known good commit and rerun deploy.
5. Record incident time, cause, fix, and follow-up.

## Incident: Backup Failed Or Stale

1. Run `ops/vps/backup-db.sh` manually.
2. Verify with `pg_restore --list`.
3. Check free disk space and Postgres access.
4. Fix cron/systemd schedule if manual backup works.
5. Record restore drill date after fix.


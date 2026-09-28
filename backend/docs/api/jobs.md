# Jobs API

Purpose: Manage durable background jobs backed by PostgreSQL outbox records, bounded retries, row-lock claiming, and dead-letter recovery.

Auth: Bearer session. Enqueue/retry requires `settings:write`; listing requires `settings:read`.

## `POST /shops/:shopId/jobs`

Request: `{ "queue": "imports|ai|webhooks|courier|payments|exports|analytics", "jobType": "meta.catalog.sync", "payload": {}, "maxAttempts": 5 }`.

Response: `201` with the pending job.

Side effects: Adds one durable pending job. It does not execute the job in the API request.

Audit/timeline: Writes `job.enqueued` audit.

Cache: Do not cache.

Errors: `SHOP_ACCESS_DENIED`, `PERMISSION_DENIED`, `VALIDATION_ERROR`.

## `GET /shops/:shopId/jobs`

Request: Path `shopId` UUID. Optional `status` and `limit` (1-100).

Response: `{ "jobs": [{ "status": "pending", "attempts": 0, "max_attempts": 5, "run_after": "..." }] }`.

Side effects: None.

Audit/timeline: None for reads.

Cache: Client may cache briefly; refetch after enqueue or retry.

Errors: `SHOP_ACCESS_DENIED`, `PERMISSION_DENIED`, `VALIDATION_ERROR`.

## `GET /shops/:shopId/jobs/stats`

Request: Path `shopId` UUID.

Response:

```json
{
  "byStatus": { "pending": 3, "failed": 1, "dead": 1 },
  "byQueue": { "analytics": 2, "imports": 3 },
  "oldestPendingRunAfter": "2026-09-28T15:30:00.000Z"
}
```

Side effects: None.

Audit/timeline: None for reads.

Cache: Client may cache briefly; refetch after enqueue, retry, or worker runs.

Errors: `SHOP_ACCESS_DENIED`, `PERMISSION_DENIED`, `VALIDATION_ERROR`.

## `POST /shops/:shopId/jobs/:jobId/retry`

Request: `{ "reason": "Provider outage resolved; retry the import" }`.

Response: Job reset to `pending` with attempts reset to zero.

Side effects: Only dead jobs can be manually requeued. Workers claim jobs with row locks, back off retryable failures, and move exhausted/non-retryable failures to `dead`.

Audit/timeline: Writes `job.retried` audit with the operator reason.

Cache: Do not cache.

Errors: `JOB_NOT_RETRYABLE`, `SHOP_ACCESS_DENIED`, `PERMISSION_DENIED`, `VALIDATION_ERROR`.

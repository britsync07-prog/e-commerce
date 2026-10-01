# Health API

## `GET /api/v1/health`

Purpose:
- Confirms API process is alive.

Auth:
- Public.

Request:
- No body.
- Optional `x-request-id` header.

Response:

```json
{
  "status": "ok"
}
```

Side effects:
- Adds/echoes `x-request-id` response header.

Audit/timeline:
- None. Health checks do not write audit rows.

Cache:
- Do not cache.

Errors:
- `500` if process cannot handle request.

## `GET /api/v1/health/ready`

Purpose:
- Confirms API dependencies needed to serve traffic are reachable.

Auth:
- Public.

Request:
- No body.
- Optional `x-request-id` header.

Response:

```json
{
  "status": "ready",
  "checks": {
    "database": "ok"
  }
}
```

Side effects:
- Adds/echoes `x-request-id` response header.
- Runs a lightweight database query.

Audit/timeline:
- None. Readiness checks do not write audit rows.

Cache:
- Do not cache.

Errors:
- `503` with `status: "not_ready"` if the database check fails.

## `GET /api/v1/health/metrics`

Purpose:
- Returns lightweight in-process request counters and latency summaries.

Auth:
- Requires `x-metrics-token` or `Authorization: Bearer <token>` when `METRICS_TOKEN` is configured.

Response:

```json
{
  "startedAt": "2026-10-01T00:00:00.000Z",
  "uptimeSeconds": 120,
  "totalRequests": 12,
  "totalErrors": 0,
  "routes": [
    {
      "method": "GET",
      "route": "/api/v1/health",
      "count": 10,
      "errorCount": 0,
      "avgMs": 1.2,
      "maxMs": 4.5,
      "status": { "200": 10 }
    }
  ]
}
```

Errors:
- `403 METRICS_FORBIDDEN`

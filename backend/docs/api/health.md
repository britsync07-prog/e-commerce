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

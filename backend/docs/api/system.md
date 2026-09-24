# System API

Base path: `/api/v1/system`

Purpose:
- Shows current backend module map.
- Separates active APIs from planned backend boundaries.
- Lets dashboard/dev tooling verify which modules exist before calling them.

Auth:
- Public for now.
- Production rule: keep module status public-safe; hide operational internals behind admin permission.

## `GET /modules`

Request:
- No params.
- No body.

Response:

```json
{
  "modules": [
    {
      "key": "onboarding",
      "name": "Onboarding and store setup",
      "status": "active",
      "owns": ["owner start", "shop draft"],
      "apiBase": "/api/v1/onboarding",
      "apiDoc": "onboarding.md",
      "phase": "p0"
    }
  ]
}
```

Side effects:
- None.

Audit/timeline:
- None. Read-only system discovery.

Cache:
- Client can cache briefly.
- Refetch after deploy.

Errors:
- `500` if API process cannot build module response.


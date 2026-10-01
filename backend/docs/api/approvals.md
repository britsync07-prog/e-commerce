# Approvals API

Base path: `/api/v1/approvals`

Purpose:
- Create a reviewed approval request before risky backend actions.
- Show the action preview before approval.
- Approve, execute, reject, and audit risky actions.

Auth:
- All endpoints require a bearer session.
- Read endpoints require `approvals:read`.
- Create/approve/reject endpoints require `approvals:write`.

## `GET /shops/:shopId/approvals`

Request:
- Path: `shopId`
- Optional query: `status`, `limit`

Response:
- `200`

```json
{
  "approvals": [
    {
      "id": "uuid",
      "action_type": "job.retry",
      "target_type": "outbox_job",
      "target_id": "uuid",
      "status": "pending",
      "preview": {
        "effect": "Reset job to pending with attempts=0 and clear last error."
      }
    }
  ]
}
```

Side effects:
- None.

Audit/timeline:
- None for reads.

Cache:
- Do not cache.

Errors:
- `401 AUTH_REQUIRED`
- `403 PERMISSION_DENIED`

## `POST /shops/:shopId/approvals`

Request:

```json
{
  "actionType": "job.retry",
  "targetId": "uuid",
  "reason": "Retry after provider outage was fixed."
}
```

Response:
- `201`

```json
{
  "approval": {
    "id": "uuid",
    "action_type": "job.retry",
    "target_type": "outbox_job",
    "target_id": "uuid",
    "status": "pending",
    "preview": {
      "job": { "id": "uuid", "status": "dead" },
      "effect": "Reset job to pending with attempts=0 and clear last error."
    }
  }
}
```

Side effects:
- Inserts `action_approvals`.

Audit/timeline:
- Writes `approval.requested` to `audit_events`.

Cache:
- Do not cache.

Errors:
- `400 VALIDATION_ERROR`
- `401 AUTH_REQUIRED`
- `403 PERMISSION_DENIED`
- `404 JOB_NOT_FOUND`
- `409 JOB_NOT_RETRYABLE`

## `POST /shops/:shopId/approvals/:approvalId/approve`

Request:

```json
{
  "reason": "Reviewed job payload and confirmed retry is safe."
}
```

Response:
- `200`

```json
{
  "approval": {
    "id": "uuid",
    "status": "executed",
    "result": {
      "job": { "id": "uuid", "status": "pending" }
    }
  }
}
```

Side effects:
- Marks approval approved.
- Executes the risky action.
- For `job.retry`, resets the dead job to pending.

Audit/timeline:
- Writes `job.retried` from the job module.
- Writes `approval.executed` to `audit_events`.

Cache:
- Do not cache.

Errors:
- `401 AUTH_REQUIRED`
- `403 PERMISSION_DENIED`
- `404 APPROVAL_NOT_FOUND`
- `409 APPROVAL_NOT_PENDING`

## `POST /shops/:shopId/approvals/:approvalId/reject`

Request:

```json
{
  "reason": "Payload needs manual inspection first."
}
```

Response:
- `200`

```json
{
  "approval": {
    "id": "uuid",
    "status": "rejected",
    "result": { "reason": "Payload needs manual inspection first." }
  }
}
```

Side effects:
- Marks approval rejected.

Audit/timeline:
- Writes `approval.rejected` to `audit_events`.

Cache:
- Do not cache.

Errors:
- `401 AUTH_REQUIRED`
- `403 PERMISSION_DENIED`
- `404 APPROVAL_NOT_FOUND`
- `409 APPROVAL_NOT_PENDING`

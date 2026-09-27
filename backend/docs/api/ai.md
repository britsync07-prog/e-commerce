# AI Command Center API

Purpose: Record AI questions, drafts, and requested actions with tenant permission checks, risk classification, source citations, and explicit approvals.

Auth: Bearer session. Command permissions are derived from the requested action. Approvals require `settings:write`.

## `POST /shops/:shopId/commands`

Request: `{ "prompt": "Show my latest orders", "actionType": "question|draft|action" }`.

Response: `201` with a command containing `risk_level`, `required_permission`, `status`, `preview`, and `citations`.

Side effects: Stores the command. Questions are `drafted`; drafts and actions are `awaiting_approval`.

Audit/timeline: Writes `ai.command_created` with risk and required permission.

Cache: Do not cache command creation or approval state.

Errors: `SHOP_ACCESS_DENIED`, `PERMISSION_DENIED`, `VALIDATION_ERROR`.

## `GET /shops/:shopId/commands`

Request: Path `shopId` UUID.

Response: `{ "commands": [{ "status": "awaiting_approval", "risk_level": "high", "citations": [] }] }`.

Side effects: None.

Audit/timeline: None for read-only listing.

Cache: Client may cache briefly; refetch after creating or approving a command.

Errors: `SHOP_ACCESS_DENIED`, `PERMISSION_DENIED`, `VALIDATION_ERROR`.

## `POST /shops/:shopId/commands/:commandId/approve`

Request: `{ "reason": "Reviewed the preview and approve this action" }`.

Response: Command with `status: "approved"`.

Side effects: Records the approving user and reason. No business action executes because the action executor is not connected yet.

Audit/timeline: Writes `ai.command_approved`; approval reason is preserved.

Cache: Do not cache.

Errors: `AI_COMMAND_NOT_APPROVABLE`, `SHOP_ACCESS_DENIED`, `PERMISSION_DENIED`, `VALIDATION_ERROR`.

Safety: The classifier blocks access outside the connected shop through permission guards. Risky actions require approval. Undo is not advertised because no rollback-capable executor exists.

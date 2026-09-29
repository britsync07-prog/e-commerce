# AI Command Center API

Purpose: Record AI questions, drafts, requested actions, and review-only ad creative drafts with tenant permission checks, risk classification, source citations, and explicit approvals.

Auth: Bearer session. Command permissions are derived from the requested action. Approvals require `settings:write`. Ad creative reads require `marketing:read`; ad creative writes require `marketing:write`.

## `GET /shops/:shopId/brand-rules`

Request: Path `shopId` UUID.

Response: `{ "brandRules": { "rules": {}, "banned_claims": [], "default_language": "bn-en", "default_tone": "friendly" } }` or `{ "brandRules": null }`.

Side effects: None.

Audit/timeline: None.

Cache: Client may cache briefly; refetch after updates.

Errors: `SHOP_ACCESS_DENIED`, `PERMISSION_DENIED`, `VALIDATION_ERROR`.

## `PUT /shops/:shopId/brand-rules`

Request: `{ "rules": { "brandVoice": "helpful", "mustUse": ["COD"], "mustAvoid": ["guaranteed cure"], "requiredDisclaimers": ["Stock changes quickly"] }, "bannedClaims": ["instant cure"], "defaultLanguage": "bn-en", "defaultTone": "friendly" }`.

Response: `{ "brandRules": { ... } }`.

Side effects: Creates or updates one brand-rules row for the shop.

Audit/timeline: Writes `ai.brand_rules_updated`.

Cache: Invalidate brand rules and creative draft screens.

Errors: `SHOP_ACCESS_DENIED`, `PERMISSION_DENIED`, `VALIDATION_ERROR`.

## `GET /shops/:shopId/creative-templates`

Request: Path `shopId` UUID.

Response: `{ "templates": [{ "id": "uuid", "name": "Caption base", "format": "caption", "status": "active" }] }`.

Side effects: None.

Audit/timeline: None.

Cache: Client may cache briefly.

Errors: `SHOP_ACCESS_DENIED`, `PERMISSION_DENIED`, `VALIDATION_ERROR`.

## `POST /shops/:shopId/creative-templates`

Request: `{ "name": "Caption base", "format": "caption", "template": { "structure": "hook, value, CTA" } }`.

Response: `201` with `{ "template": { ... } }`.

Side effects: Stores a reusable creative template for this shop.

Audit/timeline: Writes `ai.creative_template_created`.

Cache: Invalidate creative template lists.

Errors: `AI_CREATIVE_TEMPLATE_CONFLICT`, `SHOP_ACCESS_DENIED`, `PERMISSION_DENIED`, `VALIDATION_ERROR`.

## `POST /shops/:shopId/ad-creatives`

Request: `{ "productId": "uuid", "templateId": "uuid", "objective": "sell new arrivals", "offer": "10% off today", "audience": "new buyers in Dhaka", "language": "bn-en", "tone": "friendly" }`.

Response: `201` with `{ "request": { "status": "awaiting_review", "safety_result": [] }, "outputs": [{ "format": "caption", "status": "review_only", "content": "..." }] }`.

Side effects: Stores the request and deterministic review-only creative outputs. If blocked claims are detected, stores a `blocked` request and no usable output. No ad is published and no budget is changed.

Audit/timeline: Writes `ai.ad_creative_requested`.

Cache: Do not cache creation responses.

Errors: `PRODUCT_NOT_FOUND`, `AI_CREATIVE_TEMPLATE_NOT_FOUND`, `SHOP_ACCESS_DENIED`, `PERMISSION_DENIED`, `VALIDATION_ERROR`.

## `GET /shops/:shopId/ad-creatives`

Request: Path `shopId` UUID. Optional `productId` and `limit`.

Response: `{ "requests": [{ "id": "uuid", "product_id": "uuid", "status": "awaiting_review", "safety_result": [] }] }`.

Side effects: None.

Audit/timeline: None.

Cache: Client may cache briefly; refetch after creating drafts.

Errors: `SHOP_ACCESS_DENIED`, `PERMISSION_DENIED`, `VALIDATION_ERROR`.

## `GET /shops/:shopId/ad-creatives/:requestId`

Request: Path `shopId` and `requestId` UUIDs.

Response: `{ "request": { ... }, "outputs": [{ "format": "headline", "content": "..." }] }`.

Side effects: None.

Audit/timeline: None.

Cache: Client may cache reviewed records. Draft review screens should refetch before use.

Errors: `AI_AD_CREATIVE_NOT_FOUND`, `SHOP_ACCESS_DENIED`, `PERMISSION_DENIED`, `VALIDATION_ERROR`.

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

Safety: The classifier blocks access outside the connected shop through permission guards. Risky actions require approval. Undo is not advertised because no rollback-capable executor exists. Ad creative safety blocks medical, financial, unrealistic guarantee, and competitor-copy claims; superlatives produce warnings. AI never invents price, stock, delivery dates, payment status, or policy, and ad creative outputs remain review-only.

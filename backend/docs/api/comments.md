# Comments API

Purpose: manage Facebook/Instagram post comment automation, lead capture, moderation queues, and safe preview-only DM/public reply drafts.

Auth: bearer session. Reads require `marketing:read`; writes require `marketing:write`.

No route sends a real Meta reply or DM in this phase. The API stores local drafts/previews so staff can inspect exactly what a buyer would receive.

## `GET /shops/:shopId/posts`

Request: path `shopId` UUID. Optional query `status` and `limit`.

Response: `{ "posts": [{ "id": "uuid", "platform": "facebook", "external_post_id": "post-1", "lead_count": 2, "dm_count": 1 }] }`.

Side effects: none.

Audit/timeline: none for reads.

Cache: client may cache briefly; refetch after post/rule/lead changes.

Errors: `SHOP_ACCESS_DENIED`, `PERMISSION_DENIED`, `VALIDATION_ERROR`.

## `POST /shops/:shopId/posts`

Request: `{ "platform": "facebook|instagram", "externalPostId": "post-1", "mediaUrl": "https://...", "caption": "New drop", "linkedProductId": "uuid", "status": "active" }`.

Response: `201` with `{ "post": { ... } }`.

Side effects: stores or rejects a shop-scoped social post reference.

Audit/timeline: writes `comment.post_created`.

Cache: do not cache write response.

Errors: `POST_CONFLICT`, `PRODUCT_NOT_FOUND`, `SHOP_ACCESS_DENIED`, `PERMISSION_DENIED`, `VALIDATION_ERROR`.

## `PATCH /shops/:shopId/posts/:postId`

Purpose: link/unlink products and pause/archive a post.

Request: any of `mediaUrl`, `caption`, `linkedProductId`, `status`.

Response: `{ "post": { ... } }`.

Side effects: updates the post.

Audit/timeline: writes `comment.post_updated`.

Cache: invalidate post, lead, and preview reads.

Errors: `POST_NOT_FOUND`, `PRODUCT_NOT_FOUND`, `SHOP_ACCESS_DENIED`, `PERMISSION_DENIED`, `VALIDATION_ERROR`.

## `GET /shops/:shopId/rules`

Request: path `shopId` UUID. Optional query `status` and `limit`.

Response: `{ "rules": [{ "id": "uuid", "keywords": ["price"], "limit_per_hour": 20 }] }`.

Side effects: none.

Audit/timeline: none for reads.

Cache: client may cache briefly.

Errors: `SHOP_ACCESS_DENIED`, `PERMISSION_DENIED`, `VALIDATION_ERROR`.

## `POST /shops/:shopId/rules`

Request: `{ "postId": "uuid|null", "name": "Price replies", "keywords": ["price", "pp"], "language": "bn-en", "publicReplyTemplate": "Sent details for {{product_name}}", "dmTemplate": "{{product_name}} price is {{price}}", "delaySeconds": 60, "limitPerHour": 20 }`.

Response: `201` with `{ "rule": { ... }, "warnings": ["RULE_TOO_BROAD"] }`.

Side effects: creates an automation rule. Broad rules are warned, not blocked, so staff can fix them before using previews.

Audit/timeline: writes `comment.rule_created`.

Cache: invalidate rule and preview reads.

Errors: `POST_NOT_FOUND`, `SHOP_ACCESS_DENIED`, `PERMISSION_DENIED`, `VALIDATION_ERROR`.

## `POST /shops/:shopId/comments/preview`

Purpose: classify one incoming comment and show the exact public reply/DM draft without storing a lead or sending anything.

Request: `{ "postId": "uuid", "platform": "facebook", "commenterExternalId": "buyer-1", "commenterName": "Buyer", "commentText": "price?" }`.

Response: `{ "intent": "purchase_interest", "sentiment": "neutral", "matchedRule": { ... }, "safety": { "autoDmAllowed": true, "requiresReview": false }, "preview": { "publicReply": "...", "dm": "...", "sending": "not_connected" } }`.

Side effects: none.

Audit/timeline: none for preview.

Cache: do not cache final send decisions; inventory/product data can change.

Errors: `POST_NOT_FOUND`, `SHOP_ACCESS_DENIED`, `PERMISSION_DENIED`, `VALIDATION_ERROR`.

## `POST /shops/:shopId/comments/capture`

Purpose: store a lead from an incoming comment, merge with an existing customer when a phone is supplied, and queue unsafe comments for review.

Request: `{ "postId": "uuid", "platform": "facebook", "externalCommentId": "comment-1", "commenterExternalId": "buyer-1", "commenterName": "Buyer", "commentText": "price?", "customerPhone": "+880..." }`.

Response: `201` with `{ "lead": { ... }, "automation": { ...preview shape... } }`.

Side effects: inserts or reuses a `comment_leads` row, may create/reuse a customer by phone, stores preview text, creates local automation action records for allowed reply/DM drafts, rate-limits those local actions per rule, and creates a moderation record for angry/spam/unsafe/rate-limited comments. It does not send a DM.

Audit/timeline: writes `comment.lead_captured`; moderation records preserve review state.

Cache: invalidate lead board, post stats, customer reads when a customer is linked.

Errors: `POST_NOT_FOUND`, `SHOP_ACCESS_DENIED`, `PERMISSION_DENIED`, `VALIDATION_ERROR`.

## `GET /shops/:shopId/leads`

Request: optional query `status` and `limit`.

Response: `{ "leads": [{ "id": "uuid", "intent": "purchase_interest", "dm_status": "drafted", "status": "dm_drafted" }] }`.

Side effects: none.

Audit/timeline: none for reads.

Cache: client may cache briefly.

Errors: `SHOP_ACCESS_DENIED`, `PERMISSION_DENIED`, `VALIDATION_ERROR`.

## `POST /shops/:shopId/leads/:leadId/moderation`

Request: `{ "hidden": true, "reason": "Spam comment", "assignedStaffId": "uuid|null", "staffAction": "hidden" }`. `reason` is required when hiding.

Response: `201` with `{ "moderation": { ... } }`.

Side effects: appends a moderation record and can close the lead.

Audit/timeline: writes `comment.moderated`. Hide actions keep an audit trail instead of deleting comments.

Cache: invalidate moderation queues and lead reads.

Errors: `LEAD_NOT_FOUND`, `SHOP_ACCESS_DENIED`, `PERMISSION_DENIED`, `VALIDATION_ERROR`.

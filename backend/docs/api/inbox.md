# Inbox API

Base path: `/api/v1/inbox`

Purpose:
- Store Messenger, Instagram, and manual conversations.
- Store buyer/staff messages with intent and sentiment hints.
- Generate suggest-only AI reply drafts with source references.
- Support assignment and draft review without auto-sending.

Auth:
- All endpoints require Bearer auth.
- Read endpoints require `inbox:read`.
- Write endpoints require `inbox:write`.

## `GET /shops/:shopId/conversations`

Request:
- Path `shopId`: shop UUID.
- Query `status`: optional `open`, `pending`, `closed`.
- Query `limit`: optional number from `1` to `100`, default `50`.

Response:
- `200`

```json
{
  "conversations": [
    {
      "id": "uuid",
      "channel": "messenger",
      "buyer_external_id": "psid",
      "buyer_name": "Buyer Name",
      "intent": "price",
      "assigned_staff_id": "uuid",
      "ai_paused": false,
      "status": "open",
      "last_message_body": "price?",
      "buyer_message_count": 1
    }
  ]
}
```

Side effects:
- None.

Audit/timeline:
- None for reads.

Cache:
- Client-side cache is allowed for short dashboard reads.
- Refetch after messages, assignment, or draft review.

Errors:
- `400 VALIDATION_ERROR`
- `401 AUTH_REQUIRED`
- `403 PERMISSION_DENIED`

## `POST /shops/:shopId/conversations`

Purpose:
- Create or update a conversation shell.
- Optionally store the first buyer message.

Request:

```json
{
  "channel": "manual",
  "buyerExternalId": "buyer-123",
  "buyerName": "Buyer Name",
  "buyerPhone": "+8801700000000",
  "message": "Is the black shirt available?"
}
```

Response:
- `201`
- Same shape as conversation detail.

Side effects:
- Inserts or updates `conversations`.
- Optionally inserts `conversation_messages`.
- Updates `last_message_at`.
- Writes audit action `inbox.conversation_created`.

Audit/timeline:
- Audit target type: `conversation`.

Cache:
- Do not cache write response.
- Invalidate conversation list/detail.

Errors:
- `400 VALIDATION_ERROR`
- `401 AUTH_REQUIRED`
- `403 PERMISSION_DENIED`

## `GET /shops/:shopId/conversations/:conversationId`

Request:
- Path `shopId`: shop UUID.
- Path `conversationId`: conversation UUID.

Response:
- `200`

```json
{
  "conversation": {
    "id": "uuid",
    "channel": "manual",
    "buyer_external_id": "buyer-123",
    "status": "open"
  },
  "messages": [
    {
      "id": "uuid",
      "source": "buyer",
      "body": "Is the black shirt available?",
      "intent": "availability",
      "sentiment": "neutral"
    }
  ],
  "drafts": [
    {
      "id": "uuid",
      "status": "suggested",
      "body": "Black Shirt is available...",
      "confidence": "0.780",
      "source_refs": []
    }
  ]
}
```

Side effects:
- None.

Audit/timeline:
- None for reads.

Cache:
- Client-side cache is allowed briefly.

Errors:
- `400 VALIDATION_ERROR`
- `401 AUTH_REQUIRED`
- `403 PERMISSION_DENIED`
- `404 CONVERSATION_NOT_FOUND`

## `POST /shops/:shopId/conversations/:conversationId/messages`

Purpose:
- Add buyer or staff message to an existing conversation.
- This stores the record only; it does not call Meta or send a real message.

Request:

```json
{
  "source": "buyer",
  "body": "What is the price?",
  "externalMessageId": "mid.123"
}
```

Response:
- `201`
- Same shape as conversation detail.

Side effects:
- Inserts `conversation_messages`.
- Updates conversation intent and `last_message_at`.
- Writes audit action `inbox.message_added`.

Audit/timeline:
- Audit target type: `conversation`.

Cache:
- Do not cache write response.
- Invalidate conversation list/detail.

Errors:
- `400 VALIDATION_ERROR`
- `401 AUTH_REQUIRED`
- `403 PERMISSION_DENIED`
- `404 CONVERSATION_NOT_FOUND`

## `PATCH /shops/:shopId/conversations/:conversationId/assignment`

Purpose:
- Assign or unassign a conversation to active shop staff.

Request:

```json
{
  "assignedStaffId": "uuid"
}
```

Use `null` to unassign.

Response:
- `200`
- Same shape as conversation detail.

Side effects:
- Updates `assigned_staff_id`.
- Writes audit action `inbox.conversation_assigned`.

Audit/timeline:
- Audit metadata stores assigned staff ID.

Cache:
- Do not cache write response.
- Invalidate conversation list/detail.

Errors:
- `400 VALIDATION_ERROR`
- `401 AUTH_REQUIRED`
- `403 PERMISSION_DENIED`
- `404 CONVERSATION_NOT_FOUND`
- `409 STAFF_NOT_IN_SHOP`

## `POST /shops/:shopId/conversations/:conversationId/ai-drafts`

Purpose:
- Generate a suggest-only reply draft from the latest buyer message.
- Uses product/stock data as source references.
- Never sends automatically.

Request:
- No body.

Response:
- `201`

```json
{
  "draft": {
    "id": "uuid",
    "status": "suggested",
    "body": "Black Shirt is available. Price is 500.00 BDT...",
    "confidence": "0.780",
    "source_refs": [
      {
        "type": "product",
        "id": "uuid",
        "name": "Black Shirt",
        "price": "500.00",
        "currency": "BDT",
        "stock": 4
      }
    ]
  }
}
```

Side effects:
- Inserts `ai_reply_drafts`.
- Writes audit action `inbox.ai_draft_created`.
- Sensitive, low-confidence, or unavailable-stock messages become `needs_review`.

Audit/timeline:
- Audit target type: `ai_reply_draft`.

Cache:
- Do not cache write response.
- Invalidate conversation detail.

Errors:
- `400 VALIDATION_ERROR`
- `401 AUTH_REQUIRED`
- `403 PERMISSION_DENIED`
- `404 CONVERSATION_NOT_FOUND`
- `409 AI_PAUSED`
- `409 BUYER_MESSAGE_REQUIRED`

## `PATCH /shops/:shopId/conversations/:conversationId/ai-drafts/:draftId/review`

Purpose:
- Approve or reject a suggested draft.
- Approval is only review state; it does not send externally.

Request:

```json
{
  "status": "approved",
  "note": "Looks correct"
}
```

Response:
- `200`
- Same shape as conversation detail.

Side effects:
- Updates draft status and reviewer fields.
- Writes audit action `inbox.ai_draft_reviewed`.

Audit/timeline:
- Audit target type: `ai_reply_draft`.

Cache:
- Do not cache write response.
- Invalidate conversation detail.

Errors:
- `400 VALIDATION_ERROR`
- `401 AUTH_REQUIRED`
- `403 PERMISSION_DENIED`
- `404 DRAFT_NOT_FOUND`

## `GET /shops/:shopId/ai-brain`

Purpose:
- Retrieve the shop's AI Brain configuration (tone, language, persona, system prompt, and fallback message).

Auth:
- Requires Bearer auth and `inbox:read` permission.

Request:
- Path `shopId`: shop UUID.

Response:
- `200`
```json
{
  "aiBrain": {
    "enabled": true,
    "shopName": "Saimon Fashion",
    "tone": "friendly",
    "language": "auto",
    "systemPrompt": "You are a helpful sales assistant...",
    "confidenceThreshold": 0.70,
    "fallbackMessage": "ধন্যবাদ আপনার বার্তার জন্য!"
  }
}
```

Side effects:
- None.

Audit/timeline:
- None for read.

Cache:
- Client-side cache allowed for settings screen.

Errors:
- `401 AUTH_REQUIRED`
- `403 PERMISSION_DENIED`
- `404 SHOP_NOT_FOUND`

## `PATCH /shops/:shopId/ai-brain`

Purpose:
- Update the shop's AI Brain configuration.

Auth:
- Requires Bearer auth and `inbox:write` permission.

Request:
```json
{
  "enabled": true,
  "shopName": "Saimon Fashion",
  "tone": "polite",
  "systemPrompt": "Custom sales persona and rules...",
  "confidenceThreshold": 0.75,
  "fallbackMessage": "Custom fallback..."
}
```

Response:
- `200` with updated `aiBrain` object.

Side effects:
- Updates `shops.ai_brain` column.
- Writes audit action `inbox.ai_brain_updated`.

Audit/timeline:
- Audit target type: `shop`.

Cache:
- Do not cache. Invalidate settings cache.

Errors:
- `400 VALIDATION_ERROR`
- `401 AUTH_REQUIRED`
- `403 PERMISSION_DENIED`
- `404 SHOP_NOT_FOUND`

## `PATCH /shops/:shopId/conversations/:conversationId/ai-toggle`

Purpose:
- Turn AI auto-reply ON or OFF for a specific customer conversation.

Auth:
- Requires Bearer auth and `inbox:write` permission.

Request:
```json
{
  "aiEnabled": false
}
```

Response:
- `200`
```json
{
  "conversation": {
    "id": "uuid",
    "ai_enabled": false,
    "ai_paused": false
  }
}
```

Side effects:
- Updates `conversations.ai_enabled`.
- Writes audit action `inbox.conversation_ai_toggled`.

Audit/timeline:
- Audit target type: `conversation`.

Cache:
- Invalidate conversation detail cache.

Errors:
- `400 VALIDATION_ERROR`
- `401 AUTH_REQUIRED`
- `403 PERMISSION_DENIED`
- `404 CONVERSATION_NOT_FOUND`


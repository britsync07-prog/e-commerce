# Automation Backend

## AI Safety Levels

1. Suggest: AI drafts reply/copy/description only.
2. Draft: AI creates editable draft object.
3. Ask approval: AI prepares action preview and waits.
4. Execute: only allowed for safe actions and permitted users.

High-risk actions always need approval:

- Cancel order.
- Mark paid/refund.
- Book courier.
- Bulk message/broadcast.
- Delete/disconnect.
- Publish policy changes.

## Jobs Needed First

- Product import validation and row errors.
- Meta webhook ingestion for messages/comments.
- AI reply draft generation.
- Order detail extraction from chat.
- Stock reservation/release.
- Courier booking retry.
- Courier tracking sync.
- Audit/timeline writer.
- Checkout link expiry.

## Jobs Needed Later

- COD reconciliation import/match.
- Customer merge suggestions.
- Segment refresh.
- Campaign sending with opt-out/rate limits.
- Meta CAPI event delivery.
- Catalog sync.
- Weekly analytics summary.
- Suspicious staff action detection.

## Automation Rules

- AI must cite internal source for product, policy, order, payment, and delivery answers.
- AI must never invent price, stock, delivery charge, delivery date, payment status, or policy.
- If source data is missing, AI asks one question or says what is missing.
- Auto-reply allowed only for low-risk intents; complaint/refund/legal/VIP goes human.
- All auto-sent messages are searchable in audit log.


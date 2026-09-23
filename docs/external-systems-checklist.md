# External Systems Checklist

Use this before adding any provider.

## Required Fields

- provider name
- shop id
- credential reference
- enabled/disabled status
- scopes/permissions granted
- last success time
- last failure time
- last error
- retry count
- provider account/page/store id

## Required Behaviors

- Test connection before enabling.
- Show exact missing permission when possible.
- Verify webhook signature where supported.
- De-duplicate incoming events.
- Store raw payload for support/debugging.
- Map provider status to local status with source and timestamp.
- Keep manual fallback path.
- Never let provider failure corrupt local order/payment/stock state.

## Provider Priority

1. Meta pages, Messenger, Instagram messaging.
2. Courier booking and tracking.
3. Manual payment proof, then payment gateways.
4. Meta Pixel/CAPI and catalog.
5. SMS/WhatsApp notifications.
6. Email provider for invites, receipts, exports.

## Idempotency Examples

- `order_confirm:{shop_id}:{order_draft_id}`
- `courier_book:{shop_id}:{order_id}`
- `payment_mark_paid:{shop_id}:{payment_id}:{client_request_id}`
- `campaign_send:{shop_id}:{campaign_id}:{customer_id}`
- `webhook:{provider}:{provider_event_id}`

## Failure States

- `pending`
- `processing`
- `retrying`
- `failed_retryable`
- `failed_final`
- `manual_required`
- `completed`


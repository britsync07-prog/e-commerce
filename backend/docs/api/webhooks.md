# Webhooks API

Purpose: Receive signed Meta webhook events and preserve them for asynchronous processing.

Auth: Meta webhook verification challenge uses `META_WEBHOOK_VERIFY_TOKEN`; event delivery uses `META_WEBHOOK_SECRET` and `x-hub-signature-256`. No staff bearer session is accepted for these public routes.

## `GET /meta/:shopId`

Request: Meta verification query `hub.mode=subscribe`, `hub.verify_token`, and `hub.challenge`.

Response: `200` with the challenge string when the configured token matches.

Side effects: None.

Audit/timeline: None.

Cache: Do not cache.

Errors: `META_WEBHOOK_VERIFICATION_FAILED`, `VALIDATION_ERROR`.

## `POST /meta/:shopId`

Request: JSON provider payload. Required `x-hub-signature-256: sha256=<hex>`; optional `x-meta-event-id` provides the provider event ID.

Response: `{ "accepted": true, "duplicate": false, "event": { ... } }`; repeated provider IDs return `duplicate: true`.

Side effects: Verifies the HMAC, stores a pending event in `webhook_events`, queues `meta.webhook.process`, and updates active Meta connections' `last_webhook_at`. The worker extracts Facebook/Instagram comment events, matches active registered social posts, captures comment leads, and leaves non-comment events as `ignored`.

Audit/timeline: No staff audit actor exists for ingestion; processed comment payloads write `comment.meta_webhook_processed`, and event state is tracked in `webhook_events`.

Cache: Do not cache. Idempotency is enforced by `(provider, provider_event_id)`.

Errors: `META_WEBHOOK_NOT_CONFIGURED`, `META_WEBHOOK_SIGNATURE_INVALID`, `VALIDATION_ERROR`.

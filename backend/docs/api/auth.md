# Auth API

Base path: `/api/v1/auth`

Purpose:
- Registers owner/staff users.
- Logs users in with password credentials.
- Verifies email/phone ownership with one-time codes.
- Starts and confirms password reset with one-time codes.
- Issues revocable bearer sessions.
- Returns current session user.

Auth:
- `POST /register` and `POST /login` are public.
- `POST /verification/confirm`, `POST /password-reset/request`, and `POST /password-reset/confirm` are public.
- `GET /me`, `POST /logout`, `GET /sessions`, `POST /sessions/:sessionId/revoke`, and `POST /verification/request` require `Authorization: Bearer <token>`.

## `POST /register`

Request:

```json
{
  "name": "Nafis",
  "email": "nafis@example.com",
  "password": "strong-password",
  "language": "en"
}
```

Response:
- `201`

```json
{
  "user": {
    "id": "uuid",
    "name": "Nafis",
    "email": "nafis@example.com",
    "phone": null,
    "language": "en",
    "status": "active",
    "email_verified_at": null,
    "phone_verified_at": null,
    "created_at": "2026-09-27T00:00:00.000Z"
  }
}
```

Side effects:
- Inserts `users`.
- Stores password as salted `scrypt` hash.

Audit/timeline: Writes `auth_events.registered`.

Cache:
- Do not cache.

Errors:
- `400 VALIDATION_ERROR`
- `409 USER_EXISTS`
- `429 RATE_LIMITED` after 5 registrations from one IP in 15 minutes

## `POST /verification/request`

Purpose: Create a 10-minute email or phone verification challenge for the authenticated user.

Auth: Bearer session required.

Request:

```json
{
  "channel": "email"
}
```

Response:
- `201`

```json
{
  "challenge": {
    "id": "uuid",
    "purpose": "email_verification",
    "destination_type": "email",
    "expires_at": "2026-09-29T00:10:00.000Z"
  },
  "delivery": {
    "status": "queued",
    "provider": "not_connected"
  }
}
```

Side effects:
- Expires older pending verification challenges for that user and channel.
- Inserts `auth_challenges`.

Audit/timeline: Writes `auth_events.verification_requested`.

Cache: Do not cache.

Errors:
- `400 VALIDATION_ERROR`
- `401 AUTH_REQUIRED`
- `401 SESSION_INVALID`
- `409 CONTACT_METHOD_MISSING`
- `429 RATE_LIMITED`

## `POST /verification/confirm`

Purpose: Confirm an email or phone verification challenge.

Auth: Public. The challenge id and code are required.

Request:

```json
{
  "challengeId": "uuid",
  "code": "123456"
}
```

Response:

```json
{
  "ok": true,
  "user": {
    "id": "uuid",
    "email_verified_at": "2026-09-29T00:05:00.000Z"
  }
}
```

Side effects:
- Marks the challenge used.
- Sets `users.email_verified_at` or `users.phone_verified_at`.

Audit/timeline: Writes `auth_events.email_verified` or `auth_events.phone_verified`.

Cache: Refresh current user state after success.

Errors:
- `400 AUTH_CODE_INVALID`
- `400 VALIDATION_ERROR`
- `429 RATE_LIMITED`

## `POST /password-reset/request`

Purpose: Create a 10-minute password reset challenge for an existing user without exposing whether the identifier exists.

Auth: Public.

Request:

```json
{
  "identifier": "nafis@example.com"
}
```

Response:

```json
{
  "ok": true,
  "delivery": {
    "status": "queued",
    "provider": "not_connected"
  }
}
```

Side effects:
- If the user exists, expires older pending reset challenges and inserts `auth_challenges`.
- If the user does not exist, no database write is required.

Audit/timeline: Writes `auth_events.password_reset_requested` only when a matching user exists.

Cache: Do not cache.

Errors:
- `400 VALIDATION_ERROR`
- `429 RATE_LIMITED`

## `POST /password-reset/confirm`

Purpose: Confirm a password reset code and replace the user's password.

Auth: Public.

Request:

```json
{
  "identifier": "nafis@example.com",
  "code": "123456",
  "newPassword": "new-strong-password"
}
```

Response:

```json
{
  "ok": true
}
```

Side effects:
- Marks the reset challenge used.
- Stores the new password as salted `scrypt` hash.
- Sets `users.password_changed_at`.
- Marks the reset channel verified if it was not verified yet.
- Revokes all existing sessions for that user.

Audit/timeline: Writes `auth_events.password_reset_completed`.

Cache: Clear client session state and ask the user to sign in again.

Errors:
- `400 AUTH_CODE_INVALID`
- `400 VALIDATION_ERROR`
- `429 RATE_LIMITED`

## `POST /login`

Request:

```json
{
  "identifier": "nafis@example.com",
  "password": "strong-password"
}
```

Response:

```json
{
  "token": "session-token",
  "session": {
    "id": "uuid",
    "expires_at": "2026-10-27T00:00:00.000Z"
  },
  "user": {
    "id": "uuid",
    "name": "Nafis"
  }
}
```

Side effects:
- Inserts `user_sessions` with hashed token.

Audit/timeline: Writes `auth_events.login` on success and `login_failed`/`login_blocked` on rejected attempts. Failed-event metadata stores only a one-way identifier hash.

Cache:
- Do not cache.
- Clients store token securely.

Errors:
- `400 VALIDATION_ERROR`
- `401 INVALID_CREDENTIALS`
- `403 USER_DISABLED`
- `429 RATE_LIMITED` after 10 login attempts from one IP in 15 minutes

## `GET /me`

Request:
- Header `Authorization: Bearer <token>`.
- No body.

Response:

```json
{
  "session": {
    "id": "uuid",
    "expires_at": "2026-10-27T00:00:00.000Z"
  },
  "user": {
    "id": "uuid",
    "name": "Nafis"
  }
}
```

Side effects:
- None.

Audit/timeline:
- None for read.

Cache:
- Do not cache beyond in-memory client session state.

Errors:
- `401 AUTH_REQUIRED`
- `401 SESSION_INVALID`
- `403 USER_DISABLED`

## `POST /logout`

Request:
- Header `Authorization: Bearer <token>`.
- No body.

Response:

```json
{
  "ok": true
}
```

Side effects:
- Sets `user_sessions.revoked_at`.

Audit/timeline: Writes `auth_events.logout` when an active session was revoked.

Cache:
- Clear client session state.

## `GET /sessions`

Purpose: List the authenticated user's login sessions for security review.

Auth: Bearer session required.

Request: No body.

Response: `{ "sessions": [{ "id": "uuid", "user_agent": "...", "ip_address": "...", "revoked_at": null }] }`.

Side effects: None.

Audit/timeline: Login and logout events are stored in `auth_events`; this read does not write an event.

Cache: Do not cache longer than the current screen session.

Errors: `AUTH_REQUIRED`, `SESSION_INVALID`.

## `POST /sessions/:sessionId/revoke`

Purpose: Revoke one of the authenticated user's sessions.

Auth: Bearer session required. A user can revoke only their own session records.

Request: Path `sessionId` UUID.

Response: `{ "ok": true, "sessionId": "uuid" }`.

Side effects: Sets `revoked_at`; the session can no longer authenticate.

Audit/timeline: Stores an `auth_events.session_revoked` event.

Cache: Invalidate local session state after revoking the current session.

Errors: `AUTH_REQUIRED`, `SESSION_INVALID`, `SESSION_NOT_FOUND`, `VALIDATION_ERROR`.

Errors:
- `401 AUTH_REQUIRED`

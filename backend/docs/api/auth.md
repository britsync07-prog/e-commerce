# Auth API

Base path: `/api/v1/auth`

Purpose:
- Registers owner/staff users.
- Logs users in with password credentials.
- Issues revocable bearer sessions.
- Returns current session user.

Auth:
- `POST /register` and `POST /login` are public.
- `GET /me` and `POST /logout` require `Authorization: Bearer <token>`.
- Production rule: add email/phone verification before sensitive access.

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
    "created_at": "2026-09-27T00:00:00.000Z"
  }
}
```

Side effects:
- Inserts `users`.
- Stores password as salted `scrypt` hash.

Audit/timeline:
- None yet. Add `auth.user_registered` audit once actor model is wired to auth.

Cache:
- Do not cache.

Errors:
- `400 VALIDATION_ERROR`
- `409 USER_EXISTS`

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

Audit/timeline:
- None yet. Add `auth.login` audit after auth actor model is shared.

Cache:
- Do not cache.
- Clients store token securely.

Errors:
- `400 VALIDATION_ERROR`
- `401 INVALID_CREDENTIALS`
- `403 USER_DISABLED`

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

Audit/timeline:
- None yet. Add `auth.logout` audit after auth actor model is shared.

Cache:
- Clear client session state.

Errors:
- `401 AUTH_REQUIRED`


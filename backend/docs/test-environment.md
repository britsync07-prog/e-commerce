# Backend Test Environment

Status: ready for local backend tests.

## What Runs

- TypeScript build.
- API docs route coverage check.
- Onboarding integration flow with Fastify `inject`.
- No production database required yet; onboarding uses ignored local JSON test storage.

## Commands

```powershell
cd backend
npm run check
```

Single test command:

```powershell
cd backend
npm test
```

## Test Env File

Copy when needed:

```powershell
cd backend
copy .env.test.example .env.test
```

Current integration test does not require `.env.test`; it boots the app in process and resets onboarding test data.

## Guarantees

- Active templates are internal `test_only` templates only.
- No online template source code is copied.
- No production credentials are used.
- Test data is ignored by git through `data/`.
- API route docs are required by `npm run check:api-docs`.

## Not Ready Yet

- PostgreSQL migrations.
- Redis-backed queues.
- VPS deployment smoke test.
- Browser E2E.

Add those after database module exists.


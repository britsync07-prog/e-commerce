# Backend

Modular monolith API for the F-commerce platform.

## Start

```powershell
cd backend
copy .env.example .env
npm install
npm run dev
```

Docker is planned:

```powershell
cd backend
docker compose up --build
```

Current machine does not have Docker available in shell.

## Rules

- Every business record needs `shop_id`.
- Every mutation that affects stock, order, payment, courier, AI execution, or integration writes audit/timeline.
- Every new API route needs docs in `docs/api/`.
- Run `npm run check:api-docs` before merging route changes.

## Test

```powershell
npm run check
```

See `docs/test-environment.md`.

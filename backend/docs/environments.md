# Backend Environments

## Local

- `NODE_ENV=development`
- Uses local Postgres and Redis.
- `APP_ORIGIN=http://localhost:3000`.
- Swagger UI is available at `/docs`.
- Local file storage is allowed.

## Staging

- `NODE_ENV=production` or production-equivalent settings.
- Uses staging Postgres, Redis, and storage.
- `APP_ORIGIN` must list staging dashboard/storefront origins.
- Run migrations before reload.
- Run smoke tests before promoting to production.

## Production

Required:

- `NODE_ENV=production`
- `DATABASE_URL`
- `REDIS_URL`
- `APP_ORIGIN`
- `STORAGE_DRIVER`
- `ASSET_SIGNING_SECRET`
- `AUTH_OTP_SECRET`

Rules:

- `APP_ORIGIN` is comma-separated and must contain only real HTTPS origins.
- `APP_ORIGIN` must not contain localhost in production.
- `ASSET_SIGNING_SECRET` signs private local asset URLs.
- `AUTH_OTP_SECRET` signs OTP challenges and must be unique per environment.
- `OTP_DELIVERY_WEBHOOK_URL` enables real OTP delivery. Without it, delivery returns `not_connected`; production still never returns dev OTP codes.
- `AUTH_COOKIE_ENABLED=true` enables secure HttpOnly browser session cookies. Cookie-authenticated unsafe requests must send `X-CSRF-Token` matching the CSRF cookie.
- `AUTH_COOKIE_DOMAIN`, `AUTH_COOKIE_NAME`, `AUTH_CSRF_COOKIE_NAME`, `AUTH_COOKIE_SAME_SITE`, and `AUTH_COOKIE_SECURE` control browser session behavior per environment.
- `STORAGE_DRIVER=s3` requires `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, and `S3_SECRET_ACCESS_KEY`.
- Swagger UI is disabled in production.
- Secrets must come from deploy environment or secret manager, not source code.
- Migrations run explicitly before PM2 reload.

VPS deploy:

- Put runtime values in the VPS `.env` file.
- Do not hardcode deployment domains in source files.

## Production Secrets To Add Before Public Launch

- `AUTH_OTP_SECRET`
- `META_WEBHOOK_SECRET`
- `META_WEBHOOK_VERIFY_TOKEN`
- `META_APP_ID`
- `META_APP_SECRET`
- `META_OAUTH_REDIRECT_URI`
- `META_TOKEN_ENCRYPTION_KEY`

Provider-specific secrets should stay out of git and PM2 config when possible.

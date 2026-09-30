# VPS Auto Deploy

Goal:
- Push to GitHub `main`.
- GitHub Actions runs backend checks.
- If checks pass, GitHub SSHs into VPS.
- VPS pulls latest code, builds backend, restarts only this project's PM2 apps.
- Deploy logs appear in GitHub Actions.
- Service logs are available through `pm2 logs`.

## GitHub Secrets

Set these in GitHub repo settings:

```txt
VPS_HOST=your.server.ip.or.domain
VPS_USER=deploy
VPS_PASSWORD=SSH password for that user
```

Do not commit the password. Put it only in GitHub Secrets.

Required GitHub variable:

```txt
VPS_APP_DIR=/absolute/path/to/app
```

## VPS Requirements

Install on VPS:

```bash
sudo apt update
sudo apt install -y git
node -v
npm -v
pm2 -v
```

Node should be 22+.

Deploy does not touch Docker, nginx, or other PM2 apps.

## First Deploy

Push to `main`. Workflow:

```txt
.github/workflows/deploy-vps.yml
```

The script:

```txt
ops/vps/deploy.sh
```

If the app directory does not exist, it clones:

```txt
https://github.com/britsync07-prog/e-commerce.git
```

If the repo becomes private, add a deploy key on the VPS and change `REPO_URL` in `.github/workflows/deploy-vps.yml` to:

```txt
git@github.com:britsync07-prog/e-commerce.git
```

No GitHub Environment approval is configured, so every push to `main` deploys automatically after checks pass.

## Environment Files On VPS

Deploy:

```txt
/absolute/path/to/app/.env
```

Example:

```txt
APP_DIR=/absolute/path/to/app
NODE_ENV=production
BACKEND_PORT=backend_port
BACKEND_HOST=0.0.0.0
LOG_LEVEL=info
DATABASE_URL=postgres://user:password@host:port/database
REDIS_URL=redis://host:port
APP_ORIGIN=https://dashboard.example.com
STORAGE_DRIVER=local
LOCAL_STORAGE_DIR=/absolute/path/to/app/backend/storage
ASSET_SIGNING_SECRET=minimum-32-character-random-secret
# Required only when STORAGE_DRIVER=s3:
S3_ENDPOINT=https://object-storage.example.com
S3_REGION=auto
S3_BUCKET=your-bucket
S3_ACCESS_KEY_ID=your-access-key
S3_SECRET_ACCESS_KEY=your-secret-key
S3_PUBLIC_BASE_URL=https://cdn.example.com
STORAGE_PUBLIC_PREFIX=public
STORAGE_PRIVATE_PREFIX=private
STOREFRONT_PORT=storefront_port
STOREFRONT_HOST=0.0.0.0
STOREFRONT_BACKEND_URL=http://backend_host:backend_port
ROOT_DOMAIN=yourdomain.com
```

## Nginx

Template:

```txt
ops/vps/nginx.example.conf
```

Routing, if you choose to add it manually:

```txt
api.yourdomain.com -> backend_host:backend_port
*.yourdomain.com   -> storefront_host:storefront_port
```

DNS:

```txt
A  api.yourdomain.com  VPS_IP
A  *.yourdomain.com    VPS_IP
```

## Logs

During deploy:
- Open GitHub Actions run.
- Deploy step prints PM2 status and recent logs for `fcommerce-backend` and `fcommerce-storefront`.
- If deploy fails, script prints last 120 PM2 log lines for those two apps only.

On VPS:

```bash
cd /absolute/path/to/app
bash ops/vps/tail-logs.sh
```

Or directly:

```bash
pm2 logs fcommerce-backend
pm2 logs fcommerce-storefront
```

## Manual Redeploy

On VPS:

```bash
APP_DIR=/absolute/path/to/app BRANCH=main bash /absolute/path/to/app/ops/vps/deploy.sh
```

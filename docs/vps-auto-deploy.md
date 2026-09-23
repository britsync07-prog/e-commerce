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

For your current VPS, use:

```txt
VPS_HOST=161.97.92.162
VPS_USER=root
```

Do not commit the password. Put it only in GitHub Secrets.

Optional GitHub variable:

```txt
VPS_APP_DIR=/var/www/e-commerce
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

If `/var/www/e-commerce` does not exist, it clones:

```txt
https://github.com/britsync07-prog/e-commerce.git
```

If the repo becomes private, add a deploy key on the VPS and change `REPO_URL` in `.github/workflows/deploy-vps.yml` to:

```txt
git@github.com:britsync07-prog/e-commerce.git
```

No GitHub Environment approval is configured, so every push to `main` deploys automatically after checks pass.

## Environment Files On VPS

Backend:

```txt
/var/www/e-commerce/backend/.env
```

Example:

```txt
NODE_ENV=production
PORT=4001
HOST=0.0.0.0
LOG_LEVEL=info
DATABASE_URL=postgres://postgres:postgres@localhost:5432/fcommerce
REDIS_URL=redis://localhost:6379
APP_ORIGIN=https://dashboard.yourdomain.com
```

Storefront:

```txt
/var/www/e-commerce/storefront/.env
```

Example:

```txt
PORT=3100
HOST=0.0.0.0
BACKEND_URL=https://api.yourdomain.com
ROOT_DOMAIN=yourdomain.com
```

Current live-test domain:

```txt
ROOT_DOMAIN=mdsaimon.qzz.io
BACKEND_URL=http://127.0.0.1:4001
```

## Nginx

Template:

```txt
ops/vps/nginx.example.conf
```

Current domain config:

```txt
ops/vps/nginx-mdsaimon.qzz.io.conf
```

Routing, if you choose to add it manually:

```txt
api.yourdomain.com -> 127.0.0.1:4001
*.yourdomain.com   -> 127.0.0.1:3100
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
cd /var/www/e-commerce
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
APP_DIR=/var/www/e-commerce BRANCH=main bash /var/www/e-commerce/ops/vps/deploy.sh
```

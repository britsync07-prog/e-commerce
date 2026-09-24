#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="${APP_DIR:-/var/www/e-commerce}"
BRANCH="${BRANCH:-main}"
REPO_URL="${REPO_URL:-https://github.com/britsync07-prog/e-commerce.git}"
BACKEND_APP="${BACKEND_APP:-fcommerce-backend}"
STOREFRONT_APP="${STOREFRONT_APP:-fcommerce-storefront}"

log() {
  printf '\n[%s] %s\n' "$(date -u +'%Y-%m-%dT%H:%M:%SZ')" "$*"
}

dump_logs() {
  log "deploy failed; recent PM2 logs for this project only"
  pm2 logs "$BACKEND_APP" --lines 120 --nostream || true
  pm2 logs "$STOREFRONT_APP" --lines 120 --nostream || true
}

trap dump_logs ERR

log "deploy starting: $REPO_URL#$BRANCH -> $APP_DIR"

if ! command -v node >/dev/null; then
  echo "node is missing on VPS" >&2
  exit 1
fi

if ! command -v npm >/dev/null; then
  echo "npm is missing on VPS" >&2
  exit 1
fi

if ! command -v pm2 >/dev/null; then
  echo "pm2 is missing on VPS" >&2
  exit 1
fi

if [ ! -d "$APP_DIR/.git" ]; then
  log "cloning repo"
  mkdir -p "$(dirname "$APP_DIR")"
  git clone --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
fi

cd "$APP_DIR"

log "pulling latest code"
git fetch origin "$BRANCH"
git checkout "$BRANCH"
git reset --hard "origin/$BRANCH"

log "installing backend dependencies"
cd "$APP_DIR/backend"
export DATABASE_URL="${DATABASE_URL:-postgresql:///fcommerce?host=/var/run/postgresql&port=5433}"
export REDIS_URL="${REDIS_URL:-redis://localhost:6379}"
export STORAGE_DRIVER="${STORAGE_DRIVER:-local}"
export LOCAL_STORAGE_DIR="${LOCAL_STORAGE_DIR:-$APP_DIR/backend/storage}"
npm ci
npm run db:migrate
npm run build
npm prune --omit=dev

log "installing storefront dependencies"
cd "$APP_DIR/storefront"
npm install --omit=dev

log "restarting PM2 apps"
cd "$APP_DIR"
pm2 startOrReload ops/vps/ecosystem.config.cjs --update-env

log "PM2 status"
pm2 describe "$BACKEND_APP" || true
pm2 describe "$STOREFRONT_APP" || true

log "recent PM2 logs"
pm2 logs "$BACKEND_APP" --lines 50 --nostream || true
pm2 logs "$STOREFRONT_APP" --lines 50 --nostream || true

log "deploy complete"

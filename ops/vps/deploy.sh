#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="${APP_DIR:?APP_DIR is required for production deploy}"
BRANCH="${BRANCH:-main}"
REPO_URL="${REPO_URL:-https://github.com/britsync07-prog/e-commerce.git}"
BACKEND_APP="${BACKEND_APP:-fcommerce-backend}"
STOREFRONT_APP="${STOREFRONT_APP:-fcommerce-storefront}"
WORKER_APP="${WORKER_APP:-fcommerce-worker}"
ENV_FILE="${ENV_FILE:-$APP_DIR/.env}"

log() {
  printf '\n[%s] %s\n' "$(date -u +'%Y-%m-%dT%H:%M:%SZ')" "$*"
}

dump_logs() {
  log "deploy failed; recent PM2 logs for this project only"
  pm2 logs "$BACKEND_APP" --lines 120 --nostream || true
  pm2 logs "$STOREFRONT_APP" --lines 120 --nostream || true
  pm2 logs "$WORKER_APP" --lines 120 --nostream || true
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

load_env_file() {
  if [ ! -f "$1" ]; then
    echo "env file missing: $1" >&2
    exit 1
  fi

  set -a
  # shellcheck disable=SC1090
  . "$1"
  set +a
}

if [ ! -d "$APP_DIR/.git" ]; then
  log "cloning repo"
  mkdir -p "$(dirname "$APP_DIR")"
  git clone --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
fi

cd "$APP_DIR"

log "loading deploy environment"
load_env_file "$ENV_FILE"
export APP_DIR

log "pulling latest code"
git fetch origin "$BRANCH"
git checkout "$BRANCH"
git reset --hard "origin/$BRANCH"

log "installing backend dependencies"
cd "$APP_DIR/backend"
export APP_ORIGIN="${APP_ORIGIN:?APP_ORIGIN is required for production deploy}"
export ROOT_DOMAIN="${ROOT_DOMAIN:?ROOT_DOMAIN is required for production deploy}"
export BACKEND_PORT="${BACKEND_PORT:?BACKEND_PORT is required for production deploy}"
export BACKEND_HOST="${BACKEND_HOST:?BACKEND_HOST is required for production deploy}"
export DATABASE_URL="${DATABASE_URL:?DATABASE_URL is required for production deploy}"
export REDIS_URL="${REDIS_URL:?REDIS_URL is required for production deploy}"
export STORAGE_DRIVER="${STORAGE_DRIVER:?STORAGE_DRIVER is required for production deploy}"
export LOCAL_STORAGE_DIR="${LOCAL_STORAGE_DIR:?LOCAL_STORAGE_DIR is required for production deploy}"
export ASSET_SIGNING_SECRET="${ASSET_SIGNING_SECRET:?ASSET_SIGNING_SECRET is required for production deploy}"
export METRICS_TOKEN="${METRICS_TOKEN:?METRICS_TOKEN is required for production deploy}"
export AUTH_OTP_SECRET="${AUTH_OTP_SECRET:?AUTH_OTP_SECRET is required for production deploy}"
export STOREFRONT_PORT="${STOREFRONT_PORT:?STOREFRONT_PORT is required for production deploy}"
export STOREFRONT_HOST="${STOREFRONT_HOST:?STOREFRONT_HOST is required for production deploy}"
export STOREFRONT_BACKEND_URL="${STOREFRONT_BACKEND_URL:?STOREFRONT_BACKEND_URL is required for production deploy}"
pm2 stop "$BACKEND_APP" "$WORKER_APP" || true
npm ci --include=dev
npm run db:migrate
npm run build
npm prune --omit=dev || log "npm prune failed; continuing with built app and installed dependencies"

log "installing storefront dependencies"
cd "$APP_DIR/storefront"
pm2 stop "$STOREFRONT_APP" || true
npm install --omit=dev

log "restarting PM2 apps"
cd "$APP_DIR"
pm2 startOrReload ops/vps/ecosystem.config.cjs --update-env

log "PM2 status"
pm2 describe "$BACKEND_APP" || true
pm2 describe "$STOREFRONT_APP" || true
pm2 describe "$WORKER_APP" || true

log "recent PM2 logs"
pm2 logs "$BACKEND_APP" --lines 50 --nostream || true
pm2 logs "$STOREFRONT_APP" --lines 50 --nostream || true
pm2 logs "$WORKER_APP" --lines 50 --nostream || true

log "deploy complete"

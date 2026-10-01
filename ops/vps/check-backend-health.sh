#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=env.sh
. "$SCRIPT_DIR/env.sh"

load_env_file "$ENV_FILE"

HEALTHCHECK_URL="${HEALTHCHECK_URL:?HEALTHCHECK_URL is required}"
METRICS_URL="${METRICS_URL:?METRICS_URL is required}"
METRICS_TOKEN="${METRICS_TOKEN:?METRICS_TOKEN is required}"
BACKUP_DIR="${BACKUP_DIR:?BACKUP_DIR is required}"
BACKUP_MAX_AGE_HOURS="${BACKUP_MAX_AGE_HOURS:-26}"
HEALTHCHECK_TIMEOUT_SECONDS="${HEALTHCHECK_TIMEOUT_SECONDS:-10}"

failures=()

if ! curl -fsS -m "$HEALTHCHECK_TIMEOUT_SECONDS" "$HEALTHCHECK_URL" >/dev/null; then
  failures+=("readiness check failed: $HEALTHCHECK_URL")
fi

if ! curl -fsS -m "$HEALTHCHECK_TIMEOUT_SECONDS" -H "x-metrics-token: $METRICS_TOKEN" "$METRICS_URL" >/dev/null; then
  failures+=("metrics check failed: $METRICS_URL")
fi

latest_backup="$(find "$BACKUP_DIR" -type f -name 'db-*.dump' -printf '%T@ %p\n' 2>/dev/null | sort -nr | head -n 1 | cut -d' ' -f2- || true)"
if [ -z "$latest_backup" ]; then
  failures+=("no db backup found in $BACKUP_DIR")
else
  now="$(date +%s)"
  modified="$(stat -c '%Y' "$latest_backup")"
  age_hours="$(( (now - modified) / 3600 ))"
  if [ "$age_hours" -gt "$BACKUP_MAX_AGE_HOURS" ]; then
    failures+=("latest db backup is ${age_hours}h old: $latest_backup")
  fi
fi

send_alert() {
  local message="$1"
  if [ -z "${ALERT_WEBHOOK_URL:-}" ]; then
    return 0
  fi

  payload="$(MESSAGE="$message" node -e 'console.log(JSON.stringify({ text: process.env.MESSAGE }))')"
  curl -fsS -m "$HEALTHCHECK_TIMEOUT_SECONDS" -H "Content-Type: application/json" -d "$payload" "$ALERT_WEBHOOK_URL" >/dev/null || true
}

if [ "${#failures[@]}" -gt 0 ]; then
  message="backend health check failed: ${failures[*]}"
  printf '%s\n' "$message" >&2
  send_alert "$message"
  exit 1
fi

printf 'backend health ok; latest_backup=%s\n' "$latest_backup"


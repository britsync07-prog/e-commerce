#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=env.sh
. "$SCRIPT_DIR/env.sh"

load_env_file "$ENV_FILE"

DATABASE_URL="${DATABASE_URL:?DATABASE_URL is required}"
BACKUP_DIR="${BACKUP_DIR:?BACKUP_DIR is required}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-7}"

if ! command -v pg_dump >/dev/null; then
  echo "pg_dump is missing" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

timestamp="$(date -u +'%Y%m%dT%H%M%SZ')"
backup_file="$BACKUP_DIR/db-$timestamp.dump"

pg_dump "$DATABASE_URL" --format=custom --no-owner --no-privileges --file="$backup_file"
chmod 600 "$backup_file"

find "$BACKUP_DIR" -type f -name 'db-*.dump' -mtime "+$BACKUP_RETENTION_DAYS" -delete

printf '%s\n' "$backup_file"


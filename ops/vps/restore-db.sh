#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=env.sh
. "$SCRIPT_DIR/env.sh"

backup_file="${1:?usage: APP_DIR=/path/to/app ops/vps/restore-db.sh /path/to/db.dump}"

load_env_file "$ENV_FILE"

RESTORE_DATABASE_URL="${RESTORE_DATABASE_URL:?RESTORE_DATABASE_URL is required; never restore into production by accident}"

if ! command -v pg_restore >/dev/null; then
  echo "pg_restore is missing" >&2
  exit 1
fi

if [ ! -f "$backup_file" ]; then
  echo "backup file not found: $backup_file" >&2
  exit 1
fi

pg_restore --clean --if-exists --no-owner --no-privileges --dbname="$RESTORE_DATABASE_URL" "$backup_file"


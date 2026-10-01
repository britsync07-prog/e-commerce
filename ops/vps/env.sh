#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="${APP_DIR:?APP_DIR is required}"
ENV_FILE="${ENV_FILE:-$APP_DIR/.env}"

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


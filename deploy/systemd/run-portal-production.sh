#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?Set DATABASE_URL in the portal service environment}"
export NODE_ENV=production
export HOSTNAME="${HOSTNAME:-127.0.0.1}"
export PORT="${PORT:-3000}"

if [[ ! -f .next/standalone/server.js ]]; then
  echo "Missing .next/standalone/server.js. Run: bun run build" >&2
  exit 1
fi

exec "${BUN_BIN:-/home/mag/.bun/bin/bun}" .next/standalone/server.js

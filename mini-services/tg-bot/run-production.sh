#!/usr/bin/env bash
set -euo pipefail

: "${TELEGRAM_BOT_TOKEN:?Set TELEGRAM_BOT_TOKEN in the service environment}"
: "${ADMIN_KEY:?Set ADMIN_KEY to the same key used by the portal}"
: "${PORTAL_API:?Set PORTAL_API to the portal base URL}"
export NODE_ENV=production
export BOT_HOST="${BOT_HOST:-127.0.0.1}"
export BOT_PORT="${BOT_PORT:-3003}"
# Для systemd пути задаются в env-файле. Для start-nohup безопасный дефолт
# находится в домашнем каталоге пользователя, а не в недоступных /var/lib и /var/log.
export BOT_DATA_DIR="${BOT_DATA_DIR:-${XDG_DATA_HOME:-$HOME/.local/share}/sunc-tg-bot}"
export BOT_LOG_DIR="${BOT_LOG_DIR:-${XDG_STATE_HOME:-$HOME/.local/state}/sunc-tg-bot}"
BUN_BIN="${BUN_BIN:-$(command -v bun 2>/dev/null || ( [[ -x "$HOME/.bun/bin/bun" ]] && echo "$HOME/.bun/bin/bun" ) || echo "/usr/local/bin/bun")}"
if [[ ! -x "$BUN_BIN" ]]; then
  echo "Bun executable is missing: $BUN_BIN. Set BUN_BIN to its absolute path." >&2
  exit 1
fi
mkdir -p "$BOT_DATA_DIR" "$BOT_LOG_DIR"
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
exec "$BUN_BIN" index.ts

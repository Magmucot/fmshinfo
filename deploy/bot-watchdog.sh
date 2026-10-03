#!/usr/bin/env bash
#
# SUNC Info Telegram Bot Watchdog Supervisor
#
# Supervised launcher for mini-services/tg-bot:
# - Automatically restarts the bot worker if it crashes
# - Extracts error logs & stack traces
# - Dispatches incident reports to administrators:
#     1) Web portal reports (/api/feedback)
#     2) Local reports store ($BOT_DATA_DIR/reports.json for /reports command)
#     3) Direct Telegram alert messages to admins via Telegram Bot API
# - Anti-flapping exponential backoff protection
# - Clean graceful shutdown on SIGTERM / SIGINT

set -euo pipefail

ROOT_DIR="${1:-$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)}"
BOT_ENV="${2:-${BOT_ENV:-$HOME/.config/sunc-tg-bot.env}}"
STATE_DIR="${3:-${XDG_STATE_HOME:-$HOME/.local/state}/sunc-info}"
LOG_FILE="${4:-$STATE_DIR/bot.log}"

# Fallback to repository .env if user config file doesn't exist
if [[ ! -f "$BOT_ENV" && -f "$ROOT_DIR/.env" ]]; then
  BOT_ENV="$ROOT_DIR/.env"
fi

if [[ -f "$BOT_ENV" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$BOT_ENV"
  set +a
else
  echo "[Watchdog] Warning: Environment file not found at $BOT_ENV" >&2
fi

mkdir -p "$STATE_DIR"
WATCHDOG_PID_FILE="$STATE_DIR/bot-watchdog.pid"
WORKER_PID_FILE="$STATE_DIR/bot-worker.pid"

# Save Watchdog PID
echo "$$" > "$WATCHDOG_PID_FILE"

STOP_REQUESTED=0
CHILD_PID=""

cleanup() {
  STOP_REQUESTED=1
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] [Watchdog] Received stop signal. Terminating bot worker..." >&2
  if [[ -n "$CHILD_PID" ]] && kill -0 "$CHILD_PID" 2>/dev/null; then
    kill -TERM "$CHILD_PID" 2>/dev/null || true
    for _ in {1..30}; do
      kill -0 "$CHILD_PID" 2>/dev/null || break
      sleep 0.5
    done
    if kill -0 "$CHILD_PID" 2>/dev/null; then
      echo "[$(date '+%Y-%m-%d %H:%M:%S')] [Watchdog] Worker did not stop within 15s; killing with SIGKILL." >&2
      kill -KILL "$CHILD_PID" 2>/dev/null || true
    fi
  fi
  rm -f "$WORKER_PID_FILE" "$WATCHDOG_PID_FILE"
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] [Watchdog] Supervisor stopped cleanly." >&2
  exit 0
}

trap cleanup SIGTERM SIGINT SIGHUP

FAIL_COUNT=0
BACKOFF_SECONDS=2

echo "[$(date '+%Y-%m-%d %H:%M:%S')] [Watchdog] Starting SUNC Telegram Bot supervisor (PID $$)..."

while [[ "$STOP_REQUESTED" -eq 0 ]]; do
  START_TIME=$(date +%s)
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] [Watchdog] Launching bot worker..."

  # Start the bot worker in the background
  "$ROOT_DIR/mini-services/tg-bot/run-production.sh" &
  CHILD_PID=$!
  echo "$CHILD_PID" > "$WORKER_PID_FILE"

  # Wait for worker process to exit
  set +e
  wait "$CHILD_PID"
  EXIT_CODE=$?
  set -e
  rm -f "$WORKER_PID_FILE"

  # If stop was requested by SIGTERM/SIGINT, exit normally without reporting
  if [[ "$STOP_REQUESTED" -eq 1 ]]; then
    break
  fi

  END_TIME=$(date +%s)
  UPTIME=$(( END_TIME - START_TIME ))

  echo "[$(date '+%Y-%m-%d %H:%M:%S')] [Watchdog] ⚠️ Bot worker exited unexpectedly (code: $EXIT_CODE, uptime: ${UPTIME}s)!"

  # Dispatch error report to administrators
  python3 "$ROOT_DIR/deploy/report-crash.py" \
    --exit-code "$EXIT_CODE" \
    --uptime "$UPTIME" \
    --log-file "$LOG_FILE" \
    --data-dir "${BOT_DATA_DIR:-${XDG_DATA_HOME:-$HOME/.local/share}/sunc-tg-bot}" \
    --portal-api "${PORTAL_API:-internal}" \
    --bot-token "${TELEGRAM_BOT_TOKEN:-}" \
    --admin-ids "${ADMIN_TG_IDS:-}" || true

  # Anti-flapping logic
  if [[ "$UPTIME" -lt 15 ]]; then
    FAIL_COUNT=$(( FAIL_COUNT + 1 ))
    BACKOFF_SECONDS=$(( FAIL_COUNT * 3 ))
    [[ "$BACKOFF_SECONDS" -gt 30 ]] && BACKOFF_SECONDS=30
    if [[ "$FAIL_COUNT" -ge 8 ]]; then
      echo "[$(date '+%Y-%m-%d %H:%M:%S')] [Watchdog] WARNING: Repeated rapid failures ($FAIL_COUNT). Backing off for 45s..."
      BACKOFF_SECONDS=45
    fi
  else
    FAIL_COUNT=1
    BACKOFF_SECONDS=2
  fi

  echo "[$(date '+%Y-%m-%d %H:%M:%S')] [Watchdog] Auto-restarting bot in ${BACKOFF_SECONDS}s..."
  sleep "$BACKOFF_SECONDS"
done

rm -f "$WORKER_PID_FILE" "$WATCHDOG_PID_FILE"

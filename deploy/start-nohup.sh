#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
STATE_DIR="${XDG_STATE_HOME:-$HOME/.local/state}/sunc-info"
BOT_ENV="${BOT_ENV:-$HOME/.config/sunc-tg-bot.env}"
PORTAL_ENV="${PORTAL_ENV:-$HOME/.config/sunc-portal.env}"

# Fallback to repository .env if user config file doesn't exist
if [[ ! -f "$BOT_ENV" && -f "$ROOT_DIR/.env" ]]; then
  BOT_ENV="$ROOT_DIR/.env"
fi
if [[ ! -f "$PORTAL_ENV" && -f "$ROOT_DIR/.env" ]]; then
  PORTAL_ENV="$ROOT_DIR/.env"
fi

mkdir -p "$STATE_DIR"

pid_file() { printf '%s/%s.pid' "$STATE_DIR" "$1"; }
log_file() { printf '%s/%s.log' "$STATE_DIR" "$1"; }
running() {
  local name="$1" pid
  [[ -s "$(pid_file "$name")" ]] || return 1
  pid="$(cat "$(pid_file "$name")")"
  [[ "$pid" =~ ^[0-9]+$ ]] && kill -0 "$pid" 2>/dev/null
}
refuse_duplicate_systemd() {
  command -v systemctl >/dev/null 2>&1 || return 0
  if systemctl --user is-active --quiet sunc-tg-bot.service 2>/dev/null; then echo "sunc-tg-bot already runs under systemd; stop it first." >&2; exit 1; fi
  if systemctl --user is-active --quiet sunc-portal.service 2>/dev/null; then echo "sunc-portal already runs under systemd; stop it first." >&2; exit 1; fi
}
start_portal() {
  [[ -f "$PORTAL_ENV" ]] || { echo "Missing $PORTAL_ENV" >&2; exit 1; }
  if curl --fail --silent http://127.0.0.1:3000/api/bells >/dev/null 2>&1; then
    echo "portal already available on 127.0.0.1:3000"
    return
  fi
  if running portal; then echo "portal already running"; return; fi
  nohup bash -c 'cd -- "$1"; set -a; source "$2"; set +a; exec "$1/deploy/systemd/run-portal-production.sh"' _ "$ROOT_DIR" "$PORTAL_ENV" >>"$(log_file portal)" 2>&1 &
  echo $! >"$(pid_file portal)"
  echo "portal started; log: $(log_file portal)"
}
start_bot() {
  [[ -f "$BOT_ENV" ]] || { echo "Missing $BOT_ENV" >&2; exit 1; }
  if running bot; then echo "bot already running"; return; fi
  nohup "$ROOT_DIR/deploy/bot-watchdog.sh" "$ROOT_DIR" "$BOT_ENV" "$STATE_DIR" "$(log_file bot)" >>"$(log_file bot)" 2>&1 &
  echo $! >"$(pid_file bot)"
  echo "bot started with watchdog supervisor; log: $(log_file bot)"
}
stop_one() {
  local name="$1" file pid worker_file worker_pid
  file="$(pid_file "$name")"; [[ -s "$file" ]] || return 0; pid="$(cat "$file")"
  worker_file="$STATE_DIR/${name}-worker.pid"

  if [[ "$pid" =~ ^[0-9]+$ ]] && kill -0 "$pid" 2>/dev/null; then
    kill -TERM "$pid" 2>/dev/null || true
    for _ in {1..30}; do kill -0 "$pid" 2>/dev/null || break; sleep 1; done
    kill -0 "$pid" 2>/dev/null && kill -KILL "$pid" 2>/dev/null || true
  fi

  if [[ -s "$worker_file" ]]; then
    worker_pid="$(cat "$worker_file")"
    if [[ "$worker_pid" =~ ^[0-9]+$ ]] && kill -0 "$worker_pid" 2>/dev/null; then
      kill -TERM "$worker_pid" 2>/dev/null || true
      for _ in {1..10}; do kill -0 "$worker_pid" 2>/dev/null || break; sleep 0.5; done
      kill -0 "$worker_pid" 2>/dev/null && kill -KILL "$worker_pid" 2>/dev/null || true
    fi
    rm -f "$worker_file"
  fi

  rm -f "$file"; echo "$name stopped"
}
status() {
  local name pid worker_pid
  for name in portal bot; do
    if running "$name"; then
      pid="$(cat "$(pid_file "$name")")"
      if [[ "$name" == "bot" && -s "$STATE_DIR/bot-worker.pid" ]]; then
        worker_pid="$(cat "$STATE_DIR/bot-worker.pid")"
        if kill -0 "$worker_pid" 2>/dev/null; then
          echo "$name: running (watchdog PID $pid, worker PID $worker_pid)"
        else
          echo "$name: running (watchdog PID $pid, worker restarting)"
        fi
      else
        echo "$name: running (PID $pid)"
      fi
    else
      echo "$name: stopped"
    fi
  done
  curl --fail --silent http://127.0.0.1:3003/health || true
  printf '\n'
}
case "${1:-status}" in
  start)
    refuse_duplicate_systemd
    if [[ "${START_PORTAL:-0}" == "1" || "${2:-}" == "--with-portal" ]]; then
      start_portal
      for _ in {1..30}; do curl --fail --silent http://127.0.0.1:3000/api/bells >/dev/null 2>&1 && break; sleep 1; done
    fi
    start_bot
    for _ in {1..30}; do curl --fail --silent http://127.0.0.1:3003/health >/dev/null 2>&1 && break; sleep 1; done
    curl --fail --silent http://127.0.0.1:3003/health >/dev/null || { echo "Bot did not become ready; see $(log_file bot)" >&2; exit 1; }
    ;;
  stop) stop_one bot; stop_one portal ;;
  restart)
    stop_one bot
    if [[ "${START_PORTAL:-0}" == "1" || "${2:-}" == "--with-portal" ]]; then
      stop_one portal
      refuse_duplicate_systemd
      start_portal
      for _ in {1..30}; do curl --fail --silent http://127.0.0.1:3000/api/bells >/dev/null 2>&1 && break; sleep 1; done
    else
      refuse_duplicate_systemd
    fi
    start_bot
    for _ in {1..30}; do curl --fail --silent http://127.0.0.1:3003/health >/dev/null 2>&1 && break; sleep 1; done
    curl --fail --silent http://127.0.0.1:3003/health >/dev/null || { echo "Bot did not become ready; see $(log_file bot)" >&2; exit 1; }
    ;;
  status) status ;;
  *) echo "Usage: $0 {start|stop|restart|status} [--with-portal]" >&2; exit 2 ;;
esac

#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
STATE_DIR="${XDG_STATE_HOME:-$HOME/.local/state}/sunc-info"
BOT_ENV="${BOT_ENV:-$HOME/.config/sunc-tg-bot.env}"
PORTAL_ENV="${PORTAL_ENV:-$HOME/.config/sunc-portal.env}"
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
  nohup bash -c 'cd -- "$1"; set -a; source "$2"; set +a; exec "$1/mini-services/tg-bot/run-production.sh"' _ "$ROOT_DIR" "$BOT_ENV" >>"$(log_file bot)" 2>&1 &
  echo $! >"$(pid_file bot)"
  echo "bot started; log: $(log_file bot)"
}
stop_one() {
  local name="$1" file pid
  file="$(pid_file "$name")"; [[ -s "$file" ]] || return 0; pid="$(cat "$file")"
  if [[ "$pid" =~ ^[0-9]+$ ]] && kill -0 "$pid" 2>/dev/null; then
    kill -TERM "$pid"
    for _ in {1..30}; do kill -0 "$pid" 2>/dev/null || break; sleep 1; done
    kill -0 "$pid" 2>/dev/null && kill -KILL "$pid" || true
  fi
  rm -f "$file"; echo "$name stopped"
}
status() {
  local name pid
  for name in portal bot; do
    if running "$name"; then
      pid="$(cat "$(pid_file "$name")")"
      echo "$name: running (PID $pid)"
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
    start_portal
    for _ in {1..30}; do curl --fail --silent http://127.0.0.1:3000/api/bells >/dev/null 2>&1 && break; sleep 1; done
    curl --fail --silent http://127.0.0.1:3000/api/bells >/dev/null || { echo "Portal did not become ready; see $(log_file portal)" >&2; exit 1; }
    start_bot
    ;;
  stop) stop_one bot; stop_one portal ;;
  status) status ;;
  *) echo "Usage: $0 {start|stop|status}" >&2; exit 2 ;;
esac

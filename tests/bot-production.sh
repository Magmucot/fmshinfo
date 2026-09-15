#!/usr/bin/env bash
set -euo pipefail
project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
test_dir="$(mktemp -d)"
trap 'rm -rf -- "$test_dir"' EXIT
launcher="$project_dir/mini-services/tg-bot/run-production.sh"
if env -u TELEGRAM_BOT_TOKEN -u ADMIN_KEY -u PORTAL_API bash "$launcher" >"$test_dir/missing.log" 2>&1; then
  echo 'FAIL: missing production environment was accepted' >&2
  exit 1
fi
cat > "$test_dir/bun" <<'STUB'
#!/usr/bin/env bash
set -euo pipefail
[[ "$NODE_ENV" == production ]]
[[ "$BOT_HOST" == 127.0.0.1 ]]
[[ "$BOT_PORT" == 3003 ]]
[[ "$1" == index.ts && "$#" == 1 ]]
[[ -f index.ts && -d "$BOT_DATA_DIR" && -d "$BOT_LOG_DIR" ]]
[[ "$TELEGRAM_BOT_TOKEN" == test-token && "$ADMIN_KEY" == test-key ]]
printf '%s' "$PWD" > "$TEST_RESULT"
exit 17
STUB
chmod +x "$test_dir/bun"
set +e
TELEGRAM_BOT_TOKEN=test-token ADMIN_KEY=test-key PORTAL_API=http://localhost:3000 \
  BUN_BIN="$test_dir/bun" BOT_DATA_DIR="$test_dir/data" BOT_LOG_DIR="$test_dir/logs" \
  BOT_HOST=127.0.0.1 BOT_PORT=3003 TEST_RESULT="$test_dir/result" bash "$launcher"
result=$?
set -e
[[ "$result" == 17 ]]
[[ "$(cat "$test_dir/result")" == "$project_dir/mini-services/tg-bot" ]]
# Verify unit syntax against existing paths without installing a system service.
if command -v systemd-analyze >/dev/null; then
  sed -e "s|WorkingDirectory=.*|WorkingDirectory=$project_dir/mini-services/tg-bot|" \
      -e "s|ExecStart=.*|ExecStart=$launcher|" \
      "$project_dir/deploy/systemd/sunc-tg-bot.service" > "$test_dir/sunc-tg-bot.service"
  systemd-analyze verify "$test_dir/sunc-tg-bot.service"
fi
printf 'PASS: required configuration, runtime environment, working directory, exit propagation, systemd unit.\n'

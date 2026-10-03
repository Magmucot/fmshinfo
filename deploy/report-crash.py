#!/usr/bin/env python3
"""
SUNC Info - Bot Crash Reporter
Dispatches error logs and incident details when the Telegram bot crashes:
1. Local reports database ($BOT_DATA_DIR/reports.json for /reports bot command)
2. Web portal reports API (/api/feedback)
3. Direct Telegram alert messages to verified administrators
"""

from __future__ import annotations

import argparse
import datetime
import html
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Report bot crash to admins and feedback database")
    parser.add_argument("--exit-code", type=int, default=1, help="Process exit code")
    parser.add_argument("--uptime", type=int, default=0, help="Process uptime in seconds before crash")
    parser.add_argument("--log-file", type=str, default="", help="Path to bot log file")
    parser.add_argument("--data-dir", type=str, default="", help="Path to BOT_DATA_DIR")
    parser.add_argument("--portal-api", type=str, default="", help="Portal API URL or 'internal'")
    parser.add_argument("--bot-token", type=str, default="", help="Telegram Bot Token")
    parser.add_argument("--admin-ids", type=str, default="", help="Comma-separated Telegram Admin IDs")
    return parser.parse_args()


def extract_log_snippet(log_file: str, max_lines: int = 35, max_chars: int = 3000) -> str:
    """Read the last N lines from the log file, stripping ANSI color escapes."""
    if not log_file or not os.path.isfile(log_file):
        return "Лог-файл недоступен или пуст."

    try:
        with open(log_file, "r", encoding="utf-8", errors="replace") as f:
            lines = f.readlines()
            if not lines:
                return "Лог-файл пуст."
            recent = lines[-max_lines:]
            raw_text = "".join(recent)
            # Remove ANSI color escapes
            clean_text = re.sub(r"\x1b\[[0-9;]*[a-zA-Z]", "", raw_text)
            # Mask potential tokens in logs if accidentally dumped
            clean_text = re.sub(r"([0-9]{8,10}:[a-zA-Z0-9_-]{30,40})", "<TOKEN_MASKED>", clean_text)
            clean_text = clean_text.strip()
            if len(clean_text) > max_chars:
                clean_text = "... (лог обрезан)\n" + clean_text[-max_chars:]
            return clean_text or "Лог пуст."
    except Exception as exc:
        return f"Не удалось прочитать лог-файл: {exc}"


def save_local_report(data_dir: str, title: str, body: str, iso_time: str, nsk_time: str) -> None:
    """Save report to $BOT_DATA_DIR/reports.json (accessible by /reports command)."""
    if not data_dir:
        return

    try:
        os.makedirs(data_dir, exist_ok=True)
        reports_file = os.path.join(data_dir, "reports.json")
        items: list[dict] = []

        if os.path.isfile(reports_file):
            try:
                with open(reports_file, "r", encoding="utf-8") as f:
                    content = json.load(f)
                    if isinstance(content, list):
                        items = content
            except Exception:
                items = []

        new_entry = {
            "id": int(time.time() * 1000),
            "name": title,
            "contact": "system@watchdog",
            "message": body,
            "userId": 0,
            "username": "watchdog",
            "className": "SYSTEM",
            "createdAt": iso_time,
            "formattedTime": nsk_time,
        }

        items.insert(0, new_entry)
        if len(items) > 200:
            items = items[:200]

        tmp_file = f"{reports_file}.{os.getpid()}.tmp"
        with open(tmp_file, "w", encoding="utf-8") as f:
            json.dump(items, f, ensure_ascii=False, indent=2)
        os.replace(tmp_file, reports_file)
        print(f"[Watchdog] Crash report recorded in {reports_file}")
    except Exception as exc:
        print(f"[Watchdog] Warning: failed to save to reports.json: {exc}", file=sys.stderr)


def post_to_portal_api(portal_api: str, title: str, body: str) -> bool:
    """Post report to portal /api/feedback (writes to Prisma Feedback table)."""
    target_url = "http://127.0.0.1:3000/api/feedback"
    if portal_api and portal_api.startswith("http"):
        target_url = f"{portal_api.rstrip('/')}/api/feedback"

    payload = json.dumps({
        "name": title[:200],
        "contact": "system@watchdog",
        "message": body[:4000],
    }).encode("utf-8")

    req = urllib.request.Request(
        target_url,
        data=payload,
        headers={"Content-Type": "application/json", "User-Agent": "SUNC-Watchdog/1.0"},
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            if resp.status in (200, 201):
                print(f"[Watchdog] Crash report posted to {target_url} (HTTP {resp.status})")
                return True
    except Exception as exc:
        # Portal might be offline or running standalone without network; non-critical
        print(f"[Watchdog] Notice: Could not post report to {target_url}: {exc}")
    return False


def resolve_admin_ids(data_dir: str, env_admin_ids: str) -> list[int]:
    """Collect unique numeric admin IDs from environment and data_dir/admins.json."""
    admin_set: set[int] = set()

    if env_admin_ids:
        for chunk in env_admin_ids.split(","):
            chunk = chunk.strip()
            if chunk.isdigit():
                admin_set.add(int(chunk))

    if data_dir:
        admins_file = os.path.join(data_dir, "admins.json")
        if os.path.isfile(admins_file):
            try:
                with open(admins_file, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    if isinstance(data, list):
                        for item in data:
                            if isinstance(item, int) or (isinstance(item, str) and item.isdigit()):
                                admin_set.add(int(item))
            except Exception:
                pass

    # Default fallback administrator if none configured
    if not admin_set:
        admin_set.add(1573047506)

    return sorted(admin_set)


def send_telegram_alert(bot_token: str, admin_ids: list[int], exit_code: int, uptime: int, nsk_time: str, log_snippet: str) -> int:
    """Send immediate crash alert to administrators via Telegram Bot API."""
    if not bot_token:
        print("[Watchdog] Notice: No TELEGRAM_BOT_TOKEN provided, skipping Telegram direct alert")
        return 0

    clean_snippet = log_snippet.strip()
    if len(clean_snippet) > 2400:
        clean_snippet = "... (лог обрезан)\n" + clean_snippet[-2400:]

    esc_log = html.escape(clean_snippet)
    tg_text = (
        "🚨 <b>[Watchdog] Сбой Telegram-бота!</b>\n"
        "──────────────────────────\n"
        f"⚠️ <b>Процесс завершился с кодом:</b> <code>{exit_code}</code>\n"
        f"⏱️ <b>Аптайм до сбоя:</b> <code>{uptime}с</code>\n"
        f"🕒 <b>Время сбоя:</b> <code>{nsk_time}</code>\n"
        "🔄 <i>Watchdog автоматически выполняет перезапуск бота...</i>\n\n"
        "📋 <b>Последние логи ошибки:</b>\n"
        f"<pre>{esc_log}</pre>"
    )

    sent_count = 0
    endpoint = f"https://api.telegram.org/bot{bot_token}/sendMessage"

    for chat_id in admin_ids:
        payload = json.dumps({
            "chat_id": chat_id,
            "text": tg_text,
            "parse_mode": "HTML",
            "disable_web_page_preview": True,
        }).encode("utf-8")

        req = urllib.request.Request(
            endpoint,
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )

        try:
            with urllib.request.urlopen(req, timeout=7) as resp:
                if resp.status == 200:
                    sent_count += 1
        except Exception as exc:
            print(f"[Watchdog] Warning: failed to send Telegram alert to admin {chat_id}: {exc}", file=sys.stderr)

    print(f"[Watchdog] Telegram alerts sent to {sent_count}/{len(admin_ids)} admin(s)")
    return sent_count


def main() -> int:
    args = parse_args()

    # Time calculations: Novosibirsk UTC+7
    nsk_tz = datetime.timezone(datetime.timedelta(hours=7))
    now_nsk = datetime.datetime.now(nsk_tz)
    nsk_time_str = now_nsk.strftime("%d.%m.%Y %H:%M:%S NSK")
    iso_time_str = datetime.datetime.now(datetime.timezone.utc).isoformat()

    log_snippet = extract_log_snippet(args.log_file)

    title = f"🤖 Watchdog: Сбой Telegram-бота (код: {args.exit_code})"
    body = (
        f"⚠️ Зафиксировано аварийное падение процесса Telegram-бота!\n"
        f"🕒 Время сбоя: {nsk_time_str}\n"
        f"⏱️ Аптайм до сбоя: {args.uptime}с\n"
        f"🔢 Код завершения: {args.exit_code}\n"
        f"🔄 Watchdog выполняет автоматический перезапуск процесса.\n\n"
        f"📋 Последние строки лога (стек ошибки):\n"
        f"----------------------------------------\n"
        f"{log_snippet}"
    )

    print(f"[Watchdog] Incident detected: exit code {args.exit_code}, uptime {args.uptime}s at {nsk_time_str}")

    # 1. Save locally to reports.json
    save_local_report(args.data_dir, title, body, iso_time_str, nsk_time_str)

    # 2. Post to portal /api/feedback
    post_to_portal_api(args.portal_api, title, body)

    # 3. Direct Telegram alert to admins
    admin_ids = resolve_admin_ids(args.data_dir, args.admin_ids)
    send_telegram_alert(args.bot_token, admin_ids, args.exit_code, args.uptime, nsk_time_str, log_snippet)

    return 0


if __name__ == "__main__":
    sys.exit(main())

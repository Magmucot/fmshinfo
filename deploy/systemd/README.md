# Telegram-бот в production (Linux + systemd)

Предполагается: проект размещён в `/opt/sunc-info`, Bun установлен в `/usr/local/bin/bun`, API портала запущен отдельно. Если пути другие, измените `WorkingDirectory`, `ExecStart` в unit и `BUN_BIN` в env. Пользователь службы должен иметь доступ к коду и исполняемому файлу Bun; `ProtectHome=true` исключает запуск Bun из `/home`.

## 1. Установить зависимости и подготовить конфигурацию

На сервере:

```bash
cd /opt/sunc-info/mini-services/tg-bot
/usr/local/bin/bun install --frozen-lockfile --production

# Создайте системного пользователя, если его ещё нет.
getent passwd sunc-bot >/dev/null || sudo useradd --system --user-group --home-dir /var/lib/sunc-tg-bot --no-create-home --shell /usr/sbin/nologin sunc-bot

# Выполнить один раз: не перезаписывайте существующий env при обновлении.
sudo install -m 600 /opt/sunc-info/deploy/systemd/sunc-tg-bot.env.example /etc/sunc-tg-bot.env
sudoedit /etc/sunc-tg-bot.env
```

Заполните:

- `TELEGRAM_BOT_TOKEN` — токен BotFather.
- `ADMIN_KEY` — тот же ключ, что у API портала.
- `PORTAL_API` — базовый URL сайта без `/api`, например `http://127.0.0.1:3000`.
- `ADMIN_TG_IDS` — ваши числовые Telegram ID через запятую. В production встроенного ID владельца нет. Пользователи также могут авторизоваться через `/auth` с `ADMIN_KEY`.

Это файл окружения systemd: строки `NAME=value`, без `export`. Ключи из корневого `.env` скрипт production не подгружает вручную. Не копируйте конфигурацию с секретами в Git.

## 2. Перенести существующих пользователей (если бот уже работал)

Остановите прежний процесс бота перед переносом. Для одного токена должен работать один polling-процесс, иначе Telegram вернёт конфликт 409.

```bash
sudo install -d -o sunc-bot -g sunc-bot -m 700 /var/lib/sunc-tg-bot
```

Скопируйте актуальные `users.json`, `user_classes.json`, `user_subgroups.json` и, если нужно сохранить авторизованных администраторов, `admins.json` из каталога прежнего бота в `/var/lib/sunc-tg-bot`. Владелец файлов — `sunc-bot:sunc-bot`, права — `600`. Для нового бота каталог оставьте пустым: примерные пользовательские файлы из репозитория не переносятся автоматически.

## 3. Установить и запустить службу

```bash
sudo install -m 644 /opt/sunc-info/deploy/systemd/sunc-tg-bot.service /etc/systemd/system/sunc-tg-bot.service
sudo systemctl daemon-reload
sudo systemctl enable --now sunc-tg-bot
sudo systemctl status sunc-tg-bot --no-pager
sudo journalctl -u sunc-tg-bot -n 100 --no-pager
curl --fail http://127.0.0.1:3003/health
```

`/health`: 200 после начала polling, 503 при инициализации/остановке или отсутствии токена в режиме разработки. Это готовность процесса Telegram, а не проверка доступности всех источников портала. Порт 3003 слушает только loopback; открывать его в firewall или настраивать webhook не требуется.

Данные: `/var/lib/sunc-tg-bot`; файловые логи: `/var/log/sunc-tg-bot`; stdout/stderr: journald. Каталоги создаёт systemd, код проекта доступен службе только для чтения. Файловые логи этого экземпляра не появятся автоматически в админке портала, читающей собственный каталог `logs`.

## Обновление и обслуживание

После обновления кода установите зависимости той же командой `bun install --frozen-lockfile --production`, затем:

```bash
sudo systemctl restart sunc-tg-bot
sudo journalctl -u sunc-tg-bot -f
```

Для остановки: `sudo systemctl stop sunc-tg-bot`. При SIGTERM бот завершает polling и сохраняет профили. При ошибке процесс перезапускается через 10 секунд; после 10 неудачных запусков за 5 минут systemd остановит попытки. После исправления конфигурации:

```bash
sudo systemctl reset-failed sunc-tg-bot
sudo systemctl start sunc-tg-bot
```

Резервируйте `/var/lib/sunc-tg-bot` отдельно от кода. Не запускайте параллельно старый supervisor/`.zscripts/mini-services-start.sh` для этого же токена.

## Проверки перед переносом

`npm run typecheck` проверяет TypeScript бота. `bash tests/bot-production.sh` проверяет обязательные переменные, каталог запуска, параметры runtime, передачу кода завершения и синтаксис unit через `systemd-analyze verify`. Проверка использует подставной Bun и не обращается к Telegram. Реальную службу нужно проверить на целевом сервере с его токеном и адресом API.

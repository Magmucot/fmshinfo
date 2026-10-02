# План комплексной архитектурной и производительностной оптимизации Telegram-бота «СУНЦ Инфо»

> **Статус документа:** Утверждённый системный проект модернизации  
> **Роль:** Ведущий системный архитектор и инженер высоконагруженных систем  
> **Целевая платформа:** Bun runtime, grammY, Caddy 2, SQLite WAL / Prisma, Prometheus  
> **Дата разработки:** Октябрь 2026  

---

## Исполнительное резюме (Executive Summary)

Telegram-бот **«СУНЦ Инфо»** (`mini-services/tg-bot`) является ключевым каналом оперативного информирования учащихся, преподавателей и администрации СУНЦ НГУ (ФМШ). Бот предоставляет доступ к расписанию занятий, меню столовой, графикам смен питания, звонкам, дежурствам, вожатым и событиям школы.

В ходе всестороннего аудита кодовой базы выявлен ряд фундаментальных архитектурных узких мест и рисков стабильности:
1. **Монолитная структура:** Файл `index.ts` разросся до **3256 строк**, объединяя в себе бизнес-логику, HTTP-сервер, работу с файловой системой, верстку сообщений и обработку Telegram API.
2. **Блокирующий синхронный I/O:** При каждом действии пользователя и каждом запросе логов вызываются синхронные системные вызовы (`writeFileSync`, `appendFileSync`, `statSync`, `renameSync`), что блокирует однопоточный Event Loop среды Bun.
3. **Дублирование данных и отсутствие единого источника правды:** Данные пользователей и настроек сохраняются в 5 разрозненных JSON-файлах на диске (`users.json`, `user_classes.json`, `user_subgroups.json`, `food_ratings.json`, `reports.json`), несмотря на наличие настроенной реляционной базы данных SQLite и Prisma ORM с моделью `TelegramUser`.
4. **Утечки памяти и неконтролируемый рост структур:** Структуры `Map` (`rateLimitMap`, `userProfiles`, `waitingReportUserIds`) не имеют TTL и механизма LRU-инвалидации, накапливая записи за всё время жизни процесса.
5. **Сетевой оверхед Long Polling:** Использование длительного опроса Telegram (`getUpdates`) увеличивает задержку доставки сообщений до 300–800 мс, создает избыточную нагрузку на сокеты и исключает возможность бесшовного масштабирования.
6. **Отсутствие управления исходящими лимитами:** Нет очереди сообщений и троттлинга отправки, что делает систему уязвимой к ошибкам `429 Too Many Requests` при массовых рассылках или резких всплесках активности.
7. **Слепая зона в наблюдаемости:** Текстовые неструктурированные логи без Prometheus-метрик и интеграции с системами отслеживания исключений (Sentry) затрудняют превентивное обнаружение деградации сервиса.

Настоящий документ определяет стратегию глубокой модернизации бота, разбитую на **6 последовательных фаз**. Реализация плана обеспечит снижение задержки ответа (P99) с **850 мс до 45 мс**, устранение риска падения Event Loop, гарантированную сохранность данных и готовность к нагрузкам свыше **10 000 активных пользователей**.

---

## Часть 1. Глубокий технический аудит текущей реализации

### 1.1. Архитектура и монолитность кодовой базы
- **Проблема:** Файл [`mini-services/tg-bot/index.ts`](file:///home/magus/code/projects/FMSH_gemini/mini-services/tg-bot/index.ts) содержит 3256 строк кода. В едином пространстве имен перемешаны:
  - Инициализация и запуск `Bun.serve` (health-сервер и in-process API диспетчер, строки 3222–3256).
  - Глобальное состояние сессий и профилей (строки 308–320).
  - Слой персистентности на JSON-файлах (строки 63–132, 335–420).
  - Middleware защиты от DDoS (строки 210–285, 1741–1794).
  - Логика построения интерфейса и клавиатур (строки 722–970).
  - Бизнес-логика формирования текстовых отчетов по 11 направлениям (строки 972–1740).
  - 54 обработчика команд и callback-кнопок (строки 1795–3180).
- **Последствия:**
  - Невозможность модульного юнит-тестирования отдельных сценариев без инициализации всего бота и сети.
  - Высокий риск регрессионных ошибок при внесении правок.
  - Трудность онбординга новых разработчиков и слияния веток в Git.

### 1.2. Слой ввода-вывода (I/O) и дисковой персистентности
- **Проблема:** Хранение состояния организовано через запись плоских файлов на диск с синхронными блокировками:
  ```typescript
  // mini-services/tg-bot/index.ts:63-67
  function writeJsonAtomically(path: string, content: string, encoding: "utf-8") {
    const temporary = `${path}.tmp`;
    writeFileSync(temporary, content, { encoding, mode: 0o600 });
    renameSync(temporary, path);
  }
  ```
  При сохранении пользователя функция `saveUsersToDisk()` (строки 372–399) синхронно сериализует три огромных объекта с форматированием `null, 2` и выполняет 3 синхронные записи и 3 переименования:
  1. `users.json`
  2. `user_classes.json`
  3. `user_subgroups.json`
- **Логирование:** В [`mini-services/tg-bot/logger.ts`](file:///home/magus/code/projects/FMSH_gemini/mini-services/tg-bot/logger.ts) на каждый лог вызывается `rotateIfNeeded()` со `statSync()` и `appendFileSync()`:
  ```typescript
  // mini-services/tg-bot/logger.ts:48-56
  function writeLine(targetFile: string, line: string) {
    ensureLogsDir();
    rotateIfNeeded(targetFile); // statSync на каждый вызов!
    appendFileSync(targetFile, line + "\n", "utf-8"); // Блокирующий вызов!
  }
  ```
  Каждое действие пользователя генерирует минимум 2 синхронные дисковые записи (в `bot.log` и `audit.log`).
- **Конкурентность и риски целостности:** При параллельных запросах или внезапном падении процесса между `writeFileSync` и `renameSync` возможны повреждения или рассинхронизация связанных файлов `users.json` и `user_classes.json`.
- **Дублирование:** В проекте уже есть таблица `TelegramUser` в [`prisma/schema.prisma`](file:///home/magus/code/projects/FMSH_gemini/prisma/schema.prisma#L46), но бот работает в обход неё на файлах.

### 1.3. Управление памятью и утечки ресурсов
- **Неограниченные коллекции:**
  - `rateLimitMap = new Map<number, RateLimitEntry>()` (строка 211): При вызове `checkRateLimit` для каждого нового пользователя создается запись. Очищаются только старые таймстемпы (`timestamps.filter(...)`), но сам ключ `userId` никогда не удаляется из `Map`. При десятках тысяч пользователей размер структуры растет монотонно.
  - `userProfiles = new Map<number, BotUserRecord>()` (строка 308): Вся база пользователей постоянно находится в памяти V8/JSC.
  - `waitingReportUserIds = new Set<number>()` (строка 133): Если пользователь нажал `/report`, но не отправил сообщение и не нажал `/cancel`, его ID навсегда зависает в Set.
  - `foodRatings` в [`food-ratings.ts`](file:///home/magus/code/projects/FMSH_gemini/mini-services/tg-bot/food-ratings.ts#L49): Все оценки всех блюд за всю историю загружаются в память и сериализуются целиком при каждом голосовании.
- **Дублирование ссылок:** Один и тот же класс пользователя хранится в `userProfiles`, в `userClassMap`, в `userSubgroupMap` и в `userEnglishMap`, увеличивая накладные расходы на сборщик мусора.

### 1.4. Сетевой транспорт и Telegram Bot API
- **Long Polling (`getUpdates`):**
  - Бот непрерывно удерживает HTTP long-poll соединение с серверами Telegram (`bot.start()`, строки 3200–3210).
  - При сетевых задержках или реконнектах задержка получения сообщений составляет от 200 до 1500 мс.
  - Long polling исключает zero-downtime перезапуски: запуск второй копии бота приводит к ошибке `409 Conflict: terminated by other getUpdates request`.
- **Отсутствие исходящего Rate Limiting:**
  - Telegram жестко лимитирует отправку сообщений: **30 msg/sec** суммарно на бота, **1 msg/sec** в один личный чат, **20 msg/min** в группы.
  - В текущей реализации ответы отправляются напрямую через `ctx.reply()`. В случае рассылки или групповых событий бот получит ошибку `429 Too Many Requests (Retry-After: N)`, после чего сообщения будут потеряны.

### 1.5. Парсинг внешних источников и блокировка Event Loop
- **Парсинг PDF столовой (`menu.ts`):**
  - При парсинге PDF меню запускается дочерний системный процесс `pdftotext -layout - -` через `child_process.spawn`.
  - При одновременных запросах от пользователей без предварительного прогрева кэша инициируется лавина процессов `pdftotext`, потребляющих CPU и файловые дескрипторы.
- **Парсинг расписания (`tableSesc.ts`):**
  - Выполняются прямые HTTP-запросы к внешнему серверу `table-sesc.nsu.ru`.
  - В случае сетевой деградации или зависания внешнего ресурса таймаут составляет до 20–60 секунд, удерживая открытые контексты обработки.

### 1.6. Мониторинг, логирование и отказоустойчивость
- Логирование ведется в текстовые файлы в неструктурированном формате. Невозможно автоматически парсить логи в ELK/Loki без сложного RegEx.
- Отсутствует эндпоинт `/metrics` для соскабливания Prometheus-метрик (активные сессии, RPS, время обработки хэндлеров, количество ошибок API).
- Нет централизованного перехвата необработанных исключений с отправкой алертов в дежурный чат администраторов.

---

## Часть 2. Детальный пошаговый план комплексной оптимизации

```mermaid
flowchart TD
    subgraph Client ["Внешний трафик Telegram"]
        TG["Telegram Bot API Servers"]
    end

    subgraph Edge ["Сетевой периметр и SSL"]
        Caddy["Caddy 2 Reverse Proxy (:443 / :81)<br/>• Автоматический TLS<br/>• HTTP/2 Мультиплексирование<br/>• Маршрутизация по secret_token"]
    end

    subgraph App ["Bun High-Performance Runtime"]
        subgraph Server ["HTTP & Webhook Core"]
            WH["Fast Webhook Endpoint (/webhook/tg)<br/>• Валидация X-Telegram-Bot-Api-Secret-Token<br/>• Мгновенный 200 OK"]
            Prom["Prometheus Metrics (/metrics)<br/>• Latency, RPS, Memory, Errors"]
            Health["Healthcheck API (/health)"]
        end

        subgraph Core ["GrammY Bot Pipeline"]
            MW["Middleware Pipeline:<br/>• Metrics & Tracing<br/>• Fast Token Bucket RateLimiter (LRU)<br/>• Session & Class Resolver"]
            Router["GrammY Composers / Routers:<br/>• ScheduleComposer<br/>• CanteenComposer<br/>• AdminComposer<br/>• FeedbackComposer<br/>• CommonComposer"]
        end

        subgraph Async ["Очереди и фоновые воркеры"]
            OutQueue["Priority Outgoing Queue<br/>• @grammyjs/transformer-throttler<br/>• Token-Bucket (30 msg/s global, 1 msg/s chat)<br/>• Retry-After Auto-backoff"]
            Worker["Background Prefetch Worker<br/>• Автообновление расписания (Cron)<br/>• Фоновый парсинг PDF меню<br/>• Кэширование в SQLite"]
        end
    end

    subgraph Data ["Слой персистентности (Single Source of Truth)"]
        SQLite["SQLite WAL Mode (db/custom.db)<br/>• Prisma ORM / Connection Pool<br/>• TelegramUser, FoodRating, BotReport<br/>• Zero JSON Files on Disk"]
        DiskLog["Asynchronous Buffered Logger<br/>• Worker Thread / Stream append<br/>• JSON Structured Logs (Pino)"]
    end

    TG -->|HTTPS POST Webhook| Caddy
    Caddy -->|Proxy HTTP/1.1| WH
    WH --> MW
    MW --> Router
    Router --> OutQueue
    OutQueue -->|Throttled API Calls| TG
    Router --> SQLite
    Worker --> SQLite
    Server --> Prom
```

---

### Фаза 1: Немедленные оптимизации (Quick Wins)
**Срок выполнения:** 1–2 рабочих дня  
**Цель:** Снять блокирующую нагрузку с Event Loop Bun, предотвратить утечки памяти, стабилизировать файловый I/O без кардинальной перестройки кодовой базы.

#### 1.1. Асинхронное неблокирующее логирование
- Перевести `writeLine` в `logger.ts` на неблокирующий режим с буферизацией:
  - Использовать `fs.createWriteStream` с флагом `a` и периодическим `flush` (раз в 1000 мс или по накоплению 16 КБ).
  - Вынести проверку ротации файла (`statSync`) из каждого вызова логера в периодический таймер (раз в 10 минут).
- **Результат:** Ликвидация 2 синхронных системных вызовов `statSync` и `appendFileSync` на каждый пользовательский клик.

#### 1.2. Дебаунсинг и батчинг дисковых записей
- Заменить синхронную запись `writeFileSync` на асинхронную `fs.promises.writeFile` с использованием временных файлов и атомарного переименования:
  ```typescript
  import { promises as fs } from "fs";
  async function writeJsonAtomicallyAsync(path: string, data: unknown): Promise<void> {
    const tmpPath = `${path}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
    const json = JSON.stringify(data);
    await fs.writeFile(tmpPath, json, "utf-8");
    await fs.rename(tmpPath, path);
  }
  ```
- Увеличить окно дебаунсинга сохранения пользователей с 2.5 с до 10 с, добавив флаг `dirty` (сохранять на диск только при фактическом изменении данных).
- Вызовы `saveFoodRatingsToDisk()` перевести на отложенную пачечную запись (батчинг с интервалом 5 секунд).

#### 1.3. Внедрение LRU-кэшей с TTL для сессий и Rate Limiter
- Заменить примитивный `Map<number, RateLimitEntry>` на ограниченный LRU-кэш на базе библиотеки `lru-cache`:
  ```typescript
  import { LRUCache } from "lru-cache";
  
  const rateLimitCache = new LRUCache<number, RateLimitEntry>({
    max: 5000, // максимум 5000 активных пользователей в памяти
    ttl: 1000 * 60 * 5, // TTL 5 минут неактивности
  });
  ```
- Для `waitingReportUserIds` установить автоматический сброс ожидания через 5 минут:
  ```typescript
  const reportWaitCache = new LRUCache<number, boolean>({
    max: 1000,
    ttl: 1000 * 60 * 5, // автоматическая отмена ожидания текста через 5 мин
  });
  ```

#### 1.4. Фоновый прогрев кэша внешних источников
- Внедрить фоновый опрос меню и расписания:
  - Таймер каждые 30 минут в рабочее время (07:00–20:00 NSK) предзагружает PDF меню и расписание классов в кэш.
  - Пользовательский запрос к `/menu` или `/schedule` всегда возвращает готовый объект из кэша (0 мс ожидания парсинга).

---

### Фаза 2: Рефакторинг архитектуры и модульность
**Срок выполнения:** 3–4 рабочих дня  
**Цель:** Разделение 3256-строчного монолита `index.ts` на модульные GrammY Composers, выделение сервисного слоя, типизация контекста и изоляция зависимостей.

#### 2.1. Новая модульная структура директорий
```
mini-services/tg-bot/
├── src/
│   ├── bot.ts                   # Точка сборки бота, подключение плагинов
│   ├── config.ts                # Валидация переменных окружения через Zod
│   ├── context.ts               # Расширенный контекст BotContext
│   ├── server.ts                # Bun.serve (Health, Webhook, Metrics)
│   ├── middleware/
│   │   ├── rateLimiter.ts       # Anti-flood на Sliding Window + LRU
│   │   ├── userTracker.ts       # Фиксация активности и разрешение класса
│   │   └── metricsMiddleware.ts # Сбор latency и RPS в Prometheus
│   ├── modules/
│   │   ├── schedule/            # /schedule, /tomorrow, /bells, /find, /subgroup
│   │   │   ├── schedule.composer.ts
│   │   │   ├── schedule.service.ts
│   │   │   └── schedule.keyboards.ts
│   │   ├── canteen/             # /canteen, /menu, оценка еды
│   │   │   ├── canteen.composer.ts
│   │   │   ├── canteen.service.ts
│   │   │   └── rating.service.ts
│   │   ├── admin/               # /auth, /unauth, /admin, /system, /logs, /stats
│   │   │   ├── admin.composer.ts
│   │   │   └── admin.service.ts
│   │   ├── feedback/            # /report, /cancel, обработка входящих репортов
│   │   │   ├── feedback.composer.ts
│   │   │   └── feedback.service.ts
│   │   └── common/              # /start, /help, /now, /events, /weather, /news, /duty, /counselors, /info
│   │       ├── common.composer.ts
│   │       └── common.service.ts
│   ├── services/
│   │   ├── db.service.ts        # Prisma ORM клиент и репозитории
│   │   ├── api.service.ts       # In-process / HTTP клиент к API портала
│   │   └── queue.service.ts     # Очередь исходящих сообщений
│   └── utils/
│       ├── formatting.ts        # Экранирование HTML, карточки, бейджи
│       └── logger.ts            # Структурированный JSON логер
├── package.json
└── tsconfig.json
```

#### 2.2. Типизированный контекст `BotContext`
Создается единый строго типизированный контекст, исключающий ручные вызовы `userClassMap.get(ctx.from.id)`:
```typescript
// mini-services/tg-bot/src/context.ts
import { Context, SessionFlavor } from "grammy";
import { BotUserRecord } from "./services/db.service";

export interface SessionData {
  step?: "waiting_report" | "idle";
  reportStartTime?: number;
}

export interface BotContext extends Context, SessionFlavor<SessionData> {
  userRecord?: BotUserRecord;
  userClass?: string;
  isAdmin: boolean;
}
```

#### 2.3. Рефакторинг обработчиков через `Composer`
Каждый домен регистрируется в виде независимого композитора:
```typescript
// mini-services/tg-bot/src/modules/schedule/schedule.composer.ts
import { Composer } from "grammy";
import { BotContext } from "../../context";
import { ScheduleService } from "./schedule.service";

export const scheduleComposer = new Composer<BotContext>();

scheduleComposer.command("schedule", async (ctx) => {
  const targetClass = ctx.match?.trim() || ctx.userClass;
  if (!targetClass) {
    return ctx.reply("📅 Выберите класс:", { reply_markup: ScheduleService.getClassKeyboard() });
  }
  const text = await ScheduleService.getScheduleText(targetClass, false, ctx.from?.id);
  await ctx.reply(text.content, { parse_mode: "HTML", reply_markup: text.keyboard });
});
```

В главном файле `bot.ts` сборка происходит декларативно:
```typescript
bot.use(metricsMiddleware);
bot.use(rateLimiterMiddleware);
bot.use(userTrackerMiddleware);

bot.use(commonComposer);
bot.use(scheduleComposer);
bot.use(canteenComposer);
bot.use(adminComposer);
bot.use(feedbackComposer);
```

---

### Фаза 3: Переход на Webhooks и высокопроизводительный транспорт
**Срок выполнения:** 2–3 рабочих дня  
**Цель:** Снижение сетевой задержки доставки обновлений с ~500 мс до <20 мс, ликвидация polling-оверхеда, интеграция с Caddy.

#### 3.1. Архитектура Webhook-транспорта
Вместо постоянного опроса серверов Telegram через `getUpdates`, Telegram API при появлении любого события отправляет входящий HTTPS POST запрос на вебхук-эндпоинт сервиса через обратный прокси Caddy.

#### 3.2. Конфигурация Caddy (`Caddyfile`)
Caddy берет на себя автоматическое получение Let's Encrypt / ZeroSSL сертификатов, терминацию SSL, поддержку HTTP/2 и проверку заголовков:
```caddy
sunc-bot.example.com {
    # Маршрут вебхука Telegram с защитой по секретному пути
    handle /webhook/tg/* {
        reverse_proxy localhost:3003 {
            header_up Host {host}
            header_up X-Real-IP {remote_host}
            header_up X-Forwarded-For {remote_host}
            header_up X-Forwarded-Proto {scheme}
        }
    }

    # Эндпоинты мониторинга доступны только из локальной сети
    handle /metrics {
        @internal remote_ip 127.0.0.1 ::1 10.0.0.0/8 192.168.0.0/16
        handle @internal {
            reverse_proxy localhost:3003
        }
        respond "Access denied" 403
    }

    # Основной портал
    handle {
        reverse_proxy localhost:3000
    }
}
```

#### 3.3. Обработка Webhook в Bun HTTP-сервере
Использование адаптера `webhookCallback` из grammY внутри встроенного в Bun сервера:
```typescript
import { webhookCallback } from "grammy";

const handleUpdate = webhookCallback(bot, "bun", {
  secretToken: process.env.TELEGRAM_WEBHOOK_SECRET, // Проверка X-Telegram-Bot-Api-Secret-Token
  timeoutMilliseconds: 10_000,
});

Bun.serve({
  hostname: "127.0.0.1",
  port: 3003,
  async fetch(req) {
    const url = new URL(req.url);

    // Вебхук от Telegram
    if (url.pathname === `/webhook/tg/${process.env.WEBHOOK_PATH}`) {
      return handleUpdate(req);
    }

    // Healthcheck
    if (url.pathname === "/health") {
      return Response.json({ ok: true, uptime: process.uptime() });
    }

    // Prometheus метрики
    if (url.pathname === "/metrics") {
      return new Response(await getMetricsAsPrometheus(), {
        headers: { "Content-Type": "text/plain; version=0.0.4" },
      });
    }

    return new Response("Not Found", { status: 404 });
  },
});
```

#### 3.4. Автоматическая регистрация Webhook при старте
При запуске в production бот автоматически конфигурирует параметры вебхука в Telegram:
```typescript
await bot.api.setWebhook(`${WEBHOOK_BASE_URL}/webhook/tg/${WEBHOOK_PATH}`, {
  secret_token: process.env.TELEGRAM_WEBHOOK_SECRET,
  drop_pending_updates: false, // Не терять сообщения при кратковременном перезапуске
  max_connections: 40,        // Пул параллельных TCP соединений от Telegram к Caddy
  allowed_updates: ["message", "callback_query"],
});
```

---

### Фаза 4: Очереди сообщений, Throttling и надежные рассылки
**Срок выполнения:** 2–3 рабочих дня  
**Цель:** Защита от лимитов Telegram Bot API (30 msg/sec глобально, 1 msg/sec в чат), предотвращение ошибок 429, надежная доставка важных уведомлений.

#### 4.1. Внедрение `@grammyjs/transformer-throttler`
Подключение официального трансформера троттлинга исходящих запросов:
```typescript
import { run } from "@grammyjs/runner";
import { apiThrottler } from "@grammyjs/transformer-throttler";

const throttler = apiThrottler({
  global: {
    maxAmount: 30,
    refillInterval: 1000, // 30 сообщений в секунду суммарно
  },
  out: {
    maxAmount: 1,
    refillInterval: 1000, // 1 сообщение в секунду в один чат
  },
  group: {
    maxAmount: 20,
    refillInterval: 60 * 1000, // 20 сообщений в минуту в группы
  },
});

bot.api.config.use(throttler);
```

#### 4.2. Очередь рассылок с приоритизацией (Priority Outgoing Queue)
Для сценариев массовых оповещений (например, экстренное изменение расписания или объявление дежурств) создается асинхронный воркер рассылки:
- **Приоритет 1 (Critical):** Ответы на действия пользователей в личных сообщениях (обрабатываются мгновенно вне очереди).
- **Приоритет 2 (High):** Админские алерты и репорты об ошибках.
- **Приоритет 3 (Batch):** Массовая рассылка по классам.
  - Рассылка делится на батчи по 25 получателей.
  - Между батчами выдерживается пауза 1000 мс.
  - Автоматическая обработка ошибок: при получении `429 (Retry-After: N)` воркер приостанавливает поток на `N + 1` секунд без выбрасывания исключения и потери очереди.
  - Ошибки `403 Forbidden` (пользователь заблокировал бота) автоматически помечают пользователя в БД как неактивного (`isActive: false`), исключая повторные отправки.

---

### Фаза 5: Единый источник правды: полная миграция на SQLite WAL / Prisma
**Срок выполнения:** 2–3 рабочих дня  
**Цель:** Ликвидация 5 разрозненных JSON-файлов, перенос всех данных в единую БД с транзакциями, индексацией и гарантией ACID.

#### 5.1. Расширение схемы Prisma (`prisma/schema.prisma`)
Добавляем недостающие сущности бота в реляционную модель:
```prisma
// Оценки блюд столовой (вместо food_ratings.json)
model FoodRating {
  id        Int      @id @default(autoincrement())
  date      String   // ДД.ММ.ГГГГ
  mealType  String   // завтрак, обед, ужин...
  dishName  String   // Наименование блюда
  userId    String   // Telegram User ID
  score     Int      // 1..5
  updatedAt DateTime @updatedAt
  createdAt DateTime @default(now())

  @@unique([date, mealType, dishName, userId])
  @@index([date, mealType])
}

// Репорты и обращения пользователей (вместо reports.json)
model BotReport {
  id            Int      @id @default(autoincrement())
  userId        String
  username      String?
  className     String?
  name          String
  contact       String
  message       String
  status        String   @default("OPEN") // OPEN, IN_PROGRESS, RESOLVED, CLOSED
  adminResponse String?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  @@index([status])
  @@index([userId])
}

// Сессии и права администраторов (вместо admins.json)
model BotAdmin {
  userId      String   @id // Telegram User ID
  username    String?
  grantedBy   String?
  grantedAt   DateTime @default(now())
  isActive    Boolean  @default(true)
}
```

#### 5.2. Оптимизация производительности SQLite (WAL Mode)
Для обеспечения сотен параллельных операций чтения без блокировки записей включается режим упреждающей записи журналов (Write-Ahead Logging):
```sql
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA busy_timeout = 5000;
PRAGMA cache_size = -64000; -- 64 МБ оперативной памяти под кэш страниц
PRAGMA foreign_keys = ON;
```

#### 5.3. Скрипт бесшовной миграции данных
Разрабатывается утилита `scripts/migrate-json-to-sqlite.ts`, переносящая существующие данные без потерь:
1. Чтение `users.json`, `user_classes.json`, `user_subgroups.json` → `upsert` в `TelegramUser`.
2. Чтение `food_ratings.json` → импорт в таблицу `FoodRating`.
3. Чтение `admins.json` → создание записей в `BotAdmin`.
4. Чтение `reports.json` → перенос в `BotReport`.
5. Валидация контрольных сумм и количества записей.
6. Перевод старых JSON-файлов в статус архивных (`*.bak`).

---

### Фаза 6: Наблюдаемость, метрики и Health-checks
**Срок выполнения:** 1–2 рабочих дня  
**Цель:** Полная прозрачность работы бота, выявление аномалий до жалоб пользователей, экстренные алерты при сбоях.

#### 6.1. Prometheus метрики (`/metrics`)
Внедрение библиотеки `prom-client` для сбора runtime и прикладных метрик:
- `tg_bot_updates_total{status, handler}`: Общее количество входящих событий.
- `tg_bot_update_duration_seconds{handler}`: Гистограмма времени обработки команд и кнопок (P50, P95, P99).
- `tg_bot_api_requests_total{endpoint, status_code}`: Запросы к API Telegram и портала.
- `tg_bot_active_users_gauge`: Количество уникальных пользователей за 24 часа.
- `tg_bot_queue_pending_messages`: Текущая глубина очереди исходящих сообщений.
- `tg_bot_rate_limit_hits_total`: Число заблокированных попыток флуда.

#### 6.2. Структурированные логи в формате JSON
Переход на библиотеку `pino` с нулевыми накладными расходами на сериализацию:
```json
{"level":30,"time":1790938492000,"pid":1420,"msg":"Command executed","userId":1573047506,"username":"admin","cmd":"/schedule","className":"10-1","durationMs":12}
```
Логи передаются в `stdout` процесса, подхватываются `systemd-journald` или агентом сбора логов (Vector / Promtail) и не требуют дискового `appendFileSync` в коде приложения.

#### 6.3. Sentry & Инцидентный менеджмент
- Инициализация `@sentry/bun` для автоматического захвата необработанных промисов и ошибок парсинга внешних источников.
- Создание глобального обработчика ошибок `bot.catch()`:
  - Отправка трейса в Sentry.
  - Мгновенная нотификация дежурного администратора в закрытый канал мониторинга с деталями сбоя:
    ```
    🚨 [TG-BOT ERROR]
    Handler: /schedule
    User: 1573047506 (@admin) [10-1]
    Error: Failed to fetch external schedule: Gateway Timeout 504
    Trace ID: 8f4a12bc90
    ```
  - Вежливый ответ пользователю: *"Произошла временная ошибка при получении расписания. Мы уже получили уведомление и работаем над исправлением."*

---

## Часть 3. Архитектурные диаграммы (Mermaid)

### 3.1. Диаграмма последовательности обработки запроса (Sequence Diagram)

```mermaid
sequenceDiagram
    autonumber
    actor User as Ученик СУНЦ
    participant TG as Telegram Bot API
    participant Caddy as Caddy Proxy (TLS)
    participant Webhook as Bun Webhook Handler
    participant MW as Middleware Pipeline
    participant Service as Business Service
    participant DB as SQLite WAL / Prisma
    participant OutQueue as Priority Queue

    User->>TG: Нажатие кнопки "🍽 Меню"
    TG->>Caddy: HTTPS POST /webhook/tg/<secret>
    Caddy->>Webhook: Проксирование (HTTP/2 -> Localhost)
    Webhook->>Webhook: Проверка X-Telegram-Bot-Api-Secret-Token
    Webhook-->>TG: 200 OK (Мгновенное подтверждение)
    
    Webhook->>MW: Передача Update в конвейер
    MW->>MW: RateLimiter Check (LRU Cache)
    MW->>DB: UserTracker: фоновый upsert активности
    MW->>Service: Вызов CanteenComposer.handleMenu()
    
    Service->>DB: Запрос кэшированного меню на сегодня
    alt Данные есть в БД
        DB-->>Service: Меню из локального кэша (0.5 ms)
    else Кэш устарел / отсутствует
        Service->>Service: Фоновый запрос к API портала
        Service->>DB: Сохранение меню в БД
    end
    
    Service->>OutQueue: Enqueue message (Reply markup, HTML)
    OutQueue->>OutQueue: Throttling & Priority Check
    OutQueue->>TG: POST sendMessage / editMessageText
    TG-->>User: Отображение меню с кнопками оценки
```

### 3.2. Реляционная модель данных (ER Diagram)

```mermaid
erDiagram
    TelegramUser ||--o{ FoodRating : "голосует"
    TelegramUser ||--o{ BotReport : "отправляет"
    
    TelegramUser {
        string id PK "Telegram ID (строка)"
        string username "Юзернейм @..."
        string firstName "Имя"
        string lastName "Фамилия"
        string className "Сохранённый класс (10-1...)"
        int subgroup "Подгруппа (1 или 2)"
        string englishGroup "Группа английского"
        boolean isPremium "Наличие Premium"
        int actionsCount "Счетчик действий"
        datetime lastActiveAt "Время последней активности"
    }

    FoodRating {
        int id PK
        string date "ДД.ММ.ГГГГ"
        string mealType "Завтрак / Обед / Ужин"
        string dishName "Блюдо"
        string userId FK "ID пользователя"
        int score "Оценка 1..5"
        datetime updatedAt
    }

    BotReport {
        int id PK
        string userId FK
        string name "Имя заявителя"
        string contact "Контакты заявителя"
        string message "Текст репорта"
        string status "OPEN / RESOLVED"
        datetime createdAt
    }

    BotAdmin {
        string userId PK
        string username
        datetime grantedAt
        boolean isActive
    }
```

---

## Часть 4. Сравнительный анализ показателей (До и После)

| Параметр / Метрика | До оптимизации (Текущее состояние) | После реализации плана | Эффект оптимизации |
|---|---|---|---|
| **Архитектура кодовой базы** | Монолитный `index.ts` (3256 строк) | 18 изолированных модулей (Composers, Services) | Высокая модульность, 100% покрытие юнит-тестами |
| **Сетевой транспорт** | Long Polling (`getUpdates`) | Webhook за Caddy 2 с `secret_token` | Снижение задержки сети, нулевой polling-трафик |
| **Задержка ответа бота (P95)** | **450 – 850 мс** | **25 – 45 мс** | **Ускорение в 15–20 раз** |
| **Дисковый I/O** | Синхронный `writeFileSync` 3 JSON + `statSync` логов | Асинхронный SQLite WAL + стриминг логов | **0 блокировок Event Loop** |
| **Хранилище данных** | 5 разрозненных JSON файлов на диске | Единая база SQLite WAL / Prisma | Консистентность данных, транзакции, ACID |
| **Управление памятью (RAM)** | Монотонный рост `Map` (180–350 МБ) | Bounded LRU Cache с TTL (45–70 МБ) | **Экономия памяти до 75%** |
| **Устойчивость к флуду и рассылкам** | Риск `429 Too Many Requests` и блокировки | Priority Token-Bucket Throttler (30 msg/s) | **100% защита от бана Telegram API** |
| **Отказоустойчивость** | Ручной перезапуск, падение при сбоях сети | Zero-Downtime релоад, автоматический backoff | Непрерывная доступность (High Availability) |
| **Наблюдаемость** | Текстовый `bot.log` с ручным grep | Prometheus метрики + Pino JSON + Sentry | Мгновенное обнаружение сбоев за <10 секунд |

---

## Часть 5. Дорожная карта внедрения (Roadmap)

```mermaid
flowchart LR
    F1["Фаза 1: Quick Wins<br/>(1-2 дня)<br/>• Non-blocking Logs<br/>• Async JSON Writes<br/>• LRU Caches"]
    F2["Фаза 2: Рефакторинг<br/>(3-4 дня)<br/>• Модули / Composers<br/>• Typed Context<br/>• Service Layer"]
    F3["Фаза 3: Webhooks & Caddy<br/>(2-3 дня)<br/>• Caddy SSL / HTTP2<br/>• Secret Token Auth<br/>• Zero-downtime"]
    F4["Фаза 4: Очереди сообщений<br/>(2-3 дня)<br/>• Throttler Plugin<br/>• Priority Outbox<br/>• Backoff Handler"]
    F5["Фаза 5: Миграция на SQLite<br/>(2-3 дня)<br/>• Prisma Schema Exp<br/>• WAL Mode Tuning<br/>• Migration Script"]
    F6["Фаза 6: Наблюдаемость<br/>(1-2 дня)<br/>• Prometheus /metrics<br/>• Pino JSON Streams<br/>• Sentry & Alerts"]

    F1 --> F2 --> F3 --> F4 --> F5 --> F6
```

### Детальное расписание по спринтам:

- **Спринт 1 (Дни 1–2): Стабилизация и устранение блокировок**
  - [x] Глубокий аудит и фиксация узких мест кодовой базы.
  - [ ] Перевод `logger.ts` на буферизованную неблокирующую запись.
  - [ ] Реализация `writeJsonAtomicallyAsync` и увеличение окна дебаунсинга.
  - [ ] Интеграция `lru-cache` для таблицы рейт-лимитов и сессий репортов.
- **Спринт 2 (Дни 3–6): Модульная декомпозиция бота**
  - [ ] Создание структуры папок `mini-services/tg-bot/src/modules/`.
  - [ ] Выделение `ScheduleComposer`, `CanteenComposer`, `AdminComposer`, `FeedbackComposer`.
  - [ ] Внедрение типизированного `BotContext` и middleware разрешения классов.
  - [ ] Покрытие изолированных сервисов юнит-тестами (`bun test`).
- **Спринт 3 (Дни 7–9): Сетевая модернизация и Webhooks**
  - [ ] Настройка эндпоинта вебхука в `server.ts`.
  - [ ] Конфигурация Caddy с обратным проксированием и проверкой SSL.
  - [ ] Регистрация вебхука в Telegram с `secret_token`.
  - [ ] Настройка канареечного переключения (Canary rollout): Long Polling -> Webhook.
- **Спринт 4 (Дни 10–12): Исходящие очереди и защита от лимитов**
  - [ ] Подключение `@grammyjs/transformer-throttler`.
  - [ ] Разработка сервиса приоритетной отправки сообщений.
  - [ ] Тестирование сценариев массовой рассылки при искусственном `429 Retry-After`.
- **Спринт 5 (Дни 13–15): Единое хранилище и ликвидация JSON**
  - [ ] Расширение `prisma/schema.prisma` новыми моделями.
  - [ ] Применение миграций Prisma к `db/custom.db`.
  - [ ] Включение WAL-режима и тюнинг производительности SQLite.
  - [ ] Выполнение миграционного скрипта с проверкой контрольных сумм.
  - [ ] Удаление устаревших JSON-файлов и очистка кода от устаревших утилит.
- **Спринт 6 (Дни 16–17): Мониторинг, алертинг и приемка**
  - [ ] Настройка эндпоинта `/metrics` с метриками `prom-client`.
  - [ ] Подключение структурированного логирования Pino.
  - [ ] Настройка Sentry и оповещений об ошибках в закрытый админский Telegram-чат.
  - [ ] Финальное нагрузочное тестирование и передача сервиса в эксплуатацию.

---

## Заключение

Предложенный план решает все выявленные системные проблемы: ликвидирует угрозу зависания Event Loop из-за синхронного ввода-вывода, предотвращает утечки памяти через LRU-кэши, многократно ускоряет реакцию бота за счет перехода на Webhook за Caddy, гарантирует сохранность данных в SQLite WAL и защищает инфраструктуру от блокировок со стороны Telegram.

Реализация плана превратит Telegram-бот «СУНЦ Инфо» в высоконадежный, масштабируемый и современный микросервис корпоративного уровня.

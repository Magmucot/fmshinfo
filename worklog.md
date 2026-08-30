# Worklog — Проект «СУНЦ Инфо» (агрегатор информации СУНЦ НГУ)

---
Task ID: 1
Agent: main (Z.ai Code)
Task: Комплексный анализ сайтов СУНЦ НГУ и НГУ, поиск источников данных (столовая, дежурства, звонки, ночные вожатые, погода, полезная информация)

Work Log:
- Проведён веб-поиск (10+ запросов) по темам: расписание звонков, меню столовой, дежурства, ночные вожатые, расписание занятий, новости
- Прочитаны и проанализированы страницы: sesc.nsu.ru/sveden/catering (меню PDF), /education/academic-calendar (звонки), /media/news (новости), /faq, table-sesc.nsu.ru (SPA расписания)
- Найдено и протестировано открытое API расписания: https://table-sesc.nsu.ru/api/bell, /api/school-class, /api/schedule/find?group=X (JSON, без авторизации)
- Скачан и распарсен реальный PDF меню menu_30.08.26.pdf (pdftotext работает): структура «Завтрак/Обед/Полдник/Ужин/Второй ужин», КБЖУ, ингредиенты, итоги
- Проверены погодные API: Open-Meteo (координаты 54.842/83.098, лимит на сегодня исчерпан) и wttr.in (работает, JSON)
- УСТАНОВЛЕНО: дежурства и ночные вожатые онлайн НЕ публикуются (стенды/внутренние каналы) → модули с ручным администрированием
- Составлен подробный аналитический документ: /home/z/my-project/docs/sunc-info-analysis.md (спецификация для сайта/ТГ-бота)

Stage Summary:
- Все источники данных зафиксированы: меню (PDF через /sveden/catering), звонки+расписание (table-sesc API), новости (HTML /media/news), погода (Open-Meteo/wttr.in), дежурства и вожатые (ручной ввод, БД)
- Ключевой документ-спецификация готов: docs/sunc-info-analysis.md
- Следующие шаги: Task 2 (FastAPI-эталон, субагент), Task 3+4 (Next.js бэкенд и фронтенд, main), тестирование, cron

---
Task ID: 2
Agent: main (Z.ai Code) + general-purpose (частично)
Task: FastAPI эталонный бэкенд с парсерами и мини-сайтом (fastapi-backend/)

Work Log:
- Субагент создал: parsers/ (menu, schedule, news, weather), models.py, database.py, requirements.txt
- Субагент превысил таймаут → main дописал: main.py (19 роутов, TTL-кэш, CORS, X-Admin-Key), parsers/info_data.py, seed.py, README.md, static/index.html
- Исправлен критический баг: regex ссылок PDF-меню — Битрикс использует одинарные кавычки href='...' → добавлена поддержка обоих типов кавычек
- Сквозные тесты на РЕАЛЬНЫХ данных: меню 30.08.2026 (4 приёма пищи, 25 блюд, 2866 ккал/день), звонки (13), классы (25), расписание 10-1, новости (12 шт. с датами), погода (16°C через wttr.in)
- py_compile OK, импорт FastAPI-приложения OK, seed.py OK (7 дежурств + 12 вожатых)

Stage Summary:
- Эталонная реализация FastAPI ПОЛНОСТЬЮ ГОТОВА и протестирована: /home/z/my-project/fastapi-backend/
- Все парсеры работают с реальными источниками; Swagger: /docs; мини-сайт: static/index.html
- Следующий этап: основное Next.js-приложение (демо в этом окружении)

---
Task ID: 3
Agent: main (Z.ai Code)
Task: Бэкенд Next.js: Prisma-схема, парсеры источников, 11 API-роутов

Work Log:
- Prisma: модели DutyEntry, NightCounselor, Feedback → bun run db:push
- src/lib/server/: cache.ts (TTL-кэш + stale-режим), sources.ts (URL, UA, статич. звонки, справочник), menu.ts (парсер PDF), tableSesc.ts (клиент API расписания), news.ts (парсер новостей), weather.ts (Open-Meteo→wttr.in), seed.ts (демо-дежурства/вожатые на 14 дней)
- API-роуты: /api/menu, /api/bells, /api/classes, /api/schedule, /api/weather, /api/news, /api/duty (GET/POST/DELETE), /api/counselors (GET/POST/DELETE), /api/feedback, /api/info, /api/document
- Парсер меню отлажен на реальных PDF: исправлены 5 багов — (1) одинарные кавычки href в Битриксе, (2) \b не работает с кириллицей в JS regex, (3) «Углеводы-91» классифицировался как noise, (4) normalizeDate обрезала год «2026»→«26», (5) не распознавались секции «Вт.завтрак»/«Вт. ужин» и «Итого за Ккал-4 129» (итог дня)
- Итог парсинга: 30.08 → 2866 ккал ✓, 01.09 → 6 секций 4129 ккал ✓, 08.09 → 4241 ккал ✓ (совпадает с собственными итогами PDF)

Stage Summary:
- Все 11 API-эндпоинтов работают на РЕАЛЬНЫХ данных (проверено curl + браузер)
- Парсер меню — полный конвейер: каталог → PDF (pdftotext) → 6 секций приёмов пищи с КБЖУ и ингредиентами

---
Task ID: 4
Agent: main (Z.ai Code)
Task: Фронтенд: одностраничный портал «СУНЦ Инфо» на /

Work Log:
- Тема: тёплая amber/stone палитра (globals.css, oklch), шрифт Manrope (кириллица), тёмная тема next-themes, кастомные скроллбары, .doc-prose для markdown
- src/components/sunc/: app.tsx (шапка с живыми часами НСК, погодным чипом, 9 вкладок, липкий футер), api.ts (React Query хуки), types.ts, shared.tsx
- Секции: dashboard (погода, «Сейчас в школе» с прогрессом пары, калории, превью меню, дежурства, вожатые, новости), canteen (полное меню с выбором дат из каталога, КБЖУ-бейджи, составы, итоги дня), schedule (звонки по парам + сетка Пн-Сб по 25 классам), duty (7 дней + админ-панель X-Admin-Key), counselors (карточки общежитий + экстренные контакты + админ), weather (текущая + прогноз 3 дня), news, info (контакты/ссылки/форма обратной связи), document (react-markdown + remark-gfm)
- Исправления по итогам QA: remark-gfm 4.x = default export; setState-in-effect заменён на CSS dark:hidden и производное значение; WEEKDAYS[0]=«Воскресенье»; seed вожатых в воскресенья

Stage Summary:
- Верифицировано через agent-browser: все 9 вкладок с реальными данными, форма обратной связи (запись в БД ✓), тёмная тема ✓, мобайл 390px без переполнения ✓, липкий футер ✓, ошибок в консоли нет, lint чистый
- Полный цикл: анализ → документ → FastAPI-эталон → рабочее Next.js-приложение с реальными парсерами

---
Task ID: 5
Agent: main (Z.ai Code)
Task: Финализация: cron-задача, уборка, итоговая верификация

Work Log:
- Создана cron-задача webDevReview (job_id 346534): каждые 15 минут, tz Asia/Krasnoyarsk — QA через agent-browser и автономное развитие проекта
- Удалены временные файлы исследования (app.js, vendors.js, html-дампы); в research/ оставлены только PDF-образцы меню и JSON результатов поиска
- Финальная верификация: главная HTTP 200, /api/menu HTTP 200, в dev.log 0 ошибок (grep ⨯|Error = 0), lint чистый

Stage Summary:
- ПРОЕКТ ЗАВЕРШЁН: аналитический документ (docs/sunc-info-analysis.md) + FastAPI-эталон (fastapi-backend/, протестирован) + рабочий Next.js-портал (port 3000, все парсеры на реальных данных)
- Следующие итерации (для webDevReview): Telegram-бот на aiogram поверх парсеров fastapi-backend; RSS-лента новостей; кэширование меню в БД; поиск по блюдам; PWA-манифест; уведомления об изменении меню

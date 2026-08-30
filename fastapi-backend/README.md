# СУНЦ Инфо — эталонный FastAPI-бэкенд

Агрегатор оперативной информации **СУНЦ НГУ (ФМШ)**: меню столовой, расписание
звонков и занятий, дежурства, ночные вожатые, погода в Академгородке и новости.

Полная спецификация источников данных — в документе
[`../docs/sunc-info-analysis.md`](../docs/sunc-info-analysis.md)
(какие URL парсить, форматы, частота обновления, риски).

## Возможности

| Модуль | Источник | Автообновление |
|---|---|---|
| Меню столовой (6 приёмов пищи, КБЖУ) | `sesc.nsu.ru/sveden/catering` → PDF | ✅ парсер (TTL 1 ч) |
| Расписание звонков | `table-sesc.nsu.ru/api/bell` + статич. список | ✅ (TTL 1 ч) |
| Расписание занятий (класс/преподаватель/аудитория) | `table-sesc.nsu.ru/api/schedule/find` | ✅ (TTL 1 ч) |
| Погода (текущая + 3 дня) | Open-Meteo → резерв wttr.in | ✅ (TTL 10 мин) |
| Новости | `sesc.nsu.ru/media/news` (HTML) | ✅ (TTL 6 ч) |
| Дежурства | **SQLite** (онлайн не публикуются) | ✍️ админ `POST /api/duty` |
| Ночные вожатые | **SQLite** (онлайн не публикуются) | ✍️ админ `POST /api/night-counselors` |
| Обратная связь | SQLite | — |

## Быстрый старт

```bash
# Python 3.11+
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt

python seed.py            # демо-данные дежурств и вожатых (необязательно, но полезно)
uvicorn main:app --host 0.0.0.0 --port 8000
```

- Сайт: **http://localhost:8000** (одностраничный интерфейс)
- Swagger-документация API: **http://localhost:8000/docs**

## Переменные окружения

| Переменная | По умолчанию | Назначение |
|---|---|---|
| `ADMIN_KEY` | `sunc-admin` | Ключ для POST-эндпоинтов дежурств/вожатых (заголовок `X-Admin-Key`) |
| `SUNC_DB_PATH` | `sunc_info.db` рядом с `main.py` | Путь к файлу SQLite |

## Эндпоинты

```
GET  /api/menu?date=30.08.2026     меню столовой (без date — сегодня; при отсутствии
                                   даты возвращается ближайшая с substituted: true)
GET  /api/bells                    расписание звонков (пары + время)
GET  /api/classes                  список классов (8-1 … 11-7)
GET  /api/schedule?group=10-1      расписание (или ?teacher=… / ?classroom=…)
GET  /api/weather                  погода сейчас + прогноз 3 дня
GET  /api/news?limit=10            последние новости школы
GET  /api/duty?date=…              дежурства (все / на дату)
POST /api/duty                     добавить/обновить дежурство  [X-Admin-Key]
GET  /api/night-counselors?date=…  ночные вожатые по общежитиям
POST /api/night-counselors         добавить/обновить вожатого   [X-Admin-Key]
POST /api/feedback                 обратная связь {name, contact, message}
GET  /api/info                     контакты, ссылки, режимы работы
GET  /api/health                   статус внешних источников
```

Пример администрирования:

```bash
curl -X POST http://localhost:8000/api/duty \
  -H "Content-Type: application/json" -H "X-Admin-Key: sunc-admin" \
  -d '{"date": "01.09.2026", "dutyType": "столовая", "className": "10-2",
       "responsible": "Ковалёв А. И.", "timeInterval": "после 3-й пары"}'

curl -X POST http://localhost:8000/api/night-counselors \
  -H "Content-Type: application/json" -H "X-Admin-Key: sunc-admin" \
  -d '{"date": "01.09.2026", "dormitory": "Общежитие №1",
       "counselorName": "Смирнова О. В.", "floor": "2–3 этажи"}'
```

## Обновление источников (cron)

Кэш в памяти обновляется «лениво» при запросах; чтобы данные были горячими
к 7:30 утра (перед завтраком), добавьте в crontab сервера:

```cron
# меню и расписание — каждый час
0 * * * * curl -fsS http://localhost:8000/api/menu > /dev/null
10 * * * * curl -fsS http://localhost:8000/api/bells > /dev/null
# новости — каждые 6 часов
0 */6 * * * curl -fsS http://localhost:8000/api/news > /dev/null
```

## Интеграция с Telegram-ботом

Парсеры (`parsers/*.py`) не зависят от FastAPI — их можно переиспользовать
в боте на **aiogram 3**:

```python
from parsers.menu_parser import get_menu
import httpx, asyncio

async def main():
    async with httpx.AsyncClient() as client:
        menu = await get_menu(client)  # → текст для сообщения боту
```

Рекомендуемые команды бота: `/menu`, `/bells`, `/schedule 10-1`,
`/weather`, `/news`, `/duty`, `/night` + ежедневная авторассылка меню
в 7:30 (Asia/Novosibirsk) и дежурств в 20:00.

## Структура

```
fastapi-backend/
├── main.py              # эндпоинты, кэш TTL, CORS, статика
├── parsers/
│   ├── menu_parser.py   # каталог → PDF → текст (pdfplumber/pdftotext) → JSON
│   ├── schedule_parser.py
│   ├── news_parser.py
│   ├── weather.py       # Open-Meteo + wttr.in
│   └── info_data.py     # статический справочник контактов
├── database.py          # SQLite (SQLAlchemy 2.0)
├── models.py            # Pydantic v2
├── static/index.html    # одностраничный сайт
├── seed.py              # демо-данные дежурств/вожатых
└── requirements.txt
```

## Важные замечания

1. **URL PDF-меню меняются ежедневно** (хэши Битрикса) — парсер всегда сначала
   читает каталог `/sveden/catering`. Не кэшируйте прямые ссылки на PDF.
2. **Дежурства и ночные вожатые** в открытом доступе не публикуются —
   данные вводит администратор (секретный ключ `X-Admin-Key`).
3. При недоступности источника API отдаёт последний успешный результат
   с полем `"stale": true`.
4. Ко всем запросам к sesc.nsu.ru подставляется браузерный User-Agent.
5. На проде смените `ADMIN_KEY` и ограничьте CORS конкретным доменом.

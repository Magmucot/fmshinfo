"""«СУНЦ Инфо» — эталонный FastAPI-бэкенд агрегатора информации СУНЦ НГУ.

Запуск::

    pip install -r requirements.txt
    python seed.py            # демо-данные дежурств и ночных вожатых (однократно)
    uvicorn main:app --host 0.0.0.0 --port 8000

Документация API: http://localhost:8000/docs (Swagger UI, автогенерируется).

Все данные и источники описаны в аналитическом документе
``docs/sunc-info-analysis.md`` (корень основного проекта).
"""

from __future__ import annotations

import asyncio
import os
import time
from contextlib import asynccontextmanager
from typing import Any

import httpx
from fastapi import Depends, FastAPI, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

import database
import parsers.menu_parser as menu_parser
import parsers.news_parser as news_parser
import parsers.schedule_parser as schedule_parser
import parsers.weather as weather
from models import (
    BellsResponse,
    ClassesResponse,
    DutyCreate,
    DutyResponse,
    DutyWriteResponse,
    FeedbackCreate,
    FeedbackResponse,
    HealthResponse,
    HealthSource,
    InfoResponse,
    MenuResponse,
    NightCounselorCreate,
    NightCounselorsResponse,
    NightCounselorWriteResponse,
    NewsResponse,
    ScheduleResponse,
    WeatherResponse,
)

# ---------------------------------------------------------------------------
# Конфигурация
# ---------------------------------------------------------------------------

#: Секретный ключ администратора (дежурства/вожатые) — заголовок X-Admin-Key
ADMIN_KEY: str = os.environ.get("ADMIN_KEY", "sunc-admin")

#: User-Agent для запросов к сайтам НГУ (требование раздела 6 документа)
USER_AGENT: str = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0 Safari/537.36"
)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))


# ---------------------------------------------------------------------------
# Простой TTL-кэш в памяти (раздел 6 документа)
# ---------------------------------------------------------------------------

class TTLCache:
    """Кэш со временем жизни значения; хранит последний успешный результат."""

    def __init__(self) -> None:
        self._data: dict[str, tuple[float, Any]] = {}
        self._stale: dict[str, Any] = {}

    def get(self, key: str) -> Any | None:
        """Взять свежее значение (None, если просрочено/отсутствует)."""
        item = self._data.get(key)
        if item and item[0] > time.monotonic():
            return item[1]
        return None

    def peek_stale(self, key: str) -> Any | None:
        """Последний успешный результат (даже просроченный) — для режима stale."""
        fresh = self.get(key)
        if fresh is not None:
            return fresh
        return self._stale.get(key)

    def put(self, key: str, value: Any, ttl_seconds: float) -> None:
        self._data[key] = (time.monotonic() + ttl_seconds, value)
        self._stale[key] = value


CACHE = TTLCache()

#: TTL по типам данных (раздел 5 документа: интервалы автообновления)
TTL_MENU = 3600.0          # меню — 1 час
TTL_SCHEDULE = 3600.0      # расписание/звонки — 1 час
TTL_WEATHER = 600.0        # погода — 10 минут
TTL_NEWS = 21600.0         # новости — 6 часов


# ---------------------------------------------------------------------------
# Жизненный цикл приложения и HTTP-клиент
# ---------------------------------------------------------------------------

_client: httpx.AsyncClient | None = None


@asynccontextmanager
async def lifespan(_: FastAPI):
    """Создаём единый httpx-клиент и инициализируем БД при старте."""
    global _client
    database.init_db()
    _client = httpx.AsyncClient(
        headers={"User-Agent": USER_AGENT, "Accept-Language": "ru-RU,ru;q=0.9"},
        follow_redirects=True,
        timeout=httpx.Timeout(20.0, connect=15.0),
    )
    yield
    await _client.aclose()
    _client = None


def client() -> httpx.AsyncClient:
    """Текущий HTTP-клиент приложения."""
    if _client is None:  # pragma: no cover — защита от использования вне lifespan
        raise RuntimeError("HTTP-клиент не инициализирован")
    return _client


app = FastAPI(
    title="СУНЦ Инфо API",
    description=(
        "Агрегатор оперативной информации СУНЦ НГУ (ФМШ): меню столовой, "
        "расписание звонков и занятий, дежурства, ночные вожатые, погода "
        "в Академгородке и новости школы."
    ),
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # для демо; в проде ограничьте доменом сайта
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

app.mount("/static", StaticFiles(directory=os.path.join(BASE_DIR, "static")), name="static")


# ---------------------------------------------------------------------------
# Вспомогательное: кэшированный вызов источника с выдачей stale-результата
# ---------------------------------------------------------------------------

async def _cached(key: str, ttl: float, fetch, **response_model_kwargs) -> dict[str, Any]:
    """Обёртка: кэш → источник → stale-кэш при ошибке.

    ``fetch`` — асинхронная функция, возвращающая словарь с полем ``ok``
    (или без него — тогда оно добавляется). При недоступности источника
    возвращается последний успешный результат с ``stale: True``.
    """
    fresh = CACHE.get(key)
    if fresh is not None:
        return fresh
    try:
        result = await fetch()
        if result is None:
            raise RuntimeError("источник вернул пустой результат")
        result.setdefault("ok", True)
        result["stale"] = False
        CACHE.put(key, result, ttl)
        return result
    except Exception as exc:  # noqa: BLE001
        stale = CACHE.peek_stale(key)
        if stale is not None:
            stale = dict(stale)
            stale["stale"] = True
            stale.setdefault("ok", True)
            return stale
        raise HTTPException(status_code=502, detail=f"Источник недоступен: {exc}") from exc


def _require_admin(x_admin_key: str | None) -> None:
    """Проверка секретного ключа администратора."""
    if x_admin_key != ADMIN_KEY:
        raise HTTPException(status_code=401, detail="Неверный X-Admin-Key")


# ---------------------------------------------------------------------------
# Мини-сайт (одностраничный клиент)
# ---------------------------------------------------------------------------

@app.get("/", include_in_schema=False)
async def index() -> FileResponse:
    """Одностраничный сайт «СУНЦ Инфо» (static/index.html)."""
    return FileResponse(os.path.join(BASE_DIR, "static", "index.html"))


# ---------------------------------------------------------------------------
# Эндпоинты: меню столовой
# ---------------------------------------------------------------------------

@app.get("/api/menu", response_model=MenuResponse, tags=["Столовая"])
async def api_menu(date: str | None = Query(default=None, description="ДД.ММ.ГГГГ; пусто — сегодня")) -> Any:
    """Меню столовой на дату (парсинг PDF с sesc.nsu.ru, раздел 3.1 документа)."""
    cache_key = f"menu:{(date or '').strip()}"
    try:
        return await _cached(cache_key, TTL_MENU, lambda: menu_parser.get_menu(client(), date))
    except HTTPException:
        raise
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


# ---------------------------------------------------------------------------
# Эндпоинты: звонки и расписание
# ---------------------------------------------------------------------------

@app.get("/api/bells", response_model=BellsResponse, tags=["Расписание"])
async def api_bells() -> Any:
    """Расписание звонков (API table-sesc + статический список, раздел 3.2)."""
    return await _cached("bells", TTL_SCHEDULE, lambda: schedule_parser.get_bells(client()))


@app.get("/api/classes", response_model=ClassesResponse, tags=["Расписание"])
async def api_classes() -> Any:
    """Список классов (8-1 … 11-7)."""
    return await _cached("classes", TTL_SCHEDULE, lambda: schedule_parser.get_classes(client()))


@app.get("/api/schedule", response_model=ScheduleResponse, tags=["Расписание"])
async def api_schedule(
    group: str | None = Query(default=None, examples=["10-1"]),
    teacher: str | None = Query(default=None, examples=["Горшков Д.В."]),
    classroom: str | None = Query(default=None, examples=["5_6"]),
) -> Any:
    """Расписание занятий по классу / преподавателю / аудитории (раздел 3.3)."""
    if not (group or teacher or classroom):
        raise HTTPException(status_code=400, detail="Укажите group, teacher или classroom")
    cache_key = f"schedule:{group}:{teacher}:{classroom}"

    async def fetch() -> dict[str, Any]:
        result = await schedule_parser.get_schedule(client(), group=group, teacher=teacher, classroom=classroom)
        result["group"] = group
        result["teacher"] = teacher
        result["classroom"] = classroom
        return result

    return await _cached(cache_key, TTL_SCHEDULE, fetch)


# ---------------------------------------------------------------------------
# Эндпоинты: погода
# ---------------------------------------------------------------------------

@app.get("/api/weather", response_model=WeatherResponse, tags=["Погода"])
async def api_weather() -> Any:
    """Погода в Академгородке: Open-Meteo, резерв — wttr.in (раздел 3.6)."""
    return await _cached("weather", TTL_WEATHER, lambda: weather.get_weather(client()))


# ---------------------------------------------------------------------------
# Эндпоинты: новости
# ---------------------------------------------------------------------------

@app.get("/api/news", response_model=NewsResponse, tags=["Новости"])
async def api_news(limit: int = Query(default=10, ge=1, le=50)) -> Any:
    """Последние новости sesc.nsu.ru (раздел 3.7)."""
    cache_key = f"news:{limit}"

    async def fetch() -> dict[str, Any]:
        result = await news_parser.get_news(client(), limit=50)
        result["items"] = result.get("items", [])[:limit]
        return result

    return await _cached(cache_key, TTL_NEWS, fetch)


# ---------------------------------------------------------------------------
# Эндпоинты: дежурства (ручное администрирование)
# ---------------------------------------------------------------------------

@app.get("/api/duty", response_model=DutyResponse, tags=["Дежурства"])
async def api_duty_get(date: str | None = Query(default=None, description="ДД.ММ.ГГГГ")) -> Any:
    """График дежурств (онлайн не публикуется — данные вводит администратор)."""
    items = await asyncio.to_thread(database.list_duty, date)
    return {"ok": True, "items": items, "count": len(items)}


@app.post("/api/duty", response_model=DutyWriteResponse, tags=["Дежурства"])
async def api_duty_post(
    payload: DutyCreate,
    x_admin_key: str | None = Header(default=None, alias="X-Admin-Key"),
) -> Any:
    """Добавить/обновить дежурство (требуется X-Admin-Key)."""
    _require_admin(x_admin_key)
    entry = await asyncio.to_thread(database.upsert_duty, payload.model_dump())
    return {"ok": True, "entry": entry}


# ---------------------------------------------------------------------------
# Эндпоинты: ночные вожатые (ручное администрирование)
# ---------------------------------------------------------------------------

@app.get("/api/night-counselors", response_model=NightCounselorsResponse, tags=["Ночные вожатые"])
async def api_night_get(date: str | None = Query(default=None, description="ДД.ММ.ГГГГ")) -> Any:
    """График ночных вожатых по общежитиям (вводится администратором)."""
    items = await asyncio.to_thread(database.list_night_counselors, date)
    return {"ok": True, "items": items, "count": len(items)}


@app.post("/api/night-counselors", response_model=NightCounselorWriteResponse, tags=["Ночные вожатые"])
async def api_night_post(
    payload: NightCounselorCreate,
    x_admin_key: str | None = Header(default=None, alias="X-Admin-Key"),
) -> Any:
    """Добавить/обновить ночного вожатого на дату (требуется X-Admin-Key)."""
    _require_admin(x_admin_key)
    entry = await asyncio.to_thread(database.upsert_night_counselor, payload.model_dump())
    return {"ok": True, "entry": entry}


# ---------------------------------------------------------------------------
# Эндпоинты: обратная связь и справочник
# ---------------------------------------------------------------------------

@app.post("/api/feedback", response_model=FeedbackResponse, tags=["Прочее"])
async def api_feedback(payload: FeedbackCreate) -> Any:
    """Принять сообщение обратной связи (сохраняется в SQLite)."""
    feedback_id = await asyncio.to_thread(
        database.add_feedback, payload.name.strip(), payload.contact.strip(), payload.message.strip()
    )
    return {"ok": True, "id": feedback_id}


@app.get("/api/info", response_model=InfoResponse, tags=["Прочее"])
async def api_info() -> Any:
    """Полезные контакты, ссылки и режимы работы (разделы 2 и 3.8 документа)."""
    from parsers.info_data import SCHOOL_INFO  # локальный импорт: справочник статичен

    return {"ok": True, **SCHOOL_INFO}


@app.get("/api/health", response_model=HealthResponse, tags=["Прочее"])
async def api_health() -> Any:
    """Статус внешних источников (для мониторинга)."""
    checks: list[HealthSource] = []
    sources = [
        ("Меню столовой (sesc.nsu.ru)", menu_parser.CATALOG_URL),
        ("Расписание (table-sesc.nsu.ru)", schedule_parser.BASE_URL + "/api/bell"),
        ("Новости (sesc.nsu.ru)", news_parser.NEWS_URL),
        ("Погода (Open-Meteo)", "https://api.open-meteo.com"),
    ]
    for name, url in sources:
        started = time.monotonic()
        status = "ок"
        error: str | None = None
        try:
            response = await client().head(url, timeout=8.0)
            if response.status_code >= 500:
                status, error = "ошибка", f"HTTP {response.status_code}"
            else:
                status = f"HTTP {response.status_code}"
        except Exception as exc:  # noqa: BLE001
            status, error = "недоступен", str(exc)[:200]
        checks.append(
            HealthSource(
                name=name,
                ok=error is None,
                status=status,
                latency_ms=int((time.monotonic() - started) * 1000),
                error=error,
            )
        )
    import datetime as _dt

    return {
        "ok": all(source.ok for source in checks),
        "sources": checks,
        "checked_at": _dt.datetime.now(tz=_dt.timezone(_dt.timedelta(hours=7))).isoformat(),
        "uptime_seconds": 0,
    }


# ---------------------------------------------------------------------------
# Точка входа
# ---------------------------------------------------------------------------

if __name__ == "__main__":  # pragma: no cover — удобный запуск `python main.py`
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=int(os.environ.get("PORT", "8000")), reload=False)

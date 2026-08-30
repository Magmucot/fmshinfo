"""Пакет парсеров внешних источников «СУНЦ Инфо».

Здесь собраны общие утилиты, используемые всеми парсерами:

* ``BROWSER_UA`` — User-Agent браузера (обязателен для запросов к sesc.nsu.ru,
  который отклоняет «простых» ботов);
* :class:`SourceError` — ошибка внешнего источника (по ней основной модуль
  понимает, что нужно отдать данные из кэша с пометкой ``stale``);
* :func:`http_get_text` / :func:`http_get_bytes` / :func:`http_get_json` —
  асинхронные GET-запросы через ``httpx.AsyncClient`` с таймаутом
  и повторными попытками;
* :class:`TTLCache` — простой кэш в памяти (dict + метки времени).

Спецификация всех источников: ``docs/sunc-info-analysis.md``.
"""

from __future__ import annotations

import asyncio
import time
from typing import Any

import httpx

# User-Agent браузера — обязателен для sesc.nsu.ru (см. анализ, раздел 6, п. 4)
BROWSER_UA: str = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0 Safari/537.36"
)

# Таймауты и число повторных попыток по умолчанию (анализ, раздел 6, п. 1)
DEFAULT_TIMEOUT: float = 15.0
DEFAULT_RETRIES: int = 2

__all__ = [
    "BROWSER_UA",
    "DEFAULT_TIMEOUT",
    "DEFAULT_RETRIES",
    "SourceError",
    "TTLCache",
    "http_get_text",
    "http_get_bytes",
    "http_get_json",
]


class SourceError(RuntimeError):
    """Внешний источник недоступен или вернул некорректные данные."""


class TTLCache:
    """Простой кэш в памяти: ``dict`` + метки времени записи.

    Используется основным приложением для кэширования ответов парсеров
    (меню/расписание — 3600 c, погода — 600 c, новости — 21600 c).
    При ошибке источника кэш можно прочитать без проверки срока годности
    (:meth:`get_stale`) и отдать клиенту с пометкой ``stale: true``.
    """

    def __init__(self) -> None:
        self._store: dict[str, tuple[float, Any]] = {}

    def set(self, key: str, value: Any, ttl: float) -> None:
        """Сохранить значение ``value`` под ключом ``key`` на ``ttl`` секунд."""
        self._store[key] = (time.monotonic() + ttl, value)

    def get(self, key: str) -> Any | None:
        """Вернуть свежее значение либо ``None``, если ключа нет / срок истёк."""
        item = self._store.get(key)
        if item is None:
            return None
        expires_at, value = item
        if time.monotonic() > expires_at:
            return None
        return value

    def get_stale(self, key: str) -> Any | None:
        """Вернуть значение без проверки срока годности (просроченный кэш)."""
        item = self._store.get(key)
        return None if item is None else item[1]

    def clear(self) -> None:
        """Полностью очистить кэш."""
        self._store.clear()

    def __len__(self) -> int:
        return len(self._store)


async def _fetch(
    client: httpx.AsyncClient,
    url: str,
    *,
    kind: str,
    params: dict[str, Any] | None = None,
    headers: dict[str, str] | None = None,
    timeout: float = DEFAULT_TIMEOUT,
    retries: int = DEFAULT_RETRIES,
) -> Any:
    """GET-запрос с повторными попытками.

    :param client: асинхронный HTTP-клиент приложения;
    :param url: адрес запроса;
    :param kind: ``"text"`` | ``"bytes"`` | ``"json"`` — формат ответа;
    :param params: query-параметры;
    :param headers: дополнительные заголовки (User-Agent задаётся всегда);
    :param timeout: таймаут одного запроса в секундах;
    :param retries: число повторных попыток после неудачной;
    :raises SourceError: если все попытки исчерпаны.
    """
    if client is None:
        raise SourceError("HTTP-клиент не инициализирован")
    last_error: Exception | None = None
    for attempt in range(retries + 1):
        try:
            request_headers = {"User-Agent": BROWSER_UA}
            if headers:
                request_headers.update(headers)
            response = await client.get(url, params=params, headers=request_headers, timeout=timeout)
            response.raise_for_status()
            if kind == "text":
                return response.text
            if kind == "bytes":
                return response.content
            return response.json()
        except Exception as exc:  # noqa: BLE001 — ретраим любые сбои сети/парсинга
            last_error = exc
            if attempt < retries:
                await asyncio.sleep(0.6 * (attempt + 1))
    raise SourceError(f"Не удалось загрузить {url}: {last_error}") from last_error


async def http_get_text(
    client: httpx.AsyncClient,
    url: str,
    *,
    params: dict[str, Any] | None = None,
    headers: dict[str, str] | None = None,
    timeout: float = DEFAULT_TIMEOUT,
    retries: int = DEFAULT_RETRIES,
) -> str:
    """Получить страницу как текст (Unicode)."""
    result = await _fetch(client, url, kind="text", params=params, headers=headers, timeout=timeout, retries=retries)
    return str(result)


async def http_get_bytes(
    client: httpx.AsyncClient,
    url: str,
    *,
    headers: dict[str, str] | None = None,
    timeout: float = DEFAULT_TIMEOUT,
    retries: int = DEFAULT_RETRIES,
) -> bytes:
    """Скачать файл (например, PDF-меню) как байты."""
    result = await _fetch(client, url, kind="bytes", headers=headers, timeout=timeout, retries=retries)
    return bytes(result)


async def http_get_json(
    client: httpx.AsyncClient,
    url: str,
    *,
    params: dict[str, Any] | None = None,
    headers: dict[str, str] | None = None,
    timeout: float = DEFAULT_TIMEOUT,
    retries: int = DEFAULT_RETRIES,
) -> Any:
    """Получить JSON (например, API table-sesc.nsu.ru или Open-Meteo)."""
    return await _fetch(client, url, kind="json", params=params, headers=headers, timeout=timeout, retries=retries)

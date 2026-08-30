"""Парсер новостей СУНЦ НГУ со страницы https://sesc.nsu.ru/media/news/.

Структура HTML (CMS 1С-Битрикс, см. ``docs/sunc-info-analysis.md``, 3.7)::

    <div class="news-card" id="bx_…_<ID>">
        <div class="date">28.08.2026</div>
        <a href="/media/news/<рубрика>/<id>/" class="name">Заголовок</a>
        …
    </div>

Основной разбор — блочное регулярное выражение (дата + ссылка + заголовок).
Резервный — поиск всех ссылок ``/media/news/<рубрика>/<id>/`` и сопоставление
с ближайшей предшествующей датой ``ДД.ММ.ГГГГ``. Ссылки дедуплицируются по id.
"""

from __future__ import annotations

import re
from html import unescape as html_unescape
from typing import Any

from . import SourceError, http_get_text

#: Каталог новостей (первая страница, ~12–25 публикаций)
NEWS_URL = "https://sesc.nsu.ru/media/news/"
BASE_URL = "https://sesc.nsu.ru"

#: Основной шаблон: блок «дата + ссылка-заголовок» новости
BLOCK_RE = re.compile(
    r'<div class="date">\s*(\d{2}\.\d{2}\.\d{4})\s*</div>\s*'
    r'<a href="(/media/news/([^/"]+)/(\d+)/)"[^>]*class="name"[^>]*>(.*?)</a>',
    re.IGNORECASE | re.DOTALL,
)
#: Резервный шаблон: любая ссылка на новость
LINK_RE = re.compile(r'href="(/media/news/([^/"]+)/(\d+)/)"')
#: Даты в формате ДД.ММ.ГГГГ
DATE_RE = re.compile(r"\b(\d{2}\.\d{2}\.\d{4})\b")
TAG_RE = re.compile(r"<[^>]+>")

#: Человекочитаемые названия рубрик (передаётсяslug, если рубрика неизвестна)
RUBRICS: dict[str, str] = {
    "obrazovanie": "Образование",
    "atmosfera": "Атмосфера",
    "nauka": "Наука",
    "sport": "Спорт",
    "postuplenie": "Поступление",
    "prepodavateli": "Преподаватели",
    "pobedy": "Победы",
    "meropriyatiya": "Мероприятия",
}


def _strip_tags(fragment: str) -> str:
    """Убрать HTML-теги и раскодировать мнемоники (&nbsp; и т.п.)."""
    return html_unescape(TAG_RE.sub("", fragment)).strip()


def _date_sort_key(date_str: str | None) -> str:
    """Ключ сортировки дат ``ДД.ММ.ГГГГ`` → ``ГГГГММДД``."""
    if not date_str:
        return "00000000"
    day, month, year = date_str.split(".")
    return f"{year}{month}{day}"


def _fallback_parse(html: str) -> list[dict[str, Any]]:
    """Резервный разбор: ссылки + ближайшая предшествующая дата в тексте."""
    events: list[tuple[int, str, Any]] = []
    for match in DATE_RE.finditer(html):
        events.append((match.start(), "date", match.group(1)))
    for match in LINK_RE.finditer(html):
        events.append((match.start(), "link", match))
    events.sort(key=lambda event: event[0])

    items: list[dict[str, Any]] = []
    seen: set[str] = set()
    last_date: str | None = None
    for _pos, kind, value in events:
        if kind == "date":
            last_date = value  # type: ignore[assignment]
            continue
        match: re.Match[str] = value  # type: ignore[assignment]
        href, rubric, news_id = match.group(1), match.group(2), match.group(3)
        if news_id in seen:
            continue
        seen.add(news_id)
        # Заголовок — текст внутри тега <a> (ссылка с class="name")
        title = ""
        rest = html[match.end():]
        close_index = rest.find(">")
        if close_index != -1:
            inner = rest[close_index + 1:]
            end_index = inner.find("</a>")
            if end_index != -1:
                title = _strip_tags(inner[:end_index])
        items.append(
            {
                "id": news_id,
                "title": title or f"Новость №{news_id}",
                "url": BASE_URL + href,
                "date": last_date,
                "rubric": RUBRICS.get(rubric, rubric),
            }
        )
    return items


async def get_news(client: Any, limit: int = 50) -> dict[str, Any]:
    """Получить последние новости (полный список первой страницы каталога).

    :param client: ``httpx.AsyncClient`` приложения;
    :param limit: сколько максимум новостей вернуть;
    :return: ``{"items": [...], "count": N}`` — новости, отсортированные
        по дате (свежие сверху), каждая: ``id, title, url, date, rubric``;
    :raises SourceError: если страница недоступна или разбор ничего не дал.
    """
    html = await http_get_text(client, NEWS_URL)

    items: list[dict[str, Any]] = []
    seen: set[str] = set()
    for match in BLOCK_RE.finditer(html):
        date_str, href, rubric, news_id, title_html = match.groups()
        title = _strip_tags(title_html)
        if not title or news_id in seen:
            continue
        seen.add(news_id)
        items.append(
            {
                "id": news_id,
                "title": title,
                "url": BASE_URL + href,
                "date": date_str,
                "rubric": RUBRICS.get(rubric, rubric),
            }
        )

    if not items:
        # Вёрстка изменилась — пробуем резервный разбор
        items = _fallback_parse(html)

    if not items:
        raise SourceError("Не удалось разобрать список новостей: возможно, изменилась вёрстка sesc.nsu.ru")

    items.sort(key=lambda item: _date_sort_key(item.get("date")), reverse=True)
    return {"items": items[:limit], "count": len(items[:limit])}

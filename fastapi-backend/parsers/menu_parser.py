"""Парсер ежедневного меню столовой СУНЦ НГУ.

Алгоритм (см. ``docs/sunc-info-analysis.md``, раздел 3.1):

1. ``GET https://sesc.nsu.ru/sveden/catering`` с User-Agent браузера.
2. Регулярное выражение ``href="([^"]*menu_ДД.ММ.ГГ.pdf)"`` — сбор ссылок на PDF
   (хэш в пути меняется при каждой загрузке файла в CMS «1С-Битрикс»,
   поэтому ссылку нельзя захардкодить).
3. Выбор PDF нужной даты; если даты нет — ближайшая доступная с пометкой.
4. Скачивание PDF и извлечение текста: основной способ — ``pdfplumber``,
   резервный — утилита ``pdftotext`` (poppler-utils) через ``subprocess``.
5. Разбор секций «Завтрак / Обед / Полдник / Ужин / Второй ужин», блюд
   (выход, название, КБЖУ, ингредиенты) и итогов.

Извлечённый из PDF текст кэшируется на диске (``cache/menu_ДД-ММ-ГГГГ.txt``),
т.к. меню на конкретную дату практически не меняется после публикации.
"""

from __future__ import annotations

import datetime as dt
import io
import re
import subprocess
import tempfile
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

from . import BROWSER_UA, SourceError, http_get_bytes, http_get_text

#: Страница-каталог PDF-меню («Организация питания»)
CATALOG_URL = "https://sesc.nsu.ru/sveden/catering"
BASE_URL = "https://sesc.nsu.ru"
#: Часовой пояс школы (Академгородок, Новосибирск)
NSK_TZ = ZoneInfo("Asia/Novosibirsk")

#: Каталог со ссылками кэшируется на 1 час (меню публикуется заранее на ~2 недели)
CATALOG_TTL = 3600.0
#: Папка дискового кэша извлечённого текста PDF
CACHE_DIR = Path(__file__).resolve().parent.parent / "cache"

# Ссылки вида href="/upload/iblock/<hash>/menu_30.08.26.pdf" (или абсолютные)
#: Ссылки на PDF-меню в каталоге могут быть в одинарных И двойных кавычках
#: (Битрикс генерирует href='…' в блоке file-div и href="…" в других местах).
HREF_RE = re.compile(
    r"href=[\"']([^\"']*menu_(\d{2})\.(\d{2})\.(\d{2})\.pdf)[\"']",
    re.IGNORECASE,
)

#: Канонический порядок приёмов пищи
SECTION_ORDER: tuple[str, ...] = ("Завтрак", "Обед", "Полдник", "Ужин", "Второй ужин")
SECTION_ALIASES: dict[str, str] = {name.lower(): name for name in SECTION_ORDER}

#: Фрагменты «шапки» PDF, которые не являются блюдами
NOISE_MARKERS: tuple[str, ...] = (
    "меню школы",
    "сунц",
    "выход (г)",
    "наименование блюда",
    "эн. цен",
    "белки (г)",
    "жиры (г)",
    "углеводы (г)",
    "витамины",
    "микроэлементы",
)
DATE_LINE_RE = re.compile(r"^\d{2}\.\d{2}\.\d{4}$")

#: Строка КБЖУ: начинается с компонента и тире, например «Ккал-560, ...»
NUTRITION_START_RE = re.compile(r"^(Ккал|Белки|Жиры|Углеводы)\s*[-–—]\s*\d")
#: Строка блюда с весом: «200 Каша молочная рисовая ...»
DISH_LINE_RE = re.compile(r"^(\d{1,4})\s+(.+)$")
#: КБЖУ в правой колонке той же строки: «Варенье порционное Ккал-30, Углеводы-8»
TRAILING_NUTRITION_RE = re.compile(r"\s+((?:Ккал|Белки|Жиры|Углеводы)\s*[-–—]\s*\d.*)$")
#: Строка итогов: «Итого за Завтрак Ккал-560, ...» (метка — название приёма пищи)
ITOGO_RE = re.compile(
    r"^Итого(?:\s+за)?\s*([А-Яа-яЁё][А-Яа-яЁё\s]*?)\s*(?=(?:Ккал|Белки|Жиры|Углеводы)\s*[-–—]|$)",
    re.IGNORECASE,
)
#: Блюда без графы «выход», распознаваемые по ключевым словам (напитки и пр.)
STANDALONE_DISH_RE = re.compile(
    r"^(Чай|Кофе|Какао|Компот|Кисель|Напиток|Сок|Вода|Отвар|Зелень|Салат|Фрукты|"
    r"Яблоки|Яблоко|Банан|Бананы|Виноград|Апельсин|Апельсины|Мандарин|Мандарин|Груша|"
    r"Печенье|Пряник|Ватрушка|Булочка|Пирожок|Круассан|Снек|Йогурт|Кефир|Молоко|"
    r"Ряженка|Сухари|Сушки|Сушка)\b",
    re.IGNORECASE,
)

# Кэш каталога ссылок (модульный, чтобы не запрашивать страницу на каждый вызов)
_catalog_cache: dict[str, Any] = {"expires": 0.0, "data": {}}


# ---------------------------------------------------------------------------
# Работа с датами
# ---------------------------------------------------------------------------

def today_nsk() -> str:
    """Текущая дата в Новосибирске в формате ``ДД.ММ.ГГГГ``."""
    return dt.datetime.now(NSK_TZ).strftime("%d.%m.%Y")


def normalize_date(value: str) -> str:
    """Привести дату ``ДД.ММ.ГГ`` или ``ДД.ММ.ГГГГ`` к ``ДД.ММ.ГГГГ``.

    :raises ValueError: если формат некорректен или даты не существует.
    """
    value = value.strip()
    match = re.fullmatch(r"(\d{2})\.(\d{2})\.(\d{2}|\d{4})", value)
    if not match:
        raise ValueError(f"Неверный формат даты {value!r}: ожидается ДД.ММ.ГГ или ДД.ММ.ГГГГ")
    day, month, year = match.groups()
    if len(year) == 2:
        year = "20" + year  # меню публикуются начиная с 2000-х
    try:
        dt.date(int(year), int(month), int(day))
    except ValueError as exc:
        raise ValueError(f"Некорректная дата: {value}") from exc
    return f"{day}.{month}.{year}"


def _parse_date(value: str) -> dt.date:
    """``ДД.ММ.ГГГГ`` → :class:`datetime.date`."""
    return dt.datetime.strptime(value, "%d.%m.%Y").date()


def _nearest_date(dates: list[str], target: dt.date) -> str:
    """Ближайшая дата из ``dates`` к ``target`` (при равенстве — будущая)."""
    best_key: tuple[int, int] | None = None
    best: str | None = None
    for candidate in dates:
        parsed = _parse_date(candidate)
        key = (abs((parsed - target).days), 0 if parsed >= target else 1)
        if best_key is None or key < best_key:
            best_key, best = key, candidate
    assert best is not None
    return best


# ---------------------------------------------------------------------------
# Каталог ссылок на PDF
# ---------------------------------------------------------------------------

async def fetch_catalog(client: Any) -> dict[str, str]:
    """Вернуть словарь ``{"ДД.ММ.ГГГГ": url_pdf}`` со страницы питания.

    Результат кэшируется на ``CATALOG_TTL`` секунд.
    """
    now = time.monotonic()
    if now < _catalog_cache["expires"]:
        return dict(_catalog_cache["data"])
    html = await http_get_text(client, CATALOG_URL)
    catalog: dict[str, str] = {}
    for match in HREF_RE.finditer(html):
        url, day, month, year = match.group(1), match.group(2), match.group(3), match.group(4)
        if not url.startswith("http"):
            url = BASE_URL + url
        catalog[f"{day}.{month}.20{year}"] = url
    if catalog:
        _catalog_cache["expires"] = now + CATALOG_TTL
        _catalog_cache["data"] = dict(catalog)
    return catalog


# ---------------------------------------------------------------------------
# Извлечение текста из PDF
# ---------------------------------------------------------------------------

def _extract_pdf_text(pdf_bytes: bytes) -> str:
    """Извлечь текст из PDF: pdfplumber → fallback ``pdftotext -layout``."""
    # Основной способ — pdfplumber
    try:
        import pdfplumber  # отложенный импорт: библиотека опциональна

        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            pages = [(page.extract_text() or "") for page in pdf.pages]
        text = "\n".join(pages)
        if text.strip():
            return text
    except ImportError:
        pass
    except Exception:  # noqa: BLE001 — переходим к запасному способу
        pass
    # Резервный способ — консольная утилита pdftotext (пакет poppler-utils)
    try:
        return _pdftotext(pdf_bytes)
    except Exception as exc:  # noqa: BLE001
        raise SourceError(
            "Не удалось извлечь текст из PDF: установите pdfplumber (pip) или poppler-utils (система)"
        ) from exc


def _pdftotext(pdf_bytes: bytes) -> str:
    """Извлечь текст утилитой ``pdftotext -layout`` (сохраняет колонки)."""
    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
        tmp.write(pdf_bytes)
        path = tmp.name
    try:
        proc = subprocess.run(  # noqa: S603 — фиксированная команда
            ["pdftotext", "-layout", path, "-"],
            capture_output=True,
            timeout=30,
            check=False,
        )
        if proc.returncode != 0:
            raise RuntimeError(proc.stderr.decode("utf-8", errors="replace").strip() or f"код {proc.returncode}")
        text = proc.stdout.decode("utf-8", errors="replace")
        if not text.strip():
            raise RuntimeError("pdftotext вернул пустой текст")
        return text
    finally:
        Path(path).unlink(missing_ok=True)


async def _pdf_text(client: Any, url: str, date_key: str) -> str:
    """Скачать PDF меню и вернуть его текст (с дисковым кэшем по дате)."""
    cache_file = CACHE_DIR / f"menu_{date_key.replace('.', '-')}.txt"
    if cache_file.exists():
        return cache_file.read_text(encoding="utf-8")
    pdf_bytes = await http_get_bytes(client, url)
    text = _extract_pdf_text(pdf_bytes)
    if not text.strip():
        raise SourceError(f"Пустой текст PDF: {url}")
    try:
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        cache_file.write_text(text, encoding="utf-8")
    except OSError:
        pass  # дисковый кэш не критичен
    return text


# ---------------------------------------------------------------------------
# Разбор текста меню
# ---------------------------------------------------------------------------

@dataclass
class _Dish:
    """Накопитель данных одного блюда в процессе разбора."""

    weight: int | None
    name: str
    fragments: list[str] = field(default_factory=list)  # фрагменты строк КБЖУ
    ingredients: list[str] = field(default_factory=list)


def _num(value: Any) -> int | float:
    """Число из строки: целые остаются ``int``, дробные — ``float``."""
    if value is None:
        return None  # type: ignore[return-value]
    number = float(str(value).replace(",", "."))
    return int(number) if number.is_integer() else number


def _parse_kbju(fragments: list[str]) -> dict[str, int | float]:
    """Разобрать список фрагментов строк КБЖУ в словарь значений.

    Понимает «Ккал-2 866» (пробел внутри числа), анфо-тире и запятые.
    """
    if not fragments:
        return {}
    joined = ", ".join(fragments)
    joined = re.sub(r"(\d)\s+(\d)", r"\1\2", joined)  # «Ккал-2 866» → «Ккал-2866»
    result: dict[str, int | float] = {}
    for ru_name, key in (("Ккал", "kcal"), ("Белки", "protein"), ("Жиры", "fat"), ("Углеводы", "carbs")):
        match = re.search(rf"{ru_name}\s*[-–—]\s*(\d+(?:[.,]\d+)?)", joined)
        if match:
            result[key] = _num(match.group(1))
    return result


def _clean_name(name: str) -> str:
    """Убрать обрамляющие кавычки и лишние пробелы из названия блюда."""
    return name.strip().strip('"«»„“').strip()


def _split_trailing_nutrition(rest: str) -> tuple[str, str | None]:
    """Отделить КБЖУ правой колонки от названия блюда в одной строке."""
    match = TRAILING_NUTRITION_RE.search(rest)
    if match:
        return rest[: match.start()].strip(), match.group(1)
    return rest.strip(), None


def _is_noise(line: str) -> bool:
    """Строка шапки PDF (заголовок, названия колонок и т.п.)."""
    low = line.lower()
    return any(marker in low for marker in NOISE_MARKERS)


def _looks_like_standalone_dish(line: str, current_dish: _Dish | None) -> bool:
    """Похоже ли на блюдо без графы «выход» (например, «Чай без сахара»).

    Ингредиенты обычно перечисляются через запятую и часто начинаются со
    строчной буквы, поэтому: строка без запятых и КБЖУ, начинающаяся с
    заглавной буквы и подходящая под список типовых «безвесовых» позиций,
    считается отдельным блюдом. Без активного блюда — тоже блюдо.
    """
    if not line:
        return False
    first = line[0]
    if first.islower() or first.isdigit():
        return False
    if "," in line or "Ккал" in line:
        return False
    if STANDALONE_DISH_RE.match(line):
        return True
    return current_dish is None


def parse_menu_text(text: str) -> dict[str, Any]:
    """Разобрать текст меню из PDF.

    Возвращает ``{"meals": [...], "day_totals": {...}}``, где каждый приём
    пищи — ``{"type": "Завтрак", "dishes": [...], "totals": {...}}``.

    Особенности вёрстки PDF (проверено на реальных файлах):

    * строка КБЖУ печатается в правой колонке **над** строкой блюда,
      а её продолжение («Углеводы-33») — на самой строке блюда;
    * ингредиенты — строками ниже блюда (могут переноситься);
    * итоги приёма пищи — строка «Итого за <приём> Ккал-...» (+ перенос);
    * итог за день может идти без метки «Итого» (просто КБЖУ-строка).
    """
    meals: list[dict[str, Any]] = []
    sections: dict[str, dict[str, Any]] = {}
    current_section: dict[str, Any] | None = None
    current_dish: _Dish | None = None
    # КБЖУ-фрагменты, встреченные до строки блюда, принадлежат СЛЕДУЮЩЕМУ блюду
    pending_nutrition: list[str] = []
    # Блоки итогов: {"target": "Завтрак"|"day", "fragments": [...], "has_kcal": bool}
    totals_blocks: list[dict[str, Any]] = []
    last_event_totals = False

    def section_has_totals(section_type: str) -> bool:
        return any(block["target"] == section_type for block in totals_blocks)

    def start_totals(label: str | None, fragment: str) -> None:
        """Начать новый блок итогов по метке «Итого за <X>»."""
        label_norm = (label or "").strip().lower()
        label_section = SECTION_ALIASES.get(label_norm)
        if label_section is not None:
            target: str = label_section
        elif current_section is not None and not section_has_totals(current_section["type"]):
            target = current_section["type"]
        else:
            target = "day"
        totals_blocks.append(
            {"target": target, "fragments": [fragment] if fragment else [], "has_kcal": "Ккал" in fragment}
        )

    def flush_dish(consume_pending: bool = False) -> None:
        """Завершить текущее блюдо и добавить его в секцию."""
        nonlocal current_dish, pending_nutrition
        if current_dish is None:
            return
        if consume_pending and pending_nutrition:
            # Оставшиеся фрагменты после последнего блюда — вероятнее всего
            # перенос его же КБЖУ (не нашлось следующей строки блюда).
            current_dish.fragments.extend(pending_nutrition)
            pending_nutrition = []
        kbju = _parse_kbju(current_dish.fragments)
        dish = {
            "weight": current_dish.weight,
            "name": _clean_name(current_dish.name),
            "kcal": kbju.get("kcal"),
            "protein": kbju.get("protein"),
            "fat": kbju.get("fat"),
            "carbs": kbju.get("carbs"),
            "ingredients": " ".join(current_dish.ingredients).strip() or None,
        }
        if current_section is not None:
            current_section["dishes"].append(dish)
        current_dish = None

    for raw_line in text.splitlines():
        line = raw_line.replace("\xa0", " ")
        stripped = re.sub(r"\s+", " ", line).strip()
        if not stripped:
            continue
        if _is_noise(stripped):
            continue
        if DATE_LINE_RE.fullmatch(stripped):
            continue

        # --- Заголовок секции («Завтрак», «Обед», …) ---
        section_name = SECTION_ALIASES.get(stripped.lower())
        if section_name:
            flush_dish(consume_pending=True)
            if section_name not in sections:
                sections[section_name] = {"type": section_name, "dishes": [], "totals": None}
            current_section = sections[section_name]
            pending_nutrition = []
            last_event_totals = False
            continue

        # --- Итоги приёма пищи / дня ---
        if stripped.lower().startswith("итого"):
            flush_dish(consume_pending=True)
            match = ITOGO_RE.match(stripped)
            label = match.group(1).strip() if match else ""
            start_totals(label or None, stripped)
            last_event_totals = True
            continue

        # --- Строка КБЖУ ---
        if NUTRITION_START_RE.match(stripped):
            if last_event_totals and totals_blocks:
                block = totals_blocks[-1]
                if block["has_kcal"] and stripped.startswith("Ккал"):
                    # Предыдущий блок завершён — начался итог следующего уровня
                    # (например, «Итого за день» без метки «Итого»).
                    start_totals(None, stripped)
                else:
                    block["fragments"].append(stripped)
                    block["has_kcal"] = block["has_kcal"] or stripped.startswith("Ккал")
            else:
                # КБЖУ печатается над строкой блюда — сохраняем для следующего
                pending_nutrition.append(stripped)
            continue

        # --- Блюдо с графой «выход» ---
        dish_match = DISH_LINE_RE.match(stripped)
        if dish_match:
            weight_raw, rest = dish_match.group(1), dish_match.group(2)
            name, trailing = _split_trailing_nutrition(rest)
            # Защита от ингредиентов, начинающихся с числа («3 шт. яиц, …»)
            if name and name[0].islower() and current_dish is not None:
                current_dish.ingredients.append(stripped)
                continue
            flush_dish()
            fragments: list[str] = list(pending_nutrition)
            if trailing:
                fragments.append(trailing)
            current_dish = _Dish(weight=int(weight_raw), name=name, fragments=fragments)
            pending_nutrition = []
            last_event_totals = False
            continue

        # --- Блюдо без графы «выход» («Чай без сахара») ---
        if _looks_like_standalone_dish(stripped, current_dish):
            flush_dish()
            current_dish = _Dish(weight=None, name=stripped, fragments=list(pending_nutrition))
            pending_nutrition = []
            last_event_totals = False
            continue

        # --- Ингредиенты текущего блюда ---
        if current_dish is not None:
            current_dish.ingredients.append(stripped)
        else:
            # Посторонняя строка вне контекста — сбрасываем режим итогов,
            # чтобы КБЖУ следующих блюд корректно ушёл в pending.
            last_event_totals = False

    flush_dish(consume_pending=True)

    # Применяем блоки итогов
    day_totals: dict[str, int | float] | None = None
    for block in totals_blocks:
        parsed = _parse_kbju(block["fragments"])
        if not parsed:
            continue
        if block["target"] == "day":
            day_totals = parsed
        else:
            section = sections.get(block["target"])
            if section is not None:
                section["totals"] = parsed

    meals = [sections[name] for name in SECTION_ORDER if name in sections]
    return {"meals": meals, "day_totals": day_totals}


# ---------------------------------------------------------------------------
# Публичная функция
# ---------------------------------------------------------------------------

async def get_menu(client: Any, date: str | None = None) -> dict[str, Any]:
    """Собрать меню на дату.

    :param client: ``httpx.AsyncClient`` приложения;
    :param date: дата ``ДД.ММ.ГГ``/``ДД.ММ.ГГГГ``; ``None`` — сегодня (по Новосибирску);
    :return: словарь-поле ответа ``GET /api/menu`` (без поля ``stale``);
    :raises SourceError: если каталог или PDF недоступны;
    :raises ValueError: если передан некорректный формат даты.
    """
    catalog = await fetch_catalog(client)
    if not catalog:
        raise SourceError(f"На странице {CATALOG_URL} не найдено ссылок на PDF-меню")

    requested = normalize_date(date.strip() if date else "") if date and date.strip() else today_nsk()
    requested_date = _parse_date(requested)

    if requested in catalog:
        target, substituted = requested, False
    else:
        target = _nearest_date(list(catalog), requested_date)
        substituted = True

    url = catalog[target]
    text = await _pdf_text(client, url, target)
    parsed = parse_menu_text(text)

    message: str | None = None
    if substituted:
        message = f"Меню на {requested} не опубликовано — показано ближайшее доступное ({target})."

    return {
        "ok": True,
        "date": target,
        "requested_date": requested,
        "substituted": substituted,
        "message": message,
        "pdf_url": url,
        "source": CATALOG_URL,
        "available_dates": sorted(catalog, key=_parse_date),
        "meals": parsed["meals"],
        "day_totals": parsed["day_totals"],
    }

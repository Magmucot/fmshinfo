"""Клиент открытого API расписания занятий «ФМШ Расписание занятий» (НГУ).

Базовый адрес: https://table-sesc.nsu.ru — SPA на Vue.js, API открыт
(авторизация нужна только для бронирования аудиторий).

Используемые эндпоинты (см. ``docs/sunc-info-analysis.md``, разделы 3.2–3.3):

* ``GET /api/bell``           — расписание звонков;
* ``GET /api/school-class``   — список классов;
* ``GET /api/schedule/find``  — расписание по группе/преподавателю/аудитории.

Особенность звонков: в API есть интервал 15:00–16:00 (факультативы),
которого нет в статической таблице академического календаря, а в таблице
есть шестая пара 21:20–22:00, которой нет в API — поэтому API-список
объединяется со статическим.
"""

from __future__ import annotations

import re
from typing import Any

from . import SourceError, http_get_json

#: Базовый адрес сервиса расписания
BASE_URL = "https://table-sesc.nsu.ru"

#: Статический список звонков (API + академический календарь, раздел 3.2)
STATIC_BELLS: tuple[tuple[str, str], ...] = (
    ("08:30", "09:15"),
    ("09:25", "10:10"),
    ("10:20", "11:05"),
    ("11:15", "12:00"),
    ("12:30", "13:15"),
    ("13:25", "14:10"),
    ("15:00", "16:00"),  # факультативы/кружки — есть только в API
    ("16:00", "16:40"),
    ("16:50", "17:30"),
    ("18:00", "18:40"),
    ("18:50", "19:30"),
    ("20:30", "21:10"),
    ("21:20", "22:00"),  # шестая пара, урок 2 — есть только в календаре
)

#: Номер пары по времени начала урока
PAIR_BY_BEGIN: dict[str, int] = {
    "08:30": 1,
    "09:25": 1,
    "10:20": 2,
    "11:15": 2,
    "12:30": 3,
    "13:25": 3,
    "16:00": 4,
    "16:50": 4,
    "18:00": 5,
    "18:50": 5,
    "20:30": 6,
    "21:20": 6,
}

PAIR_NAMES: dict[int, str] = {
    1: "Первая пара",
    2: "Вторая пара",
    3: "Третья пара",
    4: "Четвёртая пара",
    5: "Пятая пара",
    6: "Шестая пара",
}

#: Тип занятия из API table-sesc: 1 — лекция, 2 — семинар/практика, 3 — лабораторная
LESSON_TYPES: dict[int, str] = {1: "лекция", 2: "семинар", 3: "лабораторная"}

#: Дни недели в API расписания: 1 = понедельник … 6 = суббота
WEEKDAY_NAMES: dict[int, str] = {
    1: "Понедельник",
    2: "Вторник",
    3: "Среда",
    4: "Четверг",
    5: "Пятница",
    6: "Суббота",
}


def _class_sort_key(name: str) -> tuple[int, int, str]:
    """Ключ сортировки классов: «8-1», «8-2», … «10-1», «11-7»."""
    match = re.match(r"^(\d+)-(\d+)$", name)
    if match:
        return int(match.group(1)), int(match.group(2)), name
    return 99, 0, name


async def get_bells(client: Any) -> dict[str, Any]:
    """Расписание звонков: API + статический список (объединение).

    При недоступности API отдаётся статический список с ``fallback: True``
    (см. требование: «Fallback на статические данные при недоступности»).
    """
    bells: list[dict[str, str]] = []
    source_parts: list[str] = []
    fallback = False
    try:
        data = await http_get_json(client, f"{BASE_URL}/api/bell", timeout=15.0)
        raw_bells = (data.get("payload") or {}).get("bells") or []
        for item in raw_bells:
            begin, end = str(item.get("begin", "")), str(item.get("end", ""))
            if begin and end:
                bells.append({"begin": begin, "end": end})
        source_parts.append("table-sesc.nsu.ru/api/bell")
    except Exception:  # noqa: BLE001 — работаем на статических данных
        fallback = True

    # Объединение со статическим списком (в API нет пары 21:20–22:00)
    present = {(bell["begin"], bell["end"]) for bell in bells}
    static_extra = [
        {"begin": begin, "end": end} for begin, end in STATIC_BELLS if (begin, end) not in present
    ]
    if static_extra:
        bells.extend(static_extra)
        source_parts.append("статический список (академический календарь)")

    if not bells:
        raise SourceError("Расписание звонков недоступно: API не отвечает, статический список пуст")

    bells.sort(key=lambda bell: bell["begin"])
    result = [
        {
            "begin": bell["begin"],
            "end": bell["end"],
            "pair": PAIR_BY_BEGIN.get(bell["begin"]),
            "pair_name": PAIR_NAMES.get(PAIR_BY_BEGIN.get(bell["begin"], 0)),
        }
        for bell in bells
    ]
    return {
        "bells": result,
        "source": " + ".join(source_parts),
        "fallback": fallback,
    }


async def get_classes(client: Any) -> dict[str, Any]:
    """Список классов (8-1 … 11-7) из ``GET /api/school-class``."""
    data = await http_get_json(client, f"{BASE_URL}/api/school-class", timeout=15.0)
    groups = (data.get("payload") or {}).get("groups") or []
    names = sorted({str(group.get("name")) for group in groups if group.get("name")}, key=_class_sort_key)
    if not names:
        raise SourceError("Сервис расписания вернул пустой список классов")
    return {"classes": names, "count": len(names)}


async def get_schedule(
    client: Any,
    group: str | None = None,
    teacher: str | None = None,
    classroom: str | None = None,
) -> dict[str, Any]:
    """Расписание занятий: ``GET /api/schedule/find``.

    Задаётся ровно один фильтр: ``group`` (например, ``10-1``), ``teacher``
    или ``classroom``. Ответ API имеет вид::

        {"payload": {"schedule": {"1-08:30": [ {…урок…} ], …}}}

    где ключ — ``"<день недели>-<начало урока>"`` (1 = Пн … 6 = Сб).
    Функция приводит данные к структуре ``days``: словарь день → список уроков.
    """
    query = {"group": group or "", "teacher": teacher or "", "classroom": classroom or ""}
    data = await http_get_json(client, f"{BASE_URL}/api/schedule/find", params=query, timeout=15.0)
    schedule = (data.get("payload") or {}).get("schedule") or {}

    days: dict[str, list[dict[str, Any]]] = {str(weekday): [] for weekday in range(1, 7)}
    for key, lessons in schedule.items():
        parts = str(key).split("-")
        if len(parts) != 2:
            continue
        try:
            weekday = int(parts[0])
        except ValueError:
            continue
        if weekday not in range(1, 8):
            continue
        bucket = days.setdefault(str(weekday), [])
        for lesson in lessons:
            time_obj = lesson.get("time") or {}
            lesson_obj = lesson.get("lesson") or {}
            classroom_obj = lesson.get("classroom") or {}
            teacher_obj = lesson.get("teacher") or {}
            lesson_type = lesson_obj.get("type")
            lesson_name = str(lesson_obj.get("name") or "—")
            nl = lesson_name.lower()
            if "спецкурс" in nl or nl.startswith("ск ") or "спец." in nl:
                type_name = "спецкурс"
            elif "факультатив" in nl:
                type_name = "факультатив"
            elif "лабораторн" in nl:
                type_name = "лабораторная"
            else:
                type_name = LESSON_TYPES.get(lesson_type, "занятие")
            classes = [
                str(class_obj.get("name")) for class_obj in (lesson.get("schoolClasses") or []) if class_obj.get("name")
            ]
            subgroup = None
            if group:
                matching = next(
                    (c for c in (lesson.get("schoolClasses") or []) if str(c.get("name") or "").lower() == group.lower()),
                    None,
                )
                if matching and matching.get("subgroup"):
                    raw = str(matching["subgroup"])
                    digits = "".join(ch for ch in raw if ch.isdigit())
                    subgroup = f"{digits}-я подгруппа" if digits else raw
            else:
                first_with_sub = next((c for c in (lesson.get("schoolClasses") or []) if c.get("subgroup")), None)
                if first_with_sub:
                    raw = str(first_with_sub["subgroup"])
                    digits = "".join(ch for ch in raw if ch.isdigit())
                    subgroup = f"{digits}-я подгруппа" if digits else raw

            begin_time = str(time_obj.get("begin") or parts[1])
            pair_num = PAIR_BY_BEGIN.get(begin_time)
            bucket.append(
                {
                    "weekday": weekday,
                    "begin": begin_time,
                    "end": str(time_obj.get("end") or ""),
                    "lesson": lesson_name,
                    "type": lesson_type,
                    "type_name": type_name,
                    "classroom": str(classroom_obj["name"]) if classroom_obj.get("name") else None,
                    "teacher": str(teacher_obj["name"]) if teacher_obj.get("name") else None,
                    "classes": classes,
                    "subgroup": subgroup,
                    "pair": pair_num,
                    "pair_name": PAIR_NAMES.get(pair_num),
                    "date": lesson.get("date"),
                }
            )
    for bucket in days.values():
        bucket.sort(key=lambda item: (item["begin"], item["lesson"]))
    total_lessons = sum(len(bucket) for bucket in days.values())
    return {
        "group": group or None,
        "teacher": teacher or None,
        "classroom": classroom or None,
        "days": days,
        "total_lessons": total_lessons,
    }

"""Наполнение SQLite демо-данными: дежурства классов и ночные вожатые.

График дежурств и ночные вожатые онлайн НЕ публикуются (см. анализ,
разделы 3.4–3.5), поэтому в реальной эксплуатации эти таблицы наполняет
администратор через ``POST /api/duty`` и ``POST /api/night-counselors``.
Этот скрипт создаёт ПРИМЕРНЫЕ данные на 7 дней вперёд, чтобы интерфейс
не выглядел пустым при первом запуске.

Запуск::

    python seed.py           # добавить демо-данные (сегодня + 6 дней)
    python seed.py --clear   # удалить ВСЕ дежурства и вожатых
"""

from __future__ import annotations

import datetime as dt
import sys

import database


def _fmt(day: dt.date) -> str:
    return day.strftime("%d.%m.%Y")


# Классы, дежурящие по столовой (реальные классы СУНЦ НГУ 2026/27)
_DUTY_CLASSES: list[tuple[str, str, str]] = [
    # (класс, время, ответственный воспитатель)
    ("10-1", "после 2-й пары (полдник)", "Смирнова О. В."),
    ("10-2", "после 3-й пары (обед)", "Ковалёв А. И."),
    ("10-3", "после 5-й пары (ужин)", "Смирнова О. В."),
    ("9-1", "после 2-й пары (полдник)", "Титова Н. С."),
    ("9-2", "после 3-й пары (обед)", "Ковалёв А. И."),
    ("11-1", "после 5-й пары (ужин)", "Гусев П. Е."),
    ("11-3", "после 2-й пары (полдник)", "Титова Н. С."),
]

# Ночные вожатые по общежитиям (ДЕМО-ФИО; заменить реальными при вводе)
_NIGHT: list[tuple[str, str, str, str]] = [
    # (общежитие, ФИО, телефон, этаж)
    ("Общежитие №1", "Смирнова Ольга Викторовна", "+7 (383) 373-96-41", "2–3 этажи"),
    ("Общежитие №2", "Ковалёв Артём Игоревич", "+7 (383) 373-96-41", "3–4 этажи"),
]


def seed(days: int = 7) -> tuple[int, int]:
    """Заполнить таблицы демо-данными на ``days`` дней вперёд. Возвращает (дежурства, вожатые)."""
    database.init_db()
    today = dt.date.today()
    duty_count = 0
    night_count = 0

    for offset in range(days):
        day = today + dt.timedelta(days=offset)
        weekday = day.weekday()  # 0 = Пн
        if weekday >= 6:  # воскресенье — дежурств нет
            continue

        # Дежурство класса по столовой — ротация по дням недели
        cls, interval, responsible = _DUTY_CLASSES[(weekday + offset) % len(_DUTY_CLASSES)]
        database.upsert_duty(
            {
                "date": _fmt(day),
                "duty_type": "столовая",
                "class_name": cls,
                "responsible": responsible,
                "time_interval": interval,
                "notes": "Помощь при раздаче, уборка столов (демо-запись)",
            }
        )
        duty_count += 1

        # Дежурство по корпусу — 10-е классы по средам
        if weekday == 2:
            database.upsert_duty(
                {
                    "date": _fmt(day),
                    "duty_type": "корпус",
                    "class_name": "10-5",
                    "responsible": "Гусев П. Е.",
                    "time_interval": "вечер, после 5-й пары",
                    "notes": "Дежурство по учебному корпусу (демо-запись)",
                }
            )
            duty_count += 1

        # Ночные вожатые — ежедневно в обоих общежитиях
        for dorm, name, phone, floor in _NIGHT:
            database.upsert_night_counselor(
                {
                    "date": _fmt(day),
                    "dormitory": dorm,
                    "counselor_name": name,
                    "phone": phone,
                    "floor": floor,
                    "notes": "Круглосуточное дежурство с обходами (демо-запись)",
                }
            )
            night_count += 1

    return duty_count, night_count


def clear() -> None:
    """Удалить все записи дежурств и ночных вожатых."""
    from sqlalchemy import delete

    database.init_db()
    with database.SessionLocal() as session:
        session.execute(delete(database.DutyEntryModel))
        session.execute(delete(database.NightCounselorModel))
        session.commit()


if __name__ == "__main__":
    if "--clear" in sys.argv:
        clear()
        print("Таблицы дежурств и ночных вожатых очищены.")
    else:
        duties, nights = seed()
        print(f"Добавлено демо-записей: дежурств — {duties}, ночных вожатых — {nights}.")
        print("Не забудьте заменить их реальными данными через POST /api/duty и")
        print("POST /api/night-counselors (заголовок X-Admin-Key).")

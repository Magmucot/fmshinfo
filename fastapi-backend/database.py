"""SQLite-хранилище «СУНЦ Инфо» через SQLAlchemy 2.0 (синхронный движок).

Содержит таблицы, наполняемые вручную (график дежурств и ночные вожатые
онлайн не публикуются — см. анализ, разделы 3.4–3.5) и таблицу обратной
связи. Асинхронные эндпоинты FastAPI вызывают эти функции через
``asyncio.to_thread`` — для локального SQLite этого достаточно.

Файл базы данных: ``sunc_info.db`` (рядом с ``main.py``; переопределяется
переменной окружения ``SUNC_DB_PATH``).
"""

from __future__ import annotations

import datetime as dt
import os
from typing import Any

from sqlalchemy import DateTime, String, create_engine, func, select
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
#: Путь к файлу базы данных
DB_PATH: str = os.environ.get("SUNC_DB_PATH", os.path.join(BASE_DIR, "sunc_info.db"))

engine = create_engine(f"sqlite:///{DB_PATH}", connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)

#: Типы дежурств (анализ, раздел 3.4)
DUTY_TYPES: tuple[str, ...] = ("столовая", "корпус", "общежитие", "медпункт", "прочее")
#: Общежития (анализ, раздел 3.5)
DORMITORIES: tuple[str, ...] = ("Общежитие №1", "Общежитие №2")


class Base(DeclarativeBase):
    """Базовый класс декларативных моделей SQLAlchemy."""


class DutyEntryModel(Base):
    """Дежурство (классы по столовой/корпусу/общежитию) — ручной ввод."""

    __tablename__ = "duty_entries"

    id: Mapped[int] = mapped_column(primary_key=True)
    #: Дата дежурства в формате ДД.ММ.ГГГГ
    date: Mapped[str] = mapped_column(String(10), index=True)
    duty_type: Mapped[str] = mapped_column(String(32), default="столовая")
    class_name: Mapped[str | None] = mapped_column(String(64), default=None)
    responsible: Mapped[str | None] = mapped_column(String(128), default=None)
    time_interval: Mapped[str | None] = mapped_column(String(128), default=None)
    notes: Mapped[str | None] = mapped_column(String(512), default=None)
    created_at: Mapped[dt.datetime] = mapped_column(DateTime, server_default=func.now())


class NightCounselorModel(Base):
    """Ночной вожатый (воспитатель) на дату — ручной ввод."""

    __tablename__ = "night_counselors"

    id: Mapped[int] = mapped_column(primary_key=True)
    #: Дата дежурства в формате ДД.ММ.ГГГГ
    date: Mapped[str] = mapped_column(String(10), index=True)
    dormitory: Mapped[str] = mapped_column(String(32))
    counselor_name: Mapped[str] = mapped_column(String(128))
    phone: Mapped[str | None] = mapped_column(String(32), default=None)
    floor: Mapped[str | None] = mapped_column(String(64), default=None)
    notes: Mapped[str | None] = mapped_column(String(512), default=None)
    created_at: Mapped[dt.datetime] = mapped_column(DateTime, server_default=func.now())


class FeedbackModel(Base):
    """Сообщение обратной связи с сайта."""

    __tablename__ = "feedback"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    contact: Mapped[str] = mapped_column(String(200))
    message: Mapped[str] = mapped_column(String(4000))
    created_at: Mapped[dt.datetime] = mapped_column(DateTime, server_default=func.now())


def init_db() -> None:
    """Создать таблицы, если их ещё нет."""
    Base.metadata.create_all(engine)


def ping() -> bool:
    """Проверка доступности базы данных (для /api/health)."""
    with SessionLocal() as session:
        session.execute(select(1))
    return True


# ---------------------------------------------------------------------------
# Дежурства
# ---------------------------------------------------------------------------

_DUTY_FIELDS = ("date", "duty_type", "class_name", "responsible", "time_interval", "notes")


def _duty_to_dict(row: DutyEntryModel) -> dict[str, Any]:
    return {
        "id": row.id,
        "date": row.date,
        "duty_type": row.duty_type,
        "class_name": row.class_name,
        "responsible": row.responsible,
        "time_interval": row.time_interval,
        "notes": row.notes,
    }


def list_duty(date: str | None = None) -> list[dict[str, Any]]:
    """Список дежурств (опционально — на конкретную дату), отсортирован по дате."""
    with SessionLocal() as session:
        statement = select(DutyEntryModel)
        if date:
            statement = statement.where(DutyEntryModel.date == date)
        statement = statement.order_by(DutyEntryModel.date, DutyEntryModel.id)
        return [_duty_to_dict(row) for row in session.scalars(statement)]


def upsert_duty(data: dict[str, Any]) -> dict[str, Any]:
    """Создать дежурство или обновить существующее (если передан ``id``).

    :raises ValueError: если ``id`` передан, но запись не найдена.
    """
    with SessionLocal() as session:
        entry_id = data.get("id")
        if entry_id:
            obj = session.get(DutyEntryModel, int(entry_id))
            if obj is None:
                raise ValueError(f"Дежурство с id={entry_id} не найдено")
        else:
            obj = DutyEntryModel()
        for field in _DUTY_FIELDS:
            value = data.get(field)
            if value is not None:
                setattr(obj, field, value)
        session.add(obj)
        session.commit()
        session.refresh(obj)
        return _duty_to_dict(obj)


# ---------------------------------------------------------------------------
# Ночные вожатые
# ---------------------------------------------------------------------------

_COUNSELOR_FIELDS = ("date", "dormitory", "counselor_name", "phone", "floor", "notes")


def _counselor_to_dict(row: NightCounselorModel) -> dict[str, Any]:
    return {
        "id": row.id,
        "date": row.date,
        "dormitory": row.dormitory,
        "counselor_name": row.counselor_name,
        "phone": row.phone,
        "floor": row.floor,
        "notes": row.notes,
    }


def list_night_counselors(date: str | None = None) -> list[dict[str, Any]]:
    """Список ночных вожатых (опционально — на конкретную дату)."""
    with SessionLocal() as session:
        statement = select(NightCounselorModel)
        if date:
            statement = statement.where(NightCounselorModel.date == date)
        statement = statement.order_by(NightCounselorModel.date, NightCounselorModel.dormitory)
        return [_counselor_to_dict(row) for row in session.scalars(statement)]


def upsert_night_counselor(data: dict[str, Any]) -> dict[str, Any]:
    """Создать/обновить запись о ночном вожатом.

    :raises ValueError: если ``id`` передан, но запись не найдена.
    """
    with SessionLocal() as session:
        entry_id = data.get("id")
        if entry_id:
            obj = session.get(NightCounselorModel, int(entry_id))
            if obj is None:
                raise ValueError(f"Запись с id={entry_id} не найдена")
        else:
            obj = NightCounselorModel()
        for field in _COUNSELOR_FIELDS:
            value = data.get(field)
            if value is not None:
                setattr(obj, field, value)
        session.add(obj)
        session.commit()
        session.refresh(obj)
        return _counselor_to_dict(obj)


# ---------------------------------------------------------------------------
# Обратная связь
# ---------------------------------------------------------------------------

def add_feedback(name: str, contact: str, message: str) -> int:
    """Сохранить сообщение обратной связи, вернуть его id."""
    with SessionLocal() as session:
        row = FeedbackModel(name=name, contact=contact, message=message)
        session.add(row)
        session.commit()
        return int(row.id)

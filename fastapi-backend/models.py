"""Pydantic v2 модели API «СУНЦ Инфо».

Все модели ответов наследуются от :class:`APIModel`, который превращает
snake_case имена полей в camelCase алиасы (``pdf_url`` → ``pdfUrl``) —
FastAPI сериализует ответы по алиасам. Входные модели принимают как
camelCase, так и snake_case (``populate_by_name=True``).

Общие соглашения ответов:

* ``ok: true/false`` — статус операции (обязательное поле);
* ``stale: true`` — данные отданы из просроченного кэша, т.к. источник
  временно недоступен;
* ``error`` — текст ошибки на русском (когда ``ok == false``).
"""

from __future__ import annotations

from typing import Union

from pydantic import BaseModel, ConfigDict, Field

#: Число: целые остаются целыми, дробные — дробными
Number = Union[int, float]


def to_camel(name: str) -> str:
    """snake_case → camelCase (``available_dates`` → ``availableDates``)."""
    first, *rest = name.split("_")
    return first + "".join(part[:1].upper() + part[1:] for part in rest)


class APIModel(BaseModel):
    """Базовая модель: camelCase-алиасы + приём входных данных по имени поля."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


# ---------------------------------------------------------------------------
# Меню столовой
# ---------------------------------------------------------------------------

class Nutrition(APIModel):
    """Итоговая пищевая ценность (КБЖУ)."""

    kcal: Number | None = None
    protein: Number | None = None
    fat: Number | None = None
    carbs: Number | None = None


class Dish(APIModel):
    """Блюдо: выход, название, КБЖУ и состав."""

    weight: int | None = None
    name: str
    kcal: Number | None = None
    protein: Number | None = None
    fat: Number | None = None
    carbs: Number | None = None
    ingredients: str | None = None


class MealSection(APIModel):
    """Приём пищи (Завтрак/Обед/Полдник/Ужин/Второй ужин)."""

    type: str
    dishes: list[Dish] = []
    totals: Nutrition | None = None


class MenuResponse(APIModel):
    """Ответ ``GET /api/menu``."""

    ok: bool = True
    date: str | None = None
    requested_date: str | None = None
    substituted: bool = False
    message: str | None = None
    pdf_url: str | None = None
    source: str = "https://sesc.nsu.ru/sveden/catering"
    available_dates: list[str] = []
    meals: list[MealSection] = []
    day_totals: Nutrition | None = None
    stale: bool = False
    error: str | None = None


# ---------------------------------------------------------------------------
# Звонки и расписание
# ---------------------------------------------------------------------------

class Bell(APIModel):
    """Звонок: начало, конец, номер пары (если известен)."""

    begin: str
    end: str
    pair: int | None = None
    pair_name: str | None = None


class BellsResponse(APIModel):
    """Ответ ``GET /api/bells``."""

    ok: bool = True
    bells: list[Bell] = []
    source: str = ""
    fallback: bool = False
    stale: bool = False
    error: str | None = None


class ClassesResponse(APIModel):
    """Ответ ``GET /api/classes``."""

    ok: bool = True
    classes: list[str] = []
    count: int = 0
    stale: bool = False
    error: str | None = None


class ScheduleLesson(APIModel):
    """Один урок в расписании."""

    weekday: int
    begin: str
    end: str
    lesson: str
    type: int | None = None
    type_name: str | None = None
    classroom: str | None = None
    teacher: str | None = None
    classes: list[str] = []
    date: str | None = None


class ScheduleResponse(APIModel):
    """Ответ ``GET /api/schedule``: дни 1 (Пн) … 6 (Сб)."""

    ok: bool = True
    group: str | None = None
    teacher: str | None = None
    classroom: str | None = None
    days: dict[str, list[ScheduleLesson]] = {}
    total_lessons: int = 0
    stale: bool = False
    error: str | None = None


# ---------------------------------------------------------------------------
# Погода
# ---------------------------------------------------------------------------

class WeatherCurrent(APIModel):
    """Текущая погода."""

    temperature: Number | None = None
    apparent: Number | None = None
    humidity: Number | None = None
    wind_speed: Number | None = None
    wind_direction: Number | None = None
    wind_direction_text: str | None = None
    code: int | None = None
    description: str | None = None
    emoji: str | None = None


class WeatherForecastDay(APIModel):
    """Прогноз на день."""

    date: str | None = None
    weekday: str | None = None
    description: str | None = None
    emoji: str | None = None
    temp_max: Number | None = None
    temp_min: Number | None = None
    precipitation_probability: Number | None = None
    sunrise: str | None = None
    sunset: str | None = None


class WeatherResponse(APIModel):
    """Ответ ``GET /api/weather``."""

    ok: bool = True
    source: str | None = None
    location: str | None = None
    current: WeatherCurrent | None = None
    forecast: list[WeatherForecastDay] = []
    stale: bool = False
    error: str | None = None


# ---------------------------------------------------------------------------
# Новости
# ---------------------------------------------------------------------------

class NewsItem(APIModel):
    """Новость сайта СУНЦ НГУ."""

    id: str
    title: str
    url: str
    date: str | None = None
    rubric: str | None = None


class NewsResponse(APIModel):
    """Ответ ``GET /api/news``."""

    ok: bool = True
    items: list[NewsItem] = []
    count: int = 0
    stale: bool = False
    error: str | None = None


# ---------------------------------------------------------------------------
# Дежурства
# ---------------------------------------------------------------------------

class DutyEntry(APIModel):
    """Запись о дежурстве."""

    id: int
    date: str
    duty_type: str = "столовая"
    class_name: str | None = None
    responsible: str | None = None
    time_interval: str | None = None
    notes: str | None = None


class DutyResponse(APIModel):
    """Ответ ``GET /api/duty``."""

    ok: bool = True
    items: list[DutyEntry] = []
    count: int = 0
    error: str | None = None


class DutyCreate(APIModel):
    """Тело ``POST /api/duty`` (создание или обновление по ``id``)."""

    id: int | None = Field(default=None, description="Для обновления существующей записи")
    date: str = Field(examples=["05.09.2026"], description="Дата дежурства ДД.ММ.ГГГГ")
    duty_type: str = Field(default="столовая", description="столовая/корпус/общежитие/медпункт/прочее")
    class_name: str | None = Field(default=None, examples=["10-2"])
    responsible: str | None = Field(default=None, examples=["Иванов И.И."])
    time_interval: str | None = Field(default=None, examples=["после 3 урока"])
    notes: str | None = None


class DutyWriteResponse(APIModel):
    """Ответ ``POST /api/duty``."""

    ok: bool = True
    entry: DutyEntry | None = None
    error: str | None = None


# ---------------------------------------------------------------------------
# Ночные вожатые
# ---------------------------------------------------------------------------

class NightCounselor(APIModel):
    """Ночной вожатый (воспитатель) на дату."""

    id: int
    date: str
    dormitory: str
    counselor_name: str
    phone: str | None = None
    floor: str | None = None
    notes: str | None = None


class NightCounselorsResponse(APIModel):
    """Ответ ``GET /api/night-counselors``."""

    ok: bool = True
    items: list[NightCounselor] = []
    count: int = 0
    error: str | None = None


class NightCounselorCreate(APIModel):
    """Тело ``POST /api/night-counselors`` (создание или обновление по ``id``)."""

    id: int | None = Field(default=None, description="Для обновления существующей записи")
    date: str = Field(examples=["05.09.2026"], description="Дата дежурства ДД.ММ.ГГГГ")
    dormitory: str = Field(examples=["Общежитие №1"])
    counselor_name: str = Field(examples=["Смирнова Ольга Викторовна"])
    phone: str | None = None
    floor: str | None = Field(default=None, examples=["2 этаж"])
    notes: str | None = None


class NightCounselorWriteResponse(APIModel):
    """Ответ ``POST /api/night-counselors``."""

    ok: bool = True
    entry: NightCounselor | None = None
    error: str | None = None


# ---------------------------------------------------------------------------
# Обратная связь
# ---------------------------------------------------------------------------

class FeedbackCreate(APIModel):
    """Тело ``POST /api/feedback``."""

    name: str = Field(min_length=1, max_length=200, examples=["Мария"])
    contact: str = Field(min_length=1, max_length=200, examples=["maria@example.com или @telegram"])
    message: str = Field(min_length=1, max_length=4000)


class FeedbackResponse(APIModel):
    """Ответ ``POST /api/feedback``."""

    ok: bool = True
    id: int | None = None
    error: str | None = None


# ---------------------------------------------------------------------------
# Справочник (Инфо)
# ---------------------------------------------------------------------------

class SchoolInfo(APIModel):
    """Общие сведения о школе."""

    name: str
    address: str
    site: str
    email: str


class InfoContact(APIModel):
    """Контакт из справочника."""

    title: str
    phone: str | None = None
    email: str | None = None
    note: str | None = None


class InfoLink(APIModel):
    """Ссылка на официальный ресурс."""

    title: str
    url: str
    note: str | None = None


class InfoResponse(APIModel):
    """Ответ ``GET /api/info``: контакты, ссылки, режимы работы."""

    ok: bool = True
    school: SchoolInfo
    contacts: list[InfoContact] = []
    links: list[InfoLink] = []
    admin_schedule: str = ""
    notes: list[str] = []


# ---------------------------------------------------------------------------
# Здоровье сервисов
# ---------------------------------------------------------------------------

class HealthSource(APIModel):
    """Статус одного источника данных."""

    name: str
    ok: bool
    status: str
    latency_ms: int | None = None
    error: str | None = None


class HealthResponse(APIModel):
    """Ответ ``GET /api/health``."""

    ok: bool = True
    sources: list[HealthSource] = []
    checked_at: str = ""
    uptime_seconds: Number = 0

"""Погода рядом с СУНЦ НГУ (Академгородок, Новосибирск).

Координаты школы: 54.842° с.ш., 83.098° в.д. (см. анализ, раздел 3.6).

* Основной источник — **Open-Meteo** (бесплатный, без API-ключа): текущая
  погода + прогноз на 3 дня, таймзона Asia/Novosibirsk.
* Резервный — **wttr.in** (``/Akademgorodok?format=j1``): используется при
  сбое или лимитировании Open-Meteo.

Коды погоды WMO (Open-Meteo) и WWO (wttr.in) переводятся в русские описания
и иконки-эмодзи. Направление ветра переводится в румбы (С, СВ, В, …).
"""

from __future__ import annotations

import datetime as dt
from typing import Any

from . import SourceError, http_get_json

#: Координаты СУНЦ НГУ
LATITUDE = 54.842
LONGITUDE = 83.098

#: Основной источник: текущая погода + прогноз на 3 дня (спецификация из анализа, 3.6)
OPEN_METEO_URL = (
    "https://api.open-meteo.com/v1/forecast"
    "?latitude=54.842&longitude=83.098"
    "&current=temperature_2m,relative_humidity_2m,apparent_temperature,"
    "weather_code,wind_speed_10m,wind_direction_10m"
    "&daily=weather_code,temperature_2m_max,temperature_2m_min,"
    "sunrise,sunset,precipitation_probability_max"
    "&timezone=Asia%2FNovosibirsk&forecast_days=3"
)

#: Лёгкий запрос для проверки доступности (эндпоинт /api/health)
HEALTH_URL = (
    "https://api.open-meteo.com/v1/forecast"
    "?latitude=54.842&longitude=83.098&current=temperature_2m&timezone=Asia%2FNovosibirsk"
)

#: Резервный источник
WTTR_URL = "https://wttr.in/Akademgorodok?format=j1"

LOCATION = "Академгородок, Новосибирск (СУНЦ НГУ)"

#: WMO weather code → (русское описание, иконка)
WMO_CODES: dict[int, tuple[str, str]] = {
    0: ("Ясно", "☀️"),
    1: ("Преимущественно ясно", "🌤️"),
    2: ("Малооблачно", "⛅"),
    3: ("Пасмурно", "☁️"),
    45: ("Туман", "🌫️"),
    48: ("Изморозь", "🌫️"),
    51: ("Слабая морось", "🌦️"),
    53: ("Морось", "🌦️"),
    55: ("Сильная морось", "🌧️"),
    56: ("Ледяная морось", "🌧️"),
    57: ("Ледяная морось", "🌧️"),
    61: ("Слабый дождь", "🌦️"),
    63: ("Дождь", "🌧️"),
    65: ("Сильный дождь", "🌧️"),
    66: ("Ледяной дождь", "🌧️"),
    67: ("Ледяной дождь", "🌧️"),
    71: ("Слабый снег", "🌨️"),
    73: ("Снег", "❄️"),
    75: ("Сильный снег", "❄️"),
    77: ("Снежные зёрна", "🌨️"),
    80: ("Слабый ливень", "🌦️"),
    81: ("Ливень", "🌧️"),
    82: ("Сильный ливень", "⛈️"),
    85: ("Снегопад", "🌨️"),
    86: ("Сильный снегопад", "❄️"),
    95: ("Гроза", "⛈️"),
    96: ("Гроза с градом", "⛈️"),
    99: ("Сильная гроза с градом", "⛈️"),
}

#: Коды WWO (wttr.in) → (русское описание, иконка)
WWO_CODES: dict[int, tuple[str, str]] = {
    113: ("Ясно", "☀️"),
    116: ("Малооблачно", "⛅"),
    119: ("Облачно", "☁️"),
    122: ("Пасмурно", "☁️"),
    143: ("Туман", "🌫️"),
    248: ("Туман", "🌫️"),
    260: ("Туман", "🌫️"),
    176: ("Слабый дождь", "🌦️"),
    263: ("Слабый дождь", "🌦️"),
    266: ("Морось", "🌦️"),
    293: ("Слабый дождь", "🌦️"),
    298: ("Дождь", "🌧️"),
    302: ("Дождь", "🌧️"),
    305: ("Сильный дождь", "🌧️"),
    308: ("Ливень", "🌧️"),
    179: ("Слабый снег", "🌨️"),
    323: ("Слабый снег", "🌨️"),
    328: ("Снег", "❄️"),
    332: ("Снег", "❄️"),
    338: ("Сильный снег", "❄️"),
    200: ("Гроза", "⛈️"),
}

#: Румбы розы ветров
WIND_DIRS: tuple[str, ...] = ("С", "СВ", "В", "ЮВ", "Ю", "ЮЗ", "З", "СЗ")

WEEKDAYS_RU: tuple[str, ...] = ("Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс")


def describe_wmo(code: int | None) -> tuple[str, str]:
    """Код WMO → (русское описание, эмодзи)."""
    return WMO_CODES.get(int(code or 0), ("Переменная облачность", "🌡️"))


def describe_wwo(code: int | None) -> tuple[str, str]:
    """Код WWO → (русское описание, эмодзи)."""
    return WWO_CODES.get(int(code or 0), ("Переменная облачность", "🌡️"))


def wind_direction_text(degrees: Any) -> str | None:
    """Градусы направления ветра → румб («СЗ», «ЮВ», …)."""
    if degrees is None:
        return None
    try:
        index = round(float(degrees) % 360 / 45) % 8
    except (TypeError, ValueError):
        return None
    return WIND_DIRS[index]


def _num(value: Any) -> int | float | None:
    """Число из ответа API (int для целых, float для дробных, None)."""
    if value is None:
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return int(number) if number.is_integer() else number


def _time_of_day(iso_value: Any) -> str | None:
    """«2026-08-30T05:56» → «05:56»."""
    if not iso_value:
        return None
    text = str(iso_value)
    return text[11:16] if len(text) >= 16 else text


def _am_pm_to_24h(value: Any) -> str | None:
    """«5:56 AM» (wttr.in) → «05:56»."""
    if not value:
        return None
    try:
        parsed = dt.datetime.strptime(str(value).strip(), "%I:%M %p")
        return parsed.strftime("%H:%M")
    except ValueError:
        return str(value)


def _weekday_of(date_iso: str | None) -> str | None:
    """«2026-08-30» → «Вс»."""
    if not date_iso:
        return None
    try:
        return WEEKDAYS_RU[dt.date.fromisoformat(str(date_iso)[:10]).weekday()]
    except ValueError:
        return None


def _seq(daily: dict[str, Any], key: str, index: int) -> Any:
    """Безопасно взять элемент ``index`` из массива ``daily[key]``."""
    values = daily.get(key)
    if isinstance(values, list) and index < len(values):
        return values[index]
    return None


# ---------------------------------------------------------------------------
# Open-Meteo (основной источник)
# ---------------------------------------------------------------------------

async def _open_meteo(client: Any) -> dict[str, Any]:
    """Текущая погода и прогноз на 3 дня от Open-Meteo."""
    data = await http_get_json(client, OPEN_METEO_URL, timeout=15.0)
    current = data.get("current") or {}
    daily = data.get("daily") or {}

    code = _num(current.get("weather_code"))
    description, emoji = describe_wmo(int(code) if code is not None else 0)
    current_payload = {
        "temperature": _num(current.get("temperature_2m")),
        "apparent": _num(current.get("apparent_temperature")),
        "humidity": _num(current.get("relative_humidity_2m")),
        "wind_speed": _num(current.get("wind_speed_10m")),
        "wind_direction": _num(current.get("wind_direction_10m")),
        "wind_direction_text": wind_direction_text(current.get("wind_direction_10m")),
        "code": int(code) if code is not None else None,
        "description": description,
        "emoji": emoji,
    }

    forecast: list[dict[str, Any]] = []
    dates = daily.get("time") or []
    for index, date_iso in enumerate(dates[:3]):
        day_code = _num(_seq(daily, "weather_code", index))
        day_description, day_emoji = describe_wmo(int(day_code) if day_code is not None else 0)
        forecast.append(
            {
                "date": str(date_iso),
                "weekday": _weekday_of(str(date_iso)),
                "description": day_description,
                "emoji": day_emoji,
                "temp_max": _num(_seq(daily, "temperature_2m_max", index)),
                "temp_min": _num(_seq(daily, "temperature_2m_min", index)),
                "precipitation_probability": _num(_seq(daily, "precipitation_probability_max", index)),
                "sunrise": _time_of_day(_seq(daily, "sunrise", index)),
                "sunset": _time_of_day(_seq(daily, "sunset", index)),
            }
        )

    return {
        "source": "open-meteo",
        "location": LOCATION,
        "current": current_payload,
        "forecast": forecast,
    }


# ---------------------------------------------------------------------------
# wttr.in (резервный источник)
# ---------------------------------------------------------------------------

async def _wttr(client: Any) -> dict[str, Any]:
    """Текущая погода и прогноз от wttr.in (формат j1)."""
    data = await http_get_json(client, WTTR_URL, timeout=20.0)
    condition = (data.get("current_condition") or [{}])[0]

    code = _num(condition.get("weatherCode"))
    description, emoji = describe_wwo(int(code) if code is not None else 0)
    if description == "Переменная облачность":
        english = ""
        descriptions = condition.get("weatherDesc") or []
        if descriptions and isinstance(descriptions[0], dict):
            english = str(descriptions[0].get("value") or "")
        if english:
            description = english

    current_payload = {
        "temperature": _num(condition.get("temp_C")),
        "apparent": _num(condition.get("FeelsLikeC")),
        "humidity": _num(condition.get("humidity")),
        "wind_speed": _num(condition.get("windspeedKmph")),
        "wind_direction": _num(condition.get("winddirDegree")),
        "wind_direction_text": wind_direction_text(condition.get("winddirDegree")),
        "code": int(code) if code is not None else None,
        "description": description,
        "emoji": emoji,
    }

    forecast: list[dict[str, Any]] = []
    for day in (data.get("weather") or [])[:3]:
        hourly = day.get("hourly") or []
        midday = hourly[len(hourly) // 2] if hourly else {}
        day_code = _num(midday.get("weatherCode"))
        day_description, day_emoji = describe_wwo(int(day_code) if day_code is not None else 0)
        astronomy = (day.get("astronomy") or [{}])[0]
        precip_prob = None
        if hourly:
            try:
                precip_prob = max(int(h.get("chanceofrain", 0)) for h in hourly)
            except (TypeError, ValueError):
                precip_prob = None
        date_iso = str(day.get("date") or "")
        forecast.append(
            {
                "date": date_iso,
                "weekday": _weekday_of(date_iso),
                "description": day_description,
                "emoji": day_emoji,
                "temp_max": _num(day.get("maxtempC")),
                "temp_min": _num(day.get("mintempC")),
                "precipitation_probability": precip_prob,
                "sunrise": _am_pm_to_24h(astronomy.get("sunrise")),
                "sunset": _am_pm_to_24h(astronomy.get("sunset")),
            }
        )

    return {
        "source": "wttr.in",
        "location": LOCATION,
        "current": current_payload,
        "forecast": forecast,
    }


# ---------------------------------------------------------------------------
# Публичная функция
# ---------------------------------------------------------------------------

async def get_weather(client: Any) -> dict[str, Any]:
    """Погода: Open-Meteo, при сбое — wttr.in.

    :return: словарь-поле ответа ``GET /api/weather`` (без ``stale``);
    :raises SourceError: если недоступны оба источника.
    """
    open_meteo_error: Exception | None = None
    try:
        return await _open_meteo(client)
    except Exception as exc:  # noqa: BLE001 — переходим к резервному источнику
        open_meteo_error = exc
    try:
        return await _wttr(client)
    except Exception as exc:  # noqa: BLE001
        raise SourceError(f"Open-Meteo: {open_meteo_error}; wttr.in: {exc}") from exc

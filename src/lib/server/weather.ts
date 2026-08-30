/**
 * Погода в Академгородке (раздел 3.6 документа).
 * Основной источник — Open-Meteo (без ключа), резервный — wttr.in.
 */

import { SESC_COORDS, fetchWithTimeout } from "./sources";

export interface WeatherCurrent {
  temperature: number | null;
  apparent: number | null;
  humidity: number | null;
  windSpeed: number | null;
  windDirection: string | null;
  description: string;
  icon: string;
  sunrise: string | null;
  sunset: string | null;
}

export interface WeatherForecastDay {
  day: string;
  date: string;
  icon: string;
  description: string;
  tempMax: number | null;
  tempMin: number | null;
  precipitationProbability: number | null;
}

export interface WeatherData {
  current: WeatherCurrent;
  forecast: WeatherForecastDay[];
  source: string;
}

/** WMO weather code → [описание, эмодзи] */
export function describeWmo(code: number | null): [string, string] {
  if (code === null) return ["—", "🌡"];
  const map: Record<number, [string, string]> = {
    0: ["Ясно", "☀️"],
    1: ["Преимущественно ясно", "🌤"],
    2: ["Малооблачно", "⛅"],
    3: ["Пасмурно", "☁️"],
    45: ["Туман", "🌫"],
    48: ["Изморозь", "🌫"],
    51: ["Слабая морось", "🌦"],
    53: ["Морось", "🌦"],
    55: ["Сильная морось", "🌧"],
    56: ["Ледяная морось", "🌧"],
    57: ["Сильная ледяная морось", "🌧"],
    61: ["Небольшой дождь", "🌦"],
    63: ["Дождь", "🌧"],
    65: ["Сильный дождь", "🌧"],
    66: ["Ледяной дождь", "🌧"],
    67: ["Сильный ледяной дождь", "🌧"],
    71: ["Небольшой снег", "🌨"],
    73: ["Снег", "❄️"],
    75: ["Сильный снег", "❄️"],
    77: ["Снежные зёрна", "🌨"],
    80: ["Ливни", "🌦"],
    81: ["Ливни", "🌧"],
    82: ["Сильные ливни", "⛈"],
    85: ["Снежные ливни", "🌨"],
    86: ["Сильные снежные ливни", "❄️"],
    95: ["Гроза", "⛈"],
    96: ["Гроза с градом", "⛈"],
    99: ["Сильная гроза с градом", "⛈"],
  };
  return map[code] ?? ["Переменная облачность", "⛅"];
}

/** WWO weather code (wttr.in) → [описание, эмодзи] */
export function describeWwo(code: number | null): [string, string] {
  if (code === null) return ["—", "🌡"];
  const map: Record<number, [string, string]> = {
    113: ["Ясно", "☀️"],
    116: ["Малооблачно", "⛅"],
    119: ["Пасмурно", "☁️"],
    122: ["Пасмурно", "☁️"],
    143: ["Туман", "🌫"],
    176: ["Небольшой дождь", "🌦"],
    200: ["Гроза", "⛈"],
    227: ["Небольшой снег", "🌨"],
    230: ["Сильный снег", "❄️"],
    248: ["Туман", "🌫"],
    260: ["Туман с изморозью", "🌫"],
    263: ["Слабая морось", "🌦"],
    266: ["Морось", "🌦"],
    281: ["Ледяная морось", "🌧"],
    284: ["Сильная ледяная морось", "🌧"],
    293: ["Небольшой дождь", "🌦"],
    296: ["Дождь", "🌧"],
    299: ["Сильный дождь", "🌧"],
    302: ["Дождь", "🌧"],
    305: ["Сильный дождь", "🌧"],
    308: ["Очень сильный дождь", "⛈"],
    311: ["Ледяной дождь", "🌧"],
    314: ["Ледяной дождь", "🌧"],
    317: ["Снег с дождём", "🌨"],
    320: ["Снег", "❄️"],
    323: ["Небольшой снег", "🌨"],
    326: ["Небольшой снег", "🌨"],
    329: ["Снег", "❄️"],
    332: ["Снег", "❄️"],
    335: ["Сильный снег", "❄️"],
    338: ["Сильный снег", "❄️"],
    350: ["Ледяная морось", "🌧"],
    353: ["Ливни", "🌦"],
    356: ["Сильные ливни", "🌧"],
    359: ["Очень сильные ливни", "⛈"],
    362: ["Снежные ливни", "🌨"],
    365: ["Сильные снежные ливни", "❄️"],
    368: ["Небольшой снег", "🌨"],
    371: ["Снег", "❄️"],
    374: ["Снежные ливни", "🌨"],
    377: ["Снежные зёрна", "🌨"],
    386: ["Гроза с дождём", "⛈"],
    389: ["Сильная гроза", "⛈"],
    392: ["Гроза со снегом", "⛈"],
    395: ["Сильная гроза со снегом", "⛈"],
  };
  return map[code] ?? ["Переменная облачность", "⛅"];
}

function windDirectionText(degrees: number | null): string | null {
  if (degrees === null) return null;
  const dirs = ["С", "СВ", "В", "ЮВ", "Ю", "ЮЗ", "З", "СЗ"];
  return dirs[Math.round(degrees / 45) % 8];
}

const WEEKDAY_NAMES = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];

/** Open-Meteo — основной источник */
async function openMeteo(): Promise<WeatherData> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${SESC_COORDS.lat}&longitude=${SESC_COORDS.lon}` +
    "&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m" +
    "&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,precipitation_probability_max" +
    "&timezone=Asia%2FNovosibirsk&forecast_days=3";
  const response = await fetchWithTimeout(url, { timeoutMs: 15000 });
  if (!response.ok) throw new Error(`Open-Meteo вернул HTTP ${response.status}`);
  const data = (await response.json()) as {
    current?: Record<string, number>;
    daily?: Record<string, Array<number | string>>;
  };

  const code = data.current?.weather_code ?? null;
  const [description, icon] = describeWmo(code);
  const current: WeatherCurrent = {
    temperature: data.current?.temperature_2m ?? null,
    apparent: data.current?.apparent_temperature ?? null,
    humidity: data.current?.relative_humidity_2m ?? null,
    windSpeed: data.current?.wind_speed_10m ?? null,
    windDirection: windDirectionText(data.current?.wind_direction_10m ?? null),
    description,
    icon,
    sunrise: data.daily?.sunrise?.[0] ? String(data.daily.sunrise[0]).slice(11, 16) : null,
    sunset: data.daily?.sunset?.[0] ? String(data.daily.sunset[0]).slice(11, 16) : null,
  };

  const forecast: WeatherForecastDay[] = [];
  const daily = data.daily ?? {};
  const dates = (daily.time ?? []) as string[];
  for (let i = 0; i < Math.min(3, dates.length); i++) {
    const dayCode = (daily.weather_code ?? [])[i] as number | undefined;
    const [desc, dayIcon] = describeWmo(dayCode ?? null);
    const dateObj = new Date(dates[i] + "T00:00:00");
    forecast.push({
      day: i === 0 ? "Сегодня" : WEEKDAY_NAMES[dateObj.getDay()] ?? "",
      date: dates[i].split("-").reverse().join("."),
      icon: dayIcon,
      description: desc,
      tempMax: (daily.temperature_2m_max ?? [])[i] as number | undefined ?? null,
      tempMin: (daily.temperature_2m_min ?? [])[i] as number | undefined ?? null,
      precipitationProbability:
        ((daily.precipitation_probability_max ?? [])[i] as number | undefined) ?? null,
    });
  }

  return { current, forecast, source: "Open-Meteo" };
}

/** wttr.in — резервный источник */
async function wttrIn(): Promise<WeatherData> {
  const response = await fetchWithTimeout(
    "https://wttr.in/Akademgorodok?format=j1",
    { timeoutMs: 20000, headers: { Accept: "application/json" } }
  );
  if (!response.ok) throw new Error(`wttr.in вернул HTTP ${response.status}`);
  const data = (await response.json()) as {
    current_condition?: Array<Record<string, string>>;
    weather?: Array<{
      date?: string;
      mintempC?: string;
      maxtempC?: string;
      hourly?: Array<{ chanceofrain?: string; weatherCode?: string }>;
      astronomy?: Array<{ sunrise?: string; sunset?: string }>;
    }>;
  };

  const now = data.current_condition?.[0] ?? {};
  const code = Number(now.weatherCode) || null;
  const [description, icon] = describeWwo(code);

  const to24h = (value: string | undefined): string | null => {
    if (!value) return null;
    const m = value.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    if (!m) return value;
    let hours = Number(m[1]);
    if (m[3].toUpperCase() === "PM" && hours !== 12) hours += 12;
    if (m[3].toUpperCase() === "AM" && hours === 12) hours = 0;
    return `${String(hours).padStart(2, "0")}:${m[2]}`;
  };

  const current: WeatherCurrent = {
    temperature: Number(now.temp_C) || null,
    apparent: Number(now.FeelsLikeC) || null,
    humidity: Number(now.humidity) || null,
    windSpeed: Number(now.windspeedKmph) || null,
    windDirection: now.winddir16Point ?? null,
    description,
    icon,
    sunrise: to24h(data.weather?.[0]?.astronomy?.[0]?.sunrise),
    sunset: to24h(data.weather?.[0]?.astronomy?.[0]?.sunset),
  };

  const forecast: WeatherForecastDay[] = [];
  for (let i = 0; i < Math.min(3, data.weather?.length ?? 0); i++) {
    const day = data.weather![i];
    const dayCode = Number(day.hourly?.[4]?.weatherCode) || null;
    const [desc, dayIcon] = describeWwo(dayCode);
    const chance = Math.max(
      ...(day.hourly ?? []).map((h) => Number(h.chanceofrain) || 0),
      0
    );
    const dateObj = day.date ? new Date(day.date + "T00:00:00") : new Date();
    forecast.push({
      day: i === 0 ? "Сегодня" : WEEKDAY_NAMES[dateObj.getDay()] ?? "",
      date: (day.date ?? "").split("-").reverse().join("."),
      icon: dayIcon,
      description: desc,
      tempMax: Number(day.maxtempC) || null,
      tempMin: Number(day.mintempC) || null,
      precipitationProbability: chance || null,
    });
  }

  return { current, forecast, source: "wttr.in" };
}

/** Погода: Open-Meteo, при сбое — wttr.in */
export async function getWeather(): Promise<WeatherData> {
  try {
    return await openMeteo();
  } catch (openMeteoError) {
    try {
      return await wttrIn();
    } catch (wttrError) {
      throw new Error(
        `Погодные источники недоступны: Open-Meteo — ${(openMeteoError as Error).message}; wttr.in — ${(wttrError as Error).message}`
      );
    }
  }
}

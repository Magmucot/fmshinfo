/** Общие типы данных API «СУНЦ Инфо» (совпадают с серверными) */

export interface Dish {
  weight: number | null;
  name: string;
  kcal: number | null;
  protein: number | null;
  fat: number | null;
  carbs: number | null;
  ingredients: string | null;
}

export interface Nutrition {
  kcal: number | null;
  protein: number | null;
  fat: number | null;
  carbs: number | null;
}

export interface MealSection {
  type: string;
  dishes: Dish[];
  totals: Nutrition;
}

export interface MenuResponse {
  ok: boolean;
  date: string;
  requestedDate: string;
  substituted: boolean;
  message: string | null;
  pdfUrl: string;
  availableDates: string[];
  meals: MealSection[];
  dayTotals: Nutrition;
  stale: boolean;
  error?: string;
}

export interface Bell {
  begin: string;
  end: string;
  pair: number | null;
  pairName: string | null;
}

export interface BellsResponse {
  ok: boolean;
  bells: Bell[];
  source: string;
  fallback: boolean;
  stale: boolean;
  error?: string;
}

export interface ClassesResponse {
  ok: boolean;
  classes: string[];
  count: number;
  stale: boolean;
  error?: string;
}

export interface ScheduleLesson {
  weekday: number;
  begin: string;
  end: string;
  lesson: string;
  type: number | null;
  typeName: string | null;
  classroom: string | null;
  teacher: string | null;
  classes: string[];
  date: string | null;
}

export interface ScheduleResponse {
  ok: boolean;
  group: string | null;
  teacher: string | null;
  classroom: string | null;
  days: Record<string, ScheduleLesson[]>;
  totalLessons: number;
  stale: boolean;
  error?: string;
}

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

export interface WeatherResponse {
  ok: boolean;
  current: WeatherCurrent;
  forecast: WeatherForecastDay[];
  source: string;
  stale: boolean;
  error?: string;
}

export interface NewsItem {
  id: string;
  title: string;
  url: string;
  date: string | null;
  rubric: string | null;
}

export interface NewsResponse {
  ok: boolean;
  items: NewsItem[];
  stale: boolean;
  error?: string;
}

export interface DutyEntry {
  id: number;
  date: string;
  dutyType: string;
  className: string | null;
  responsible: string | null;
  timeInterval: string | null;
  notes: string | null;
}

export interface DutyResponse {
  ok: boolean;
  items: DutyEntry[];
  count: number;
  error?: string;
}

export interface NightCounselor {
  id: number;
  date: string;
  dormitory: string;
  counselorName: string;
  phone: string | null;
  floor: string | null;
  notes: string | null;
}

export interface CounselorsResponse {
  ok: boolean;
  items: NightCounselor[];
  count: number;
  error?: string;
}

export interface InfoResponse {
  ok: boolean;
  school: { name: string; address: string; site: string; email: string };
  contacts: Array<{ title: string; phone: string | null; email: string | null; note: string | null }>;
  links: Array<{ title: string; url: string; note: string | null }>;
  adminSchedule: string;
  notes: string[];
}

export interface DocumentResponse {
  ok: boolean;
  markdown: string;
  size: number;
  error?: string;
}

export interface EventDay {
  /** dd.mm.yyyy */
  date: string;
  weekday: string;
  /** Общие события («ЕГЭ/ОГЭ и др.») */
  general: string[];
  /** События по классам */
  byClass: Record<string, string[]>;
}

export interface EventsResponse {
  ok: boolean;
  stale: boolean;
  source: string;
  title: string;
  yearFrom: number;
  yearTo: number;
  classes: string[];
  days: EventDay[];
  count: number;
  eventsTotal: number;
  updatedAt: string;
  error?: string;
}

/** «31.08.2026» → Date (полдень UTC, чтобы избежать краёв таймзон) */
export function parseRuDate(dateStr: string): Date | null {
  const m = dateStr.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!m) return null;
  return new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1]), 12, 0, 0));
}

/** «31.08.2026» → «31 августа» */
export function ruDayMonth(dateStr: string): string {
  const months = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
  const m = dateStr.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!m) return dateStr;
  return `${Number(m[1])} ${months[Number(m[2]) - 1]}`;
}

export interface DayStats {
  date: string;
  kcal: number | null;
  protein: number | null;
  fat: number | null;
  carbs: number | null;
  meals: Array<{ type: string; kcal: number | null }>;
  dishes: number;
  ok: boolean;
  error?: string;
}

export interface MenuStatsResponse {
  ok: boolean;
  days: DayStats[];
  avg: { kcal: number | null; protein: number | null; fat: number | null; carbs: number | null };
  min: { date: string | null; kcal: number | null };
  max: { date: string | null; kcal: number | null };
  mealAverages: Array<{ type: string; kcal: number; share: number }>;
  today: string;
  requestedDays: number;
  stale: boolean;
  error?: string;
}

export const WEEKDAYS = ["Воскресенье", "Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье"];
export const WEEKDAYS_SHORT = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];

/** Текущая дата/время в Новосибирске (UTC+7) */
export function nowNsk(): Date {
  return new Date(Date.now() + 7 * 3600 * 1000);
}

export function fmtRu(date: Date): string {
  return `${String(date.getUTCDate()).padStart(2, "0")}.${String(date.getUTCMonth() + 1).padStart(2, "0")}.${date.getUTCFullYear()}`;
}

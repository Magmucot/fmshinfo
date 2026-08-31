/**
 * Календарь мероприятий СУНЦ НГУ из Google-таблицы (школьный лист «Мероприятия»).
 *
 * Структура листа (gid=718067972):
 *   строка-заголовок: «дата | день недели | ЕГЭ/ОГЭ и др. | 8-1 | 9-1 | … | 11-12 | дата | день недели»
 *   далее блоки календаря текущего учебного года (28.08 → 31.12, затем 01.01 → 31.12),
 *   ниже — заголовок «Мероприятия <прошлый год>…» и пустые архивные шаблоны (игнорируем).
 * Год определяется переходом: декабрь → январь инкрементирует год.
 */

import { fetchWithTimeout } from "./sources";

export const EVENTS_SHEET_ID = "1t8CeC4UvOJrNgXI48fKju1q4iEXJ7bAF";
export const EVENTS_GID = "718067972";
/** CSV-экспорт листа (публичный доступ) */
export const EVENTS_CSV_URL = `https://docs.google.com/spreadsheets/d/${EVENTS_SHEET_ID}/export?format=csv&gid=${EVENTS_GID}`;
/** Ссылка для просмотра в браузере */
export const EVENTS_VIEW_URL = `https://docs.google.com/spreadsheets/d/${EVENTS_SHEET_ID}/edit?gid=${EVENTS_GID}#gid=${EVENTS_GID}`;

export interface EventDay {
  /** dd.mm.yyyy */
  date: string;
  /** «Пн» … «Вс» (вычисляется из даты) */
  weekday: string;
  /** Общие события (колонка «ЕГЭ/ОГЭ и др.») */
  general: string[];
  /** События по классам: { "10-1": ["Презентация спецкурсов …"] } */
  byClass: Record<string, string[]>;
}

export interface EventsData {
  source: string;
  title: string;
  yearFrom: number;
  yearTo: number;
  classes: string[];
  /** Только дни с событиями, по возрастанию даты */
  days: EventDay[];
  eventsTotal: number;
  updatedAt: string;
}

/** RFC-4180 CSV: поля в кавычках, разделитель «,», внутри кавычек могут быть «,» и «;» */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (ch === "\r") {
      // пропускаем (CRLF)
    } else {
      field += ch;
    }
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const MONTHS_RU: Record<string, number> = {
  января: 1, февраля: 2, марта: 3, апреля: 4, мая: 5, июня: 6, июля: 7,
  августа: 8, сентября: 9, октября: 10, ноября: 11, декабря: 12,
};

const WEEKDAYS_SHORT = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];

/** «28 августа» → { day: 28, month: 8 } */
function parseRuDay(cell: string): { day: number; month: number } | null {
  const m = cell.trim().match(/^(\d{1,2})\s+([а-яё]+)$/i);
  if (!m) return null;
  const month = MONTHS_RU[m[2].toLowerCase()];
  if (!month) return null;
  const day = Number(m[1]);
  if (day < 1 || day > 31) return null;
  return { day, month };
}

/** Ячейку с событиями разбиваем на список: «a; b» → [a, b] */
function splitEvents(cell: string): string[] {
  return cell
    .split(";")
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter((s) => s.length > 1);
}

const TITLE_RE = /^Мероприятия\s+(\d{4})[-–](\d{4})/;

/**
 * Загрузка и разбор листа мероприятий.
 * Бросает ошибку, если лист недоступен (роут отдаст 502).
 */
export async function getEvents(): Promise<EventsData> {
  const response = await fetchWithTimeout(EVENTS_CSV_URL, { timeoutMs: 15000 });
  if (!response.ok) {
    throw new Error(`Google Sheets вернул HTTP ${response.status}`);
  }
  const csv = await response.text();
  const rows = parseCsv(csv);

  // Заголовочная строка: col0 = «дата», далее классы до второго «дата»
  const headerIdx = rows.findIndex((r) => (r[0] ?? "").trim().toLowerCase() === "дата");
  if (headerIdx === -1) throw new Error("Не найдена строка заголовка в таблице мероприятий");

  const header = rows[headerIdx];
  const classes: string[] = [];
  for (let j = 3; j < header.length; j++) {
    const name = (header[j] ?? "").trim();
    if (!name || name.toLowerCase() === "дата" || name.toLowerCase() === "день недели") break;
    classes.push(name);
  }
  if (classes.length < 5) throw new Error("Не найдены колонки классов в таблице мероприятий");

  // Первый заголовок блока: «Мероприятия 2026-2027 учебного года»
  let title = "";
  let yearFrom = new Date().getUTCFullYear();
  let yearTo = yearFrom + 1;
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const t = (rows[i][0] ?? "").trim();
    const m = t.match(TITLE_RE);
    if (m) {
      title = t;
      yearFrom = Number(m[1]);
      yearTo = Number(m[2]);
      break;
    }
  }
  if (!title) title = `Мероприятия ${yearFrom}-${yearTo} учебного года`;

  // Обход строк: до СЛЕДУЮЩЕГО заголовка «Мероприятия …» (архивные блоки ниже — пустые)
  const days: EventDay[] = [];
  let year = yearFrom;
  let prevMonth = 0;
  let eventsTotal = 0;
  let seenTitle = false;

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const cells = rows[i];
    const c0 = (cells[0] ?? "").trim();

    if (TITLE_RE.test(c0)) {
      if (seenTitle) break; // второй заголовок = конец текущего учебного года
      seenTitle = true;
      continue;
    }

    const dm = parseRuDay(c0);
    if (!dm) continue;

    // Переход декабрь → январь: инкремент года (блоки листа идут подряд)
    if (prevMonth === 12 && dm.month === 1) year += 1;
    // Защита от дублей дат вне учебного года
    if (year > yearTo) continue;
    prevMonth = dm.month;

    const dateObj = new Date(Date.UTC(year, dm.month - 1, dm.day));
    const date = `${String(dm.day).padStart(2, "0")}.${String(dm.month).padStart(2, "0")}.${year}`;
    const weekday = WEEKDAYS_SHORT[dateObj.getUTCDay()];

    const general = splitEvents(cells[2] ?? "");
    const byClass: Record<string, string[]> = {};
    for (let j = 0; j < classes.length; j++) {
      const events = splitEvents(cells[3 + j] ?? "");
      if (events.length) byClass[classes[j]] = events;
    }

    if (general.length || Object.keys(byClass).length) {
      days.push({ date, weekday, general, byClass });
      eventsTotal += general.length + Object.values(byClass).reduce((s, a) => s + a.length, 0);
    }
  }

  days.sort((a, b) => a.date.split(".").reverse().join().localeCompare(b.date.split(".").reverse().join()));

  if (!days.length) throw new Error("В таблице мероприятий не найдено ни одного события");

  return {
    source: EVENTS_VIEW_URL,
    title,
    yearFrom,
    yearTo,
    classes,
    days,
    eventsTotal,
    updatedAt: new Date().toISOString(),
  };
}

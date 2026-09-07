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

export type EventCategory = "lecture" | "speckurs" | "seminar" | "exam" | "duty" | "general";

export interface EventItem {
  id: string;
  text: string;
  category: EventCategory;
  categoryName: string;
  targetClasses: string[];
  isGeneral: boolean;
}

export interface EventDay {
  /** dd.mm.yyyy */
  date: string;
  /** «Пн» … «Вс» (вычисляется из даты) */
  weekday: string;
  /** Общие события (колонка «ЕГЭ/ОГЭ и др.» и общешкольные мероприятия) */
  general: string[];
  /** События по классам: { "10-1": ["..."] } */
  byClass: Record<string, string[]>;
  /** Структурированный список событий дня с типами (лекция, спецкурс, семинар...) */
  items?: EventItem[];
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

/** Классификация типа мероприятия: лекция, спецкурс, семинар, экзамен, дежурство или общее */
export function classifyEvent(text: string): { category: EventCategory; categoryName: string } {
  const norm = text.toLowerCase();
  if (norm.includes("лекци") || norm.includes("лек.")) {
    return { category: "lecture", categoryName: "Лекция" };
  }
  if (
    norm.includes("спецкурс") ||
    norm.includes("спекурсов") ||
    norm.includes("спец.") ||
    norm.includes("факульт") ||
    norm.includes("электив")
  ) {
    return { category: "speckurs", categoryName: "Спецкурс" };
  }
  if (
    norm.includes("семинар") ||
    norm.includes("конс.") ||
    norm.includes("конс ") ||
    norm.includes("консультаци") ||
    norm.includes("коллокв") ||
    norm.includes("п.к.") ||
    norm.includes("пк ") ||
    norm.includes("к.р.") ||
    norm.includes("кр ") ||
    norm.includes("зачет") ||
    norm.includes("зачёт")
  ) {
    return { category: "seminar", categoryName: "Семинар / Консультация" };
  }
  if (
    norm.includes("егэ") ||
    norm.includes("огэ") ||
    norm.includes("всош") ||
    norm.includes("олимпиад") ||
    norm.includes("пересдач") ||
    norm.includes("экзамен") ||
    norm.includes("комисси") ||
    norm.includes("сочинени") ||
    norm.includes("интенсив")
  ) {
    return { category: "exam", categoryName: "Экзамен / Пересдача" };
  }
  if (norm.includes("уборка") || norm.includes("дежурств") || norm.includes("субботник")) {
    return { category: "duty", categoryName: "Уборка / Дежурство" };
  }
  return { category: "general", categoryName: "Мероприятие" };
}

/**
 * Определение целевых классов для мероприятия:
 * 1. Ищет явное перечисление классов в скобках или тексте: (11-1, 11-2, 11-3), 11-8, 11-5,6, 9-1,2,3
 * 2. Распознаёт общешкольные мероприятия (каникулы, день самоуправления, линейка, уборка, презентация спецкурсов...)
 * 3. Распознаёт параллели (ОГЭ → 9 классы, ЕГЭ/КЕГЭ → 11 классы, 10 классы)
 * 4. Если в ячейке класса — связывает с указанным классом
 */
export function resolveTargetClasses(
  text: string,
  colClass: string | null,
  allSchoolClasses: string[]
): { isGeneral: boolean; targetClasses: string[] } {
  // Очищаем время HH:MM и номера аудиторий X.Y, чтобы не путать с классами
  const textClean = text
    .replace(/\b\d{1,2}:\d{2}\b/g, " ")
    .replace(/\b\d\.\d{1,2}\b/g, " ");

  const explicitClasses = new Set<string>();

  // 1. Поиск полных названий классов: 11-1, 10-3, 9-2
  const fullMatches = textClean.matchAll(/\b(8|9|10|11)-(1[0-2]|[1-9])\b/g);
  for (const m of fullMatches) {
    const cls = `${m[1]}-${m[2]}`;
    if (allSchoolClasses.includes(cls)) {
      explicitClasses.add(cls);
    }
  }

  // Поиск сокращённых записей вида 11-5,6 или 9-1,2,3 или 11-1,2,3
  const shortMatches = textClean.matchAll(/\b(8|9|10|11)-([1-9]|1[0-2])(?:\s*,\s*([1-9]|1[0-2]))+\b/g);
  for (const m of shortMatches) {
    const prefix = m[1];
    const subnums = m[0].match(/\b\d{1,2}\b/g) ?? [];
    for (const num of subnums) {
      if (num !== prefix) {
        const cls = `${prefix}-${num}`;
        if (allSchoolClasses.includes(cls)) {
          explicitClasses.add(cls);
        }
      }
    }
  }

  if (explicitClasses.size > 0) {
    return {
      isGeneral: false,
      targetClasses: Array.from(explicitClasses).sort((a, b) => a.localeCompare(b)),
    };
  }

  const norm = text.toLowerCase();

  // 2. Общешкольные ключевые слова
  const generalKeywords = [
    "каникулы",
    "день самоуправления",
    "посвящение в фмшата",
    "генеральная уборка",
    "расписание сессии",
    "линейка",
    "день знаний",
    "актовый зал",
    "досуговый центр",
    "дц",
    "научнопопулярная лекция",
    "отбор на спецкурс",
    "презентация спецкурсов",
    "представление спецкурсов",
  ];
  for (const kw of generalKeywords) {
    if (norm.includes(kw)) {
      return { isGeneral: true, targetClasses: [] };
    }
  }

  // 3. Параллели
  if (norm.includes("огэ") && !norm.includes("егэ")) {
    return {
      isGeneral: false,
      targetClasses: allSchoolClasses.filter((c) => c.startsWith("9-")),
    };
  }
  if (norm.includes("егэ") || norm.includes("кегэ")) {
    return {
      isGeneral: false,
      targetClasses: allSchoolClasses.filter((c) => c.startsWith("11-")),
    };
  }
  if (norm.includes("10 класс") || norm.includes("10-е класс") || norm.includes("10-х класс")) {
    return {
      isGeneral: false,
      targetClasses: allSchoolClasses.filter((c) => c.startsWith("10-")),
    };
  }
  if (norm.includes("9 класс") || norm.includes("9-е класс") || norm.includes("9-х класс")) {
    return {
      isGeneral: false,
      targetClasses: allSchoolClasses.filter((c) => c.startsWith("9-")),
    };
  }
  if (norm.includes("8 класс") || norm.includes("8-е класс")) {
    return {
      isGeneral: false,
      targetClasses: allSchoolClasses.filter((c) => c.startsWith("8-")),
    };
  }

  // 4. Колонка конкретного класса
  if (colClass && allSchoolClasses.includes(colClass)) {
    return { isGeneral: false, targetClasses: [colClass] };
  }

  return { isGeneral: true, targetClasses: [] };
}

/**
 * Загрузка и разбор листа мероприятий с точным распределением по классам и категоризацией.
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

    // Переход декабрь → январь: инкремент года
    if (prevMonth === 12 && dm.month === 1) year += 1;
    if (year > yearTo) continue;
    prevMonth = dm.month;

    const dateObj = new Date(Date.UTC(year, dm.month - 1, dm.day));
    const date = `${String(dm.day).padStart(2, "0")}.${String(dm.month).padStart(2, "0")}.${year}`;
    const weekday = WEEKDAYS_SHORT[dateObj.getUTCDay()];

    const items: EventItem[] = [];
    const generalSet = new Set<string>();
    const byClassMap: Record<string, Set<string>> = {};

    for (const c of classes) {
      byClassMap[c] = new Set<string>();
    }

    // 1. Колонка «ЕГЭ/ОГЭ и др.» (колонка 2)
    const rawGeneral = splitEvents(cells[2] ?? "");
    for (const text of rawGeneral) {
      const classification = classifyEvent(text);
      const target = resolveTargetClasses(text, null, classes);
      const item: EventItem = {
        id: `${date}-gen-${items.length}`,
        text,
        category: classification.category,
        categoryName: classification.categoryName,
        targetClasses: target.targetClasses,
        isGeneral: target.isGeneral,
      };
      items.push(item);

      if (target.isGeneral || target.targetClasses.length === 0) {
        generalSet.add(text);
      } else {
        for (const cls of target.targetClasses) {
          byClassMap[cls]?.add(text);
        }
      }
    }

    // 2. Колонки классов (колонки 3+)
    for (let j = 0; j < classes.length; j++) {
      const colClass = classes[j];
      const rawClassEvents = splitEvents(cells[3 + j] ?? "");
      for (const text of rawClassEvents) {
        const classification = classifyEvent(text);
        const target = resolveTargetClasses(text, colClass, classes);
        const item: EventItem = {
          id: `${date}-${colClass}-${items.length}`,
          text,
          category: classification.category,
          categoryName: classification.categoryName,
          targetClasses: target.targetClasses.length > 0 ? target.targetClasses : [colClass],
          isGeneral: target.isGeneral,
        };
        items.push(item);

        if (target.isGeneral) {
          generalSet.add(text);
        } else if (target.targetClasses.length > 0) {
          for (const cls of target.targetClasses) {
            byClassMap[cls]?.add(text);
          }
        } else {
          byClassMap[colClass]?.add(text);
        }
      }
    }

    const general = Array.from(generalSet);
    const byClass: Record<string, string[]> = {};
    for (const [c, set] of Object.entries(byClassMap)) {
      if (set.size > 0) {
        byClass[c] = Array.from(set);
      }
    }

    if (general.length || Object.keys(byClass).length || items.length) {
      days.push({
        date,
        weekday,
        general,
        byClass,
        items,
      });
      eventsTotal += items.length;
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

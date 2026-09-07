/**
 * Клиент сервиса «ФМШ Расписание занятий» — table-sesc.nsu.ru (раздел 3.3 документа).
 *
 * Эндпоинты (без авторизации):
 *   GET /api/bell           — звонки
 *   GET /api/school-class   — список классов (8-1 … 11-7)
 *   GET /api/schedule/find?group=10-1&teacher=&classroom= — расписание
 *
 * Ключи расписания «<weekday>-<HH:MM>», weekday: 1=Пн … 6=Сб.
 */

import { STATIC_BELLS, TABLE_SESC_BASE, fetchWithTimeout } from "./sources";

export interface Bell {
  begin: string;
  end: string;
  pair: number | null;
  pairName: string | null;
}

export interface BellsData {
  bells: Bell[];
  source: string;
  fallback: boolean;
}

export interface ClassesData {
  classes: string[];
  count: number;
}

export interface ScheduleLesson {
  weekday: number;
  begin: string;
  end: string;
  lesson: string;
  type: number | null;
  typeName: string | null;
  category?: "lecture" | "seminar" | "lab" | "speckurs" | "elective" | "lesson";
  classroom: string | null;
  teacher: string | null;
  classes: string[];
  subgroup?: string | null;
  rawSubgroup?: string | null;
  pair?: number | null;
  pairName?: string | null;
  date: string | null;
}

export function formatSubgroup(subgroup: string | null | undefined): string | null {
  if (!subgroup) return null;
  const num = subgroup.replace(/\D/g, "");
  return num ? `${num}-я подгруппа` : subgroup;
}

export interface ScheduleData {
  group: string | null;
  teacher: string | null;
  classroom: string | null;
  days: Record<string, ScheduleLesson[]>;
  totalLessons: number;
}

export const PAIR_BY_BEGIN: Record<string, number> = {
  "08:30": 1, "09:25": 1,
  "10:20": 2, "11:15": 2,
  "12:30": 3, "13:25": 3,
  "15:00": 0,
  "16:00": 4, "16:50": 4,
  "18:00": 5, "18:50": 5,
  "20:30": 6, "21:20": 6,
};

export const PAIR_NAMES: Record<number, string> = {
  0: "Факультатив",
  1: "1-я пара",
  2: "2-я пара",
  3: "3-я пара",
  4: "Спецкурс / Доп. занятие",
  5: "Вечерний спецкурс",
  6: "Самоподготовка",
};

export const LESSON_TYPE_NAMES: Record<number, string> = {
  1: "Лекция",
  2: "Семинар",
  3: "Лабораторная",
};

export function classifyLesson(
  name: string,
  type: number | null
): {
  type: number | null;
  typeName: string;
  category: "lecture" | "seminar" | "lab" | "speckurs" | "elective" | "lesson";
} {
  const norm = (name ?? "").toLowerCase().trim();
  if (norm.includes("спецкурс") || norm.startsWith("ск ") || norm.includes("спец.")) {
    return { type, typeName: "Спецкурс", category: "speckurs" };
  }
  if (norm.includes("факультатив")) {
    return { type, typeName: "Факультатив", category: "elective" };
  }
  if (norm.includes("лабораторн")) {
    return { type: type ?? 3, typeName: "Лабораторная", category: "lab" };
  }
  if (type === 1) {
    return { type, typeName: "Лекция", category: "lecture" };
  }
  if (type === 2) {
    return { type, typeName: "Семинар", category: "seminar" };
  }
  if (type === 3) {
    return { type, typeName: "Лабораторная", category: "lab" };
  }
  return { type, typeName: "Занятие", category: "lesson" };
}

async function getJson(url: string, params?: Record<string, string>): Promise<unknown> {
  const search = params ? "?" + new URLSearchParams(params).toString() : "";
  const response = await fetchWithTimeout(url + search, {
    timeoutMs: 15000,
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error(`Сервис расписания вернул HTTP ${response.status}`);
  return response.json();
}

/** Звонки: API + статический список (объединение, раздел 3.2) */
export async function getBells(): Promise<BellsData> {
  const bells: Bell[] = [];
  const sourceParts: string[] = [];
  let fallback = false;

  try {
    const data = (await getJson(`${TABLE_SESC_BASE}/api/bell`)) as {
      payload?: { bells?: Array<{ begin?: string; end?: string }> };
    };
    for (const item of data.payload?.bells ?? []) {
      if (item.begin && item.end) {
        bells.push({ begin: item.begin, end: item.end, pair: null, pairName: null });
      }
    }
    sourceParts.push("table-sesc.nsu.ru/api/bell");
  } catch {
    fallback = true;
  }

  // объединение со статикой (в API нет 21:20–22:00; в статике нет 15:00–16:00)
  const present = new Set(bells.map((b) => `${b.begin}-${b.end}`));
  for (const staticBell of STATIC_BELLS) {
    if (!present.has(`${staticBell.begin}-${staticBell.end}`)) {
      bells.push({ ...staticBell });
      if (!fallback) sourceParts.push("академический календарь");
      else sourceParts.push("статический список");
    }
  }

  if (bells.length === 0) throw new Error("Расписание звонков недоступно");

  bells.sort((a, b) => a.begin.localeCompare(b.begin));
  return {
    bells: bells.map((b) => ({
      ...b,
      pair: b.pair ?? PAIR_BY_BEGIN[b.begin] ?? null,
      pairName: b.pairName ?? PAIR_NAMES[PAIR_BY_BEGIN[b.begin] ?? -1] ?? null,
    })),
    source: [...new Set(sourceParts)].join(" + "),
    fallback,
  };
}

function classSortKey(name: string): [number, number] {
  const m = name.match(/^(\d+)(?:-(\d+))?$/);
  if (!m) return [99, 99];
  return [Number(m[1]), Number(m[2] ?? 0)];
}

/** Список классов */
export async function getClasses(): Promise<ClassesData> {
  const data = (await getJson(`${TABLE_SESC_BASE}/api/school-class`)) as {
    payload?: { groups?: Array<{ name?: string }> };
  };
  const names = [...new Set((data.payload?.groups ?? []).map((g) => g.name).filter(Boolean))] as string[];
  if (names.length === 0) throw new Error("Сервис расписания вернул пустой список классов");
  names.sort((a, b) => {
    const ka = classSortKey(a);
    const kb = classSortKey(b);
    return ka[0] - kb[0] || ka[1] - kb[1] || a.localeCompare(b);
  });
  return { classes: names, count: names.length };
}

/** Расписание занятий: один фильтр — group | teacher | classroom */
export async function getSchedule(filter: {
  group?: string;
  teacher?: string;
  classroom?: string;
}): Promise<ScheduleData> {
  const params = {
    group: filter.group ?? "",
    teacher: filter.teacher ?? "",
    classroom: filter.classroom ? filter.classroom.replace(/\./g, "_") : "",
  };
  const data = (await getJson(`${TABLE_SESC_BASE}/api/schedule/find`, params)) as {
    payload?: {
      schedule?: Record<
        string,
        Array<{
          weekday?: number;
          time?: { begin?: string; end?: string };
          lesson?: { name?: string; type?: number };
          classroom?: { name?: string } | null;
          teacher?: { name?: string } | null;
          schoolClasses?: Array<{ name?: string; subgroup?: string | null }>;
          date?: string | null;
        }>
      >;
    };
  };

  const schedule = data.payload?.schedule ?? {};
  const days: Record<string, ScheduleLesson[]> = {};
  for (let wd = 1; wd <= 6; wd++) days[String(wd)] = [];

  for (const [key, lessons] of Object.entries(schedule)) {
    const [weekdayStr] = key.split("-");
    const weekday = Number(weekdayStr);
    if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7) continue;
    for (const lesson of lessons) {
      const classified = classifyLesson(lesson.lesson?.name ?? "", lesson.lesson?.type ?? null);
      
      let rawSubgroup: string | null = null;
      if (filter.group) {
        const match = (lesson.schoolClasses ?? []).find(
          (c) => c.name?.toLowerCase() === filter.group?.toLowerCase()
        );
        rawSubgroup = match?.subgroup ?? null;
      } else {
        rawSubgroup = (lesson.schoolClasses ?? []).find((c) => c.subgroup)?.subgroup ?? null;
      }

      const begin = lesson.time?.begin ?? "";
      const pair = PAIR_BY_BEGIN[begin] ?? null;
      const pairName = pair !== null ? PAIR_NAMES[pair] ?? null : null;

      days[String(weekday)]?.push({
        weekday,
        begin,
        end: lesson.time?.end ?? "",
        lesson: lesson.lesson?.name ?? "—",
        type: classified.type,
        typeName: classified.typeName,
        category: classified.category,
        classroom: lesson.classroom?.name ? lesson.classroom.name.replace(/_/g, ".") : null,
        teacher: lesson.teacher?.name ?? null,
        classes: (lesson.schoolClasses ?? []).map((c) => c.name ?? "").filter(Boolean),
        subgroup: formatSubgroup(rawSubgroup),
        rawSubgroup,
        pair,
        pairName,
        date: lesson.date ?? null,
      });
    }
  }

  for (const wd of Object.keys(days)) {
    days[wd].sort((a, b) => a.begin.localeCompare(b.begin));
  }

  const total = Object.values(days).reduce((sum, arr) => sum + arr.length, 0);
  return {
    group: filter.group ?? null,
    teacher: filter.teacher ?? null,
    classroom: filter.classroom ? filter.classroom.replace(/_/g, ".") : null,
    days,
    totalLessons: total,
  };
}

function LESSON_TYPESafe(type: number): string {
  return LESSON_TYPE_NAMES[type] ?? "Занятие";
}

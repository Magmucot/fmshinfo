/**
 * Агрегированная статистика питания за несколько дней (раздел 3.1 документа).
 *
 * Берёт каталог меню, выбирает последние N дат, параллельно
 * собирает меню каждой даты через общий кэш (ключи совпадают с /api/menu)
 * и возвращает итоги по дням + средние значения + распределение по приёмам пищи.
 */

import { cached, TTL } from "./cache";
import { fetchCatalog, getMenu, parseDateRu, todayNsk } from "./menu";

export interface DayStats {
  date: string;
  kcal: number | null;
  protein: number | null;
  fat: number | null;
  carbs: number | null;
  /** ккал по типам приёмов пищи: {"Завтрак": 560, ...} */
  meals: Array<{ type: string; kcal: number | null }>;
  dishes: number;
  ok: boolean;
  error?: string;
}

export interface MenuStatsData {
  days: DayStats[];
  avg: { kcal: number | null; protein: number | null; fat: number | null; carbs: number | null };
  min: { date: string | null; kcal: number | null };
  max: { date: string | null; kcal: number | null };
  mealAverages: Array<{ type: string; kcal: number; share: number }>;
  today: string;
  requestedDays: number;
}

const clampDays = (value: number, fallback: number) =>
  Number.isFinite(value) && value >= 2 && value <= 16 ? Math.round(value) : fallback;

export async function getMenuStats(daysRaw?: string): Promise<MenuStatsData> {
  const requestedDays = clampDays(Number(daysRaw), 10);

  const catalog = await fetchCatalog();
  const today = todayNsk();
  const sortedDates = Object.keys(catalog).sort(
    (a, b) => parseDateRu(a).getTime() - parseDateRu(b).getTime()
  );

  // Последние N дат каталога; сегодня — последняя доступная ≤ сегодня, если есть
  const dates = sortedDates.slice(-requestedDays);

  const results = await Promise.allSettled(
    dates.map(async (date) => {
      const { data } = await cached(`menu:${date}`, TTL.menu, () => getMenu(date));
      return { date, data };
    })
  );

  const days: DayStats[] = results.map((r, i) => {
    const date = dates[i];
    if (r.status === "fulfilled") {
      const { data } = r.value;
      return {
        date,
        kcal: data.dayTotals?.kcal ?? null,
        protein: data.dayTotals?.protein ?? null,
        fat: data.dayTotals?.fat ?? null,
        carbs: data.dayTotals?.carbs ?? null,
        meals: (data.meals ?? []).map((m) => ({ type: m.type, kcal: m.totals?.kcal ?? null })),
        dishes: (data.meals ?? []).reduce((acc, m) => acc + (m.dishes?.length ?? 0), 0),
        ok: true,
      };
    }
    return {
      date,
      kcal: null,
      protein: null,
      fat: null,
      carbs: null,
      meals: [],
      dishes: 0,
      ok: false,
      error: (r.reason as Error)?.message ?? "не удалось получить меню",
    };
  });

  const valid = days.filter((d) => d.ok && typeof d.kcal === "number" && d.kcal > 0);
  const avgOf = (key: "kcal" | "protein" | "fat" | "carbs"): number | null => {
    if (!valid.length) return null;
    const sum = valid.reduce((acc, d) => acc + (d[key] ?? 0), 0);
    return Math.round(sum / valid.length);
  };

  let min: MenuStatsData["min"] = { date: null, kcal: null };
  let max: MenuStatsData["max"] = { date: null, kcal: null };
  for (const d of valid) {
    if (typeof d.kcal === "number") {
      if (min.kcal === null || d.kcal < min.kcal) min = { date: d.date, kcal: d.kcal };
      if (max.kcal === null || d.kcal > max.kcal) max = { date: d.date, kcal: d.kcal };
    }
  }

  // Средние ккал по типам приёмов пищи + доля от дневной нормы
  const mealTotals = new Map<string, { sum: number; count: number }>();
  for (const d of valid) {
    for (const m of d.meals) {
      if (typeof m.kcal === "number" && m.kcal > 0) {
        const t = mealTotals.get(m.type) ?? { sum: 0, count: 0 };
        t.sum += m.kcal;
        t.count += 1;
        mealTotals.set(m.type, t);
      }
    }
  }
  const avgKcal = avgOf("kcal") ?? 0;
  const mealAverages = [...mealTotals.entries()]
    .map(([type, t]) => ({
      type,
      kcal: Math.round(t.sum / t.count),
      share: avgKcal > 0 ? Math.round((t.sum / t.count / avgKcal) * 100) : 0,
    }))
    .sort((a, b) => b.kcal - a.kcal);

  return {
    days,
    avg: { kcal: avgOf("kcal"), protein: avgOf("protein"), fat: avgOf("fat"), carbs: avgOf("carbs") },
    min,
    max,
    mealAverages,
    today,
    requestedDays,
  };
}

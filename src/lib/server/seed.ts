/**
 * Демо-данные дежурств и ночных вожатых.
 *
 * График дежурств и ночные вожатые онлайн НЕ публикуются (разделы 3.4–3.5
 * документа) — в реальной эксплуатации их вносит администратор через
 * POST /api/duty и POST /api/counselors. Здесь — примерные данные,
 * чтобы интерфейс не выглядел пустым при первом запуске.
 */

import { db } from "@/lib/db";

const DUTY_ROTATION: Array<{ className: string; interval: string; responsible: string }> = [
  { className: "10-1", interval: "после 2-й пары (полдник)", responsible: "Смирнова О. В." },
  { className: "10-2", interval: "после 3-й пары (обед)", responsible: "Ковалёв А. И." },
  { className: "10-3", interval: "после 5-й пары (ужин)", responsible: "Смирнова О. В." },
  { className: "9-1", interval: "после 2-й пары (полдник)", responsible: "Титова Н. С." },
  { className: "9-2", interval: "после 3-й пары (обед)", responsible: "Ковалёв А. И." },
  { className: "11-1", interval: "после 5-й пары (ужин)", responsible: "Гусев П. Е." },
  { className: "11-3", interval: "после 2-й пары (полдник)", responsible: "Титова Н. С." },
];

const NIGHT_ROTATION: Array<{ dormitory: string; name: string; floor: string }> = [
  { dormitory: "Общежитие №1", name: "Смирнова Ольга Викторовна", floor: "2–3 этажи" },
  { dormitory: "Общежитие №2", name: "Ковалёв Артём Игоревич", floor: "3–4 этажи" },
];

function fmt(date: Date): string {
  return `${String(date.getDate()).padStart(2, "0")}.${String(date.getMonth() + 1).padStart(2, "0")}.${date.getFullYear()}`;
}

let seedPromise: Promise<void> | null = null;

/** Однократный идемпотентный сид (при пустых таблицах) */
export async function ensureSeedData(): Promise<void> {
  if (!seedPromise) {
    seedPromise = (async () => {
      const dutyCount = await db.dutyEntry.count();
      const nightCount = await db.nightCounselor.count();
      if (dutyCount > 0 || nightCount > 0) return;

      const today = new Date();
      const dutyRows: Array<{
        date: string;
        dutyType: string;
        className: string;
        responsible: string;
        timeInterval: string;
        notes: string;
      }> = [];
      const nightRows: Array<{
        date: string;
        dormitory: string;
        counselorName: string;
        phone: string;
        floor: string;
        notes: string;
      }> = [];

      for (let offset = 0; offset < 14; offset++) {
        const day = new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset);
        const weekday = day.getDay(); // 0=Вс

        // Ночные вожатые — ежедневно в обоих общежитиях (включая воскресенье)
        for (const night of NIGHT_ROTATION) {
          nightRows.push({
            date: fmt(day),
            dormitory: night.dormitory,
            counselorName: night.name,
            phone: "+7 (383) 373-96-41",
            floor: night.floor,
            notes: "Круглосуточное дежурство с обходами (демо-запись)",
          });
        }

        // Дежурства классов — только в учебные дни
        if (weekday === 0) continue;

        const rotation = DUTY_ROTATION[(weekday + offset) % DUTY_ROTATION.length];
        dutyRows.push({
          date: fmt(day),
          dutyType: "столовая",
          className: rotation.className,
          responsible: rotation.responsible,
          timeInterval: rotation.interval,
          notes: "Демо-запись: замените реальными данными через панель администратора",
        });

        if (weekday === 3) {
          dutyRows.push({
            date: fmt(day),
            dutyType: "корпус",
            className: "10-5",
            responsible: "Гусев П. Е.",
            timeInterval: "вечер, после 5-й пары",
            notes: "Дежурство по учебному корпусу (демо-запись)",
          });
        }
      }

      if (dutyRows.length) await db.dutyEntry.createMany({ data: dutyRows });
      if (nightRows.length) await db.nightCounselor.createMany({ data: nightRows });
    })().catch((error) => {
      seedPromise = null;
      throw error;
    });
  }
  return seedPromise;
}

import { NextResponse } from "next/server";
import {
  CANTEEN_SHIFTS,
  WEEKDAY_MEALS,
  WEEKEND_MEALS,
  CANTEEN_FOOTNOTE,
  getMealsForClass,
  getCurrentMealState,
  getShiftForClass,
} from "@/lib/server/canteenSchedule";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const className = searchParams.get("class");
    const isWeekendParam = searchParams.get("weekend");
    const isWeekend = isWeekendParam !== null ? isWeekendParam === "true" || isWeekendParam === "1" : undefined;

    const currentStatus = getCurrentMealState();

    if (className) {
      const classSchedule = getMealsForClass(className, isWeekend ?? currentStatus.isWeekend);
      return NextResponse.json({
        ok: true,
        shifts: CANTEEN_SHIFTS,
        selectedClass: className,
        classSchedule,
        currentStatus,
        source: "График работы столовой со 2 сентября (rasp.jpg)",
      });
    }

    return NextResponse.json({
      ok: true,
      shifts: CANTEEN_SHIFTS,
      weekdayMeals: WEEKDAY_MEALS,
      weekendMeals: WEEKEND_MEALS,
      footnote: CANTEEN_FOOTNOTE,
      currentStatus,
      source: "График работы столовой со 2 сентября (rasp.jpg)",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Ошибка загрузки расписания столовой";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { cached } from "@/lib/server/cache";
import { getEvents } from "@/lib/server/events";

export const dynamic = "force-dynamic";

/**
 * GET /api/events — календарь мероприятий из Google-таблицы школы.
 * query: без параметров — все дни с событиями (frontend фильтрует сам).
 */
export async function GET() {
  try {
    const { data, stale } = await cached("events", 30 * 60 * 1000, getEvents);
    return NextResponse.json({
      ok: true,
      stale,
      source: data.source,
      title: data.title,
      yearFrom: data.yearFrom,
      yearTo: data.yearTo,
      classes: data.classes,
      days: data.days,
      count: data.days.length,
      eventsTotal: data.eventsTotal,
      updatedAt: data.updatedAt,
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: (error as Error).message }, { status: 502 });
  }
}

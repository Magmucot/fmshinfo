import { NextRequest, NextResponse } from "next/server";
import { cached, TTL } from "@/lib/server/cache";
import { getSchedule } from "@/lib/server/tableSesc";

export const dynamic = "force-dynamic";

/** GET /api/schedule?group=10-1 | ?teacher=… | ?classroom=… — расписание занятий */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const group = params.get("group") ?? undefined;
  const teacher = params.get("teacher") ?? undefined;
  const classroom = params.get("classroom") ?? undefined;

  if (!group && !teacher && !classroom) {
    return NextResponse.json(
      { ok: false, error: "Укажите параметр group, teacher или classroom" },
      { status: 400 }
    );
  }

  try {
    const { data, stale } = await cached(
      `schedule:${group ?? ""}|${teacher ?? ""}|${classroom ?? ""}`,
      TTL.schedule,
      () => getSchedule({ group, teacher, classroom })
    );
    return NextResponse.json({ ok: true, ...data, stale });
  } catch (error) {
    return NextResponse.json({ ok: false, error: (error as Error).message }, { status: 502 });
  }
}

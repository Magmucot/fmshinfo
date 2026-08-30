import { NextRequest, NextResponse } from "next/server";
import { cached, TTL } from "@/lib/server/cache";
import { getMenuStats } from "@/lib/server/menuStats";

export const dynamic = "force-dynamic";

/** GET /api/menu/stats?days=10 — агрегированная статистика питания за N дней */
export async function GET(request: NextRequest) {
  const days = request.nextUrl.searchParams.get("days") ?? undefined;
  try {
    // Короткий TTL агрегата: новые даты каталога подхватываются быстрее,
    // сами меню при этом кэшируются отдельно (ключи menu:ДД.ММ.ГГГГ, TTL 1 ч)
    const { data, stale } = await cached(`menuStats:${days ?? "10"}`, TTL.weather, () =>
      getMenuStats(days)
    );
    return NextResponse.json({ ok: true, ...data, stale });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: (error as Error).message },
      { status: 502 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { cached, TTL } from "@/lib/server/cache";
import { getNews } from "@/lib/server/news";

export const dynamic = "force-dynamic";

/** GET /api/news?limit=10 — последние новости sesc.nsu.ru */
export async function GET(request: NextRequest) {
  const limitParam = Number(request.nextUrl.searchParams.get("limit") ?? "12");
  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(1, limitParam), 25) : 12;
  try {
    // Кэшируем полный список один раз (ключ без limit), затем срезаем по limit —
    // иначе каждый новый limit дёргает sesc.nsu.ru заново.
    const { data, stale } = await cached("news:all", TTL.news, () => getNews(25));
    return NextResponse.json({ ok: true, items: data.items.slice(0, limit), stale });
  } catch (error) {
    return NextResponse.json({ ok: false, error: (error as Error).message }, { status: 502 });
  }
}

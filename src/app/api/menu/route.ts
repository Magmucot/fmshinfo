import { NextRequest, NextResponse } from "next/server";
import { cached, TTL } from "@/lib/server/cache";
import { getMenu } from "@/lib/server/menu";

export const dynamic = "force-dynamic";

/** GET /api/menu?date=ДД.ММ.ГГГГ — меню столовой на дату (раздел 3.1 документа) */
export async function GET(request: NextRequest) {
  const date = request.nextUrl.searchParams.get("date") ?? undefined;
  try {
    const { data, stale } = await cached(`menu:${(date ?? "").trim()}`, TTL.menu, () => getMenu(date));
    return NextResponse.json({ ok: true, ...data, stale });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: (error as Error).message, date: date ?? null },
      { status: 502 }
    );
  }
}

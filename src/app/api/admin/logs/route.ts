import { NextRequest, NextResponse } from "next/server";
import { getRecentLogs } from "@/lib/server/logger";
import { isAdminRequest } from "@/lib/server/auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/logs
 * Возвращает последние строки журнала логов для панели администратора.
 * Защищено ADMIN_KEY.
 */
export async function GET(request: NextRequest) {
  try {
    if (!isAdminRequest(request)) {
      return NextResponse.json(
        { ok: false, error: "Доступ запрещён: неверный ключ администратора" },
        { status: 403 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const fileParam = searchParams.get("file") ?? "bot";
    const limit = Math.min(Math.max(Number(searchParams.get("limit") || 100), 10), 500);
    const filterLevel = searchParams.get("level") ?? undefined;

    const fileName =
      fileParam === "portal"
        ? "portal.log"
        : fileParam === "audit"
        ? "audit.log"
        : "bot.log";

    const { lines, totalLines } = getRecentLogs(fileName, limit, filterLevel);

    return NextResponse.json({
      ok: true,
      file: fileName,
      totalLines,
      count: lines.length,
      lines,
    });
  } catch (error) {
    console.error("[api/admin/logs] Ошибка:", error);
    return NextResponse.json({ ok: false, error: (error as Error).message }, { status: 500 });
  }
}

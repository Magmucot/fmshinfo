import { NextRequest, NextResponse } from "next/server";
import { getRecentLogs, portalLogger } from "@/lib/server/logger";
import {
  isAdminRequest,
  getClientIp,
  recordFailedAdminAttempt,
  resetFailedAdminAttempts,
  isIpRateLimited,
} from "@/lib/server/auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/logs
 * Возвращает последние строки журнала логов для панели администратора.
 * Защищено ADMIN_KEY, проверка timing-safe, аудит безопасности и защита от подбора.
 */
export async function GET(request: NextRequest) {
  const ip = getClientIp(request);

  if (isIpRateLimited(ip)) {
    portalLogger.warn("SECURITY", `Blocked rate-limited /api/admin/logs attempt from IP: ${ip}`);
    return NextResponse.json(
      { ok: false, error: "Слишком много неудачных попыток входа. Повторите через минуту." },
      { status: 429 }
    );
  }

  try {
    if (!isAdminRequest(request)) {
      recordFailedAdminAttempt(ip);
      portalLogger.warn(
        "SECURITY",
        `Unauthorized /api/admin/logs access attempt from IP: ${ip} (UA: ${request.headers.get("user-agent") || "unknown"})`
      );
      return NextResponse.json(
        { ok: false, error: "Доступ запрещён: неверный ключ администратора" },
        { status: 403 }
      );
    }

    resetFailedAdminAttempts(ip);

    const searchParams = request.nextUrl.searchParams;
    const fileParam = searchParams.get("file") ?? "bot";
    const limit = Math.min(Math.max(Number(searchParams.get("limit") || 100), 10), 1000);
    const filterLevel = searchParams.get("level") ?? undefined;
    const search = searchParams.get("search") ?? undefined;

    const fileName =
      fileParam === "portal"
        ? "portal.log"
        : fileParam === "audit"
        ? "audit.log"
        : "bot.log";

    const { lines, parsed, totalLines } = getRecentLogs(fileName, limit, filterLevel, search);

    portalLogger.audit(
      "ADMIN_ACCESS",
      `Admin (IP: ${ip}) accessed logs: file=${fileName}, level=${filterLevel || "ALL"}, search=${search || "none"}, count=${lines.length}`
    );

    return NextResponse.json({
      ok: true,
      file: fileName,
      totalLines,
      count: lines.length,
      lines,
      parsed,
    });
  } catch (error) {
    portalLogger.error("ADMIN_API", "GET /api/admin/logs error", error);
    return NextResponse.json({ ok: false, error: (error as Error).message }, { status: 500 });
  }
}

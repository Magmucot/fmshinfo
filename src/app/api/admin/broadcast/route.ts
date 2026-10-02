import { NextRequest, NextResponse } from "next/server";
import {
  isAdminRequest,
  getClientIp,
  recordFailedAdminAttempt,
  resetFailedAdminAttempts,
  isIpRateLimited,
} from "@/lib/server/auth";
import { portalLogger } from "@/lib/server/logger";
import { broadcastPayload } from "@/lib/server/payloads";
import {
  executeBroadcast,
  getBroadcastHistory,
  getBroadcastAudienceStats,
} from "@/lib/server/broadcast";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/broadcast
 * Возвращает историю предыдущих рассылок и актуальную статистику аудитории (всего, по классам, по параллелям).
 * Защищено X-Admin-Key.
 */
export async function GET(request: NextRequest) {
  const ip = getClientIp(request);

  if (isIpRateLimited(ip)) {
    portalLogger.warn("SECURITY", `Blocked rate-limited /api/admin/broadcast attempt from IP: ${ip}`);
    return NextResponse.json(
      { ok: false, error: "Слишком много неудачных попыток входа. Повторите через минуту." },
      { status: 429 }
    );
  }

  if (!isAdminRequest(request)) {
    recordFailedAdminAttempt(ip);
    portalLogger.warn("SECURITY", `Unauthorized GET /api/admin/broadcast attempt from IP: ${ip}`);
    return NextResponse.json(
      { ok: false, error: "Доступ запрещён: неверный ключ администратора" },
      { status: 403 }
    );
  }

  resetFailedAdminAttempts(ip);

  try {
    const limit = Math.min(Math.max(Number(request.nextUrl.searchParams.get("limit") || 50), 1), 200);
    const history = getBroadcastHistory(limit);
    const audience = await getBroadcastAudienceStats();

    return NextResponse.json({
      ok: true,
      timestamp: new Date().toISOString(),
      audience,
      history,
    });
  } catch (error) {
    portalLogger.error("BROADCAST_API", "GET /api/admin/broadcast error", error);
    return NextResponse.json(
      { ok: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/broadcast
 * Отправляет сообщение указанной аудитории (все пользователи, класс или конкретный ID).
 * Защищено X-Admin-Key.
 */
export async function POST(request: NextRequest) {
  const ip = getClientIp(request);

  if (isIpRateLimited(ip)) {
    portalLogger.warn("SECURITY", `Blocked rate-limited POST /api/admin/broadcast attempt from IP: ${ip}`);
    return NextResponse.json(
      { ok: false, error: "Слишком много неудачных попыток входа. Повторите через минуту." },
      { status: 429 }
    );
  }

  if (!isAdminRequest(request)) {
    recordFailedAdminAttempt(ip);
    portalLogger.warn("SECURITY", `Unauthorized POST /api/admin/broadcast attempt from IP: ${ip}`);
    return NextResponse.json(
      { ok: false, error: "Доступ запрещён: неверный ключ администратора" },
      { status: 403 }
    );
  }

  resetFailedAdminAttempts(ip);

  try {
    const body = await request.json().catch(() => null);
    const parsed = broadcastPayload.safeParse(body);

    if (!parsed.success) {
      const issueMsg = parsed.error.issues.map((i) => i.message).join("; ");
      return NextResponse.json(
        { ok: false, error: issueMsg || "Некорректные параметры рассылки" },
        { status: 400 }
      );
    }

    const result = await executeBroadcast(parsed.data);

    portalLogger.audit(
      "ADMIN_BROADCAST",
      `Admin (IP: ${ip}) executed broadcast ${result.broadcastId}: target=${parsed.data.target}, sent=${result.sent}/${result.total}`
    );

    return NextResponse.json({
      ok: true,
      broadcastId: result.broadcastId,
      sent: result.sent,
      failed: result.failed,
      blocked: result.blocked,
      total: result.total,
      status: result.status,
      timestamp: result.timestamp,
    });
  } catch (error) {
    portalLogger.error("BROADCAST_API", "POST /api/admin/broadcast error", error);
    return NextResponse.json(
      { ok: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { feedbackPayload } from "@/lib/server/payloads";
import { db } from "@/lib/db";
import {
  isAdminRequest,
  getClientIp,
  recordFailedAdminAttempt,
  resetFailedAdminAttempts,
  isIpRateLimited,
} from "@/lib/server/auth";
import { portalLogger, formatNskTimestamp } from "@/lib/server/logger";

export const dynamic = "force-dynamic";

/**
 * POST /api/feedback
 * Отправка отчёта или обращения в администрацию.
 * Доступно публично (с формы на сайте или из Telegram-бота).
 */
export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  try {
    const raw = await request.json().catch(() => null);
    const parsed = feedbackPayload.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        {
          ok: false,
          error: "Заполните имя и контакт (до 200 символов), сообщение (до 4000 символов)",
        },
        { status: 400 }
      );
    }
    const { name, contact, message } = parsed.data;

    const entry = await db.feedback.create({
      data: { name, contact, message },
    });

    portalLogger.audit(
      "FEEDBACK_SUBMITTED",
      `Report #${entry.id} submitted by "${name}" (${contact}) from IP: ${ip}`
    );

    return NextResponse.json({
      ok: true,
      id: entry.id,
      createdAt: entry.createdAt.toISOString(),
      formattedTime: formatNskTimestamp(entry.createdAt),
      createdAtNsk: formatNskTimestamp(entry.createdAt),
    });
  } catch (error) {
    portalLogger.error("FEEDBACK_POST_ERROR", `Failed to save feedback from IP ${ip}`, error);
    return NextResponse.json(
      { ok: false, error: "Не удалось сохранить сообщение" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/feedback
 * Чтение списка репортов и обращений для панели администратора.
 * Защищено X-Admin-Key.
 */
export async function GET(request: NextRequest) {
  const ip = getClientIp(request);

  if (isIpRateLimited(ip)) {
    portalLogger.warn("SECURITY", `Blocked rate-limited request to GET /api/feedback from IP: ${ip}`);
    return NextResponse.json(
      { ok: false, error: "Слишком много неудачных попыток. Повторите позже." },
      { status: 429 }
    );
  }

  if (!isAdminRequest(request)) {
    recordFailedAdminAttempt(ip);
    portalLogger.warn("SECURITY", `Unauthorized GET /api/feedback attempt from IP: ${ip}`);
    return NextResponse.json(
      { ok: false, error: "Доступ запрещён: требуется ключ администратора" },
      { status: 401 }
    );
  }

  resetFailedAdminAttempts(ip);

  try {
    const items = await db.feedback.findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    portalLogger.audit("ADMIN_ACCESS", `Admin (IP: ${ip}) viewed ${items.length} feedback reports`);

    return NextResponse.json({
      ok: true,
      items: items.map((item) => ({
        id: item.id,
        name: item.name,
        contact: item.contact,
        message: item.message,
        createdAt: item.createdAt.toISOString(),
        formattedTime: formatNskTimestamp(item.createdAt),
        createdAtNsk: formatNskTimestamp(item.createdAt),
      })),
      count: items.length,
    });
  } catch (error) {
    portalLogger.error("FEEDBACK_GET_ERROR", "Failed to retrieve feedback list", error);
    return NextResponse.json(
      { ok: false, error: "Не удалось загрузить отчёты" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/feedback
 * Удаление отчёта по ID или очистка всех обращений.
 * Защищено X-Admin-Key.
 */
export async function DELETE(request: NextRequest) {
  const ip = getClientIp(request);

  if (isIpRateLimited(ip)) {
    portalLogger.warn("SECURITY", `Blocked rate-limited request to DELETE /api/feedback from IP: ${ip}`);
    return NextResponse.json(
      { ok: false, error: "Слишком много неудачных попыток. Повторите позже." },
      { status: 429 }
    );
  }

  if (!isAdminRequest(request)) {
    recordFailedAdminAttempt(ip);
    portalLogger.warn("SECURITY", `Unauthorized DELETE /api/feedback attempt from IP: ${ip}`);
    return NextResponse.json(
      { ok: false, error: "Доступ запрещён: требуется ключ администратора" },
      { status: 401 }
    );
  }

  resetFailedAdminAttempts(ip);

  try {
    const url = new URL(request.url);
    const idParam = url.searchParams.get("id");
    const clearAll = url.searchParams.get("clear") === "all";

    let targetId: number | null = idParam ? parseInt(idParam, 10) : null;

    if (!targetId && !clearAll) {
      const body = (await request.json().catch(() => null)) as { id?: number; clear?: boolean } | null;
      if (body?.id) targetId = Number(body.id);
      if (body?.clear) {
        await db.feedback.deleteMany({});
        portalLogger.audit("ADMIN_ACTION", `Admin (IP: ${ip}) cleared all feedback reports`);
        return NextResponse.json({ ok: true, clearedAll: true });
      }
    }

    if (clearAll) {
      await db.feedback.deleteMany({});
      portalLogger.audit("ADMIN_ACTION", `Admin (IP: ${ip}) cleared all feedback reports`);
      return NextResponse.json({ ok: true, clearedAll: true });
    }

    if (!targetId || isNaN(targetId)) {
      return NextResponse.json(
        { ok: false, error: "Не указан ID отчёта для удаления" },
        { status: 400 }
      );
    }

    await db.feedback.delete({ where: { id: targetId } });
    portalLogger.audit("ADMIN_ACTION", `Admin (IP: ${ip}) deleted feedback report #${targetId}`);

    return NextResponse.json({ ok: true, deletedId: targetId });
  } catch (error) {
    portalLogger.error("FEEDBACK_DELETE_ERROR", "Failed to delete feedback report", error);
    return NextResponse.json(
      { ok: false, error: "Не удалось удалить отчёт" },
      { status: 500 }
    );
  }
}

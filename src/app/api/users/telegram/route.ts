import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ADMIN_KEY } from "@/lib/server/sources";
import { portalLogger } from "@/lib/server/logger";

export const dynamic = "force-dynamic";

interface TelegramUserPayload {
  id: string | number;
  username?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  className?: string | null;
  languageCode?: string | null;
  isPremium?: boolean;
  action?: string | null;
}

/**
 * POST /api/users/telegram
 * Сохраняет или обновляет профиль пользователя при любом обращении к боту.
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as TelegramUserPayload;
    if (!body?.id) {
      portalLogger.warn("TELEGRAM_API", "POST /api/users/telegram rejected: missing id");
      return NextResponse.json({ ok: false, error: "Отсутствует обязательный параметр id" }, { status: 400 });
    }

    const id = String(body.id);
    const username = body.username ? body.username.replace(/^@/, "").trim() : null;
    const firstName = body.firstName ? body.firstName.trim() : null;
    const lastName = body.lastName ? body.lastName.trim() : null;
    const className = body.className ? body.className.trim() : null;
    const languageCode = body.languageCode ? body.languageCode.trim() : null;
    const isPremium = Boolean(body.isPremium);
    const action = body.action ? body.action.trim() : null;

    const existing = await db.telegramUser.findUnique({
      where: { id },
    });

    const now = new Date();

    if (existing) {
      const updated = await db.telegramUser.update({
        where: { id },
        data: {
          username: username ?? existing.username,
          firstName: firstName ?? existing.firstName,
          lastName: lastName ?? existing.lastName,
          className: className ?? existing.className,
          languageCode: languageCode ?? existing.languageCode,
          isPremium: isPremium ?? existing.isPremium,
          actionsCount: { increment: 1 },
          lastAction: action ?? existing.lastAction,
          lastActiveAt: now,
        },
      });
      portalLogger.audit("TG_USER_UPDATE", `User ${id} (@${username ?? "no_user"}) action="${action ?? "—"}" class="${className ?? existing.className ?? "—"}" totalActions=${updated.actionsCount}`);
      return NextResponse.json({ ok: true, user: updated, isNew: false });
    } else {
      const created = await db.telegramUser.create({
        data: {
          id,
          username,
          firstName,
          lastName,
          className,
          languageCode,
          isPremium,
          actionsCount: 1,
          lastAction: action ?? "/start",
          firstSeenAt: now,
          lastActiveAt: now,
        },
      });
      portalLogger.audit("TG_USER_CREATE", `New student registered: ${id} (@${username ?? "no_user"}) name="${firstName ?? ""} ${lastName ?? ""}" class="${className ?? "—"}"`);
      return NextResponse.json({ ok: true, user: created, isNew: true });
    }
  } catch (error) {
    portalLogger.error("TELEGRAM_API", "POST /api/users/telegram error", error);
    return NextResponse.json({ ok: false, error: (error as Error).message }, { status: 500 });
  }
}

/**
 * GET /api/users/telegram
 * Возвращает пользователей бота.
 * При наличии X-Admin-Key или ?adminKey=sunc-admin выдаётся полный детализированный список.
 * Без ключа — возвращается обезличенная сводка (общее количество, распределение по классам).
 */
export async function GET(request: NextRequest) {
  try {
    const adminKey = request.headers.get("x-admin-key") ?? request.nextUrl.searchParams.get("adminKey");
    const isAdmin = adminKey === ADMIN_KEY;

    const searchParams = request.nextUrl.searchParams;
    const classFilter = searchParams.get("class");
    const searchQuery = searchParams.get("search");

    // Если не админ — отдаём только публичную агрегацию без персональных данных
    if (!isAdmin) {
      const totalUsers = await db.telegramUser.count();
      const withClass = await db.telegramUser.count({ where: { className: { not: null } } });
      const allWithClass = await db.telegramUser.findMany({
        where: { className: { not: null } },
        select: { className: true },
      });

      const byClass: Record<string, number> = {};
      for (const u of allWithClass) {
        if (u.className) {
          byClass[u.className] = (byClass[u.className] ?? 0) + 1;
        }
      }

      return NextResponse.json({
        ok: true,
        isAdmin: false,
        totalUsers,
        withClassCount: withClass,
        byClass,
      });
    }

    // Для администратора — полный список с фильтрами
    const where: {
      className?: string;
      OR?: Array<{
        username?: { contains: string };
        firstName?: { contains: string };
        lastName?: { contains: string };
        id?: { contains: string };
      }>;
    } = {};

    if (classFilter) {
      where.className = classFilter;
    }

    if (searchQuery) {
      const q = searchQuery.replace(/^@/, "").trim();
      where.OR = [
        { username: { contains: q } },
        { firstName: { contains: q } },
        { lastName: { contains: q } },
        { id: { contains: q } },
      ];
    }

    const users = await db.telegramUser.findMany({
      where,
      orderBy: { lastActiveAt: "desc" },
    });

    portalLogger.info("ADMIN_API", `GET /api/users/telegram: returned ${users.length} users (classFilter=${classFilter ?? "all"}, search=${searchQuery ?? "none"})`);

    const totalUsers = await db.telegramUser.count();
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const activeToday = await db.telegramUser.count({
      where: { lastActiveAt: { gte: oneDayAgo } },
    });

    const all = await db.telegramUser.findMany({
      select: { className: true },
    });
    const byClass: Record<string, number> = {};
    for (const u of all) {
      if (u.className) {
        byClass[u.className] = (byClass[u.className] ?? 0) + 1;
      }
    }

    return NextResponse.json({
      ok: true,
      isAdmin: true,
      totalUsers,
      activeToday,
      byClass,
      count: users.length,
      users,
    });
  } catch (error) {
    console.error("[api/users/telegram] GET Ошибка:", error);
    return NextResponse.json({ ok: false, error: (error as Error).message }, { status: 500 });
  }
}

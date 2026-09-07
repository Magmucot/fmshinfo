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
  subgroup?: number | null;
  englishGroup?: string | null;
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
    const subgroup = body.subgroup !== undefined
      ? (typeof body.subgroup === "number" ? body.subgroup : (body.subgroup ? Number(body.subgroup) : null))
      : undefined;
    const englishGroup = body.englishGroup !== undefined
      ? (body.englishGroup ? String(body.englishGroup).trim() : null)
      : undefined;

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
          subgroup: subgroup !== undefined ? subgroup : existing.subgroup,
          englishGroup: englishGroup !== undefined ? englishGroup : existing.englishGroup,
          languageCode: languageCode ?? existing.languageCode,
          isPremium: isPremium ?? existing.isPremium,
          actionsCount: { increment: 1 },
          lastAction: action ?? existing.lastAction,
          lastActiveAt: now,
        },
      });
      portalLogger.audit(
        "TG_USER_UPDATE",
        `User ${id} (@${username ?? "no_user"}) action="${action ?? "—"}" class="${className ?? existing.className ?? "—"}" sub="${updated.subgroup ?? "none"}" eng="${updated.englishGroup ?? "none"}" totalActions=${updated.actionsCount}`
      );
      return NextResponse.json({ ok: true, user: updated, isNew: false });
    } else {
      const created = await db.telegramUser.create({
        data: {
          id,
          username,
          firstName,
          lastName,
          className,
          subgroup: subgroup ?? null,
          englishGroup: englishGroup ?? null,
          languageCode,
          isPremium,
          actionsCount: 1,
          lastAction: action ?? "/start",
          firstSeenAt: now,
          lastActiveAt: now,
        },
      });
      portalLogger.audit(
        "TG_USER_CREATE",
        `New student registered: ${id} (@${username ?? "no_user"}) name="${firstName ?? ""} ${lastName ?? ""}" class="${className ?? "—"}" sub="${created.subgroup ?? "none"}" eng="${created.englishGroup ?? "none"}"`
      );
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
 * Без ключа — возвращается обезличенная сводка (общее количество, распределение по классам и подгруппам).
 */
export async function GET(request: NextRequest) {
  try {
    const adminKey = request.headers.get("x-admin-key") ?? request.nextUrl.searchParams.get("adminKey");
    const isAdmin = adminKey === ADMIN_KEY;

    const searchParams = request.nextUrl.searchParams;
    const classFilter = searchParams.get("class");
    const subgroupFilter = searchParams.get("subgroup");
    const searchQuery = searchParams.get("search");

    // Если не админ — отдаём только публичную агрегацию без персональных данных
    if (!isAdmin) {
      const totalUsers = await db.telegramUser.count();
      const withClass = await db.telegramUser.count({ where: { className: { not: null } } });
      const allWithClass = await db.telegramUser.findMany({
        where: { className: { not: null } },
        select: { className: true, subgroup: true },
      });

      const byClass: Record<string, number> = {};
      const bySubgroup: Record<string, number> = { "1": 0, "2": 0, "none": 0 };

      for (const u of allWithClass) {
        if (u.className) {
          byClass[u.className] = (byClass[u.className] ?? 0) + 1;
        }
        if (u.subgroup === 1) bySubgroup["1"] = (bySubgroup["1"] ?? 0) + 1;
        else if (u.subgroup === 2) bySubgroup["2"] = (bySubgroup["2"] ?? 0) + 1;
        else bySubgroup["none"] = (bySubgroup["none"] ?? 0) + 1;
      }

      return NextResponse.json({
        ok: true,
        isAdmin: false,
        totalUsers,
        withClassCount: withClass,
        byClass,
        bySubgroup,
      });
    }

    // Для администратора — полный список с фильтрами
    const where: {
      className?: string;
      subgroup?: number;
      OR?: Array<{
        username?: { contains: string };
        firstName?: { contains: string };
        lastName?: { contains: string };
        id?: { contains: string };
        englishGroup?: { contains: string };
      }>;
    } = {};

    if (classFilter) {
      where.className = classFilter;
    }

    if (subgroupFilter !== null && subgroupFilter !== "") {
      const numSub = Number(subgroupFilter);
      if (!isNaN(numSub)) {
        where.subgroup = numSub;
      }
    }

    if (searchQuery) {
      const q = searchQuery.replace(/^@/, "").trim();
      where.OR = [
        { username: { contains: q } },
        { firstName: { contains: q } },
        { lastName: { contains: q } },
        { id: { contains: q } },
        { englishGroup: { contains: q } },
      ];
    }

    const users = await db.telegramUser.findMany({
      where,
      orderBy: { lastActiveAt: "desc" },
    });

    portalLogger.info(
      "ADMIN_API",
      `GET /api/users/telegram: returned ${users.length} users (classFilter=${classFilter ?? "all"}, subFilter=${subgroupFilter ?? "all"}, search=${searchQuery ?? "none"})`
    );

    const totalUsers = await db.telegramUser.count();
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const activeToday = await db.telegramUser.count({
      where: { lastActiveAt: { gte: oneDayAgo } },
    });

    const all = await db.telegramUser.findMany({
      select: { className: true, subgroup: true },
    });
    const byClass: Record<string, number> = {};
    const bySubgroup: Record<string, number> = { "1": 0, "2": 0, "none": 0 };

    for (const u of all) {
      if (u.className) {
        byClass[u.className] = (byClass[u.className] ?? 0) + 1;
      }
      if (u.subgroup === 1) bySubgroup["1"] = (bySubgroup["1"] ?? 0) + 1;
      else if (u.subgroup === 2) bySubgroup["2"] = (bySubgroup["2"] ?? 0) + 1;
      else bySubgroup["none"] = (bySubgroup["none"] ?? 0) + 1;
    }

    return NextResponse.json({
      ok: true,
      isAdmin: true,
      totalUsers,
      activeToday,
      byClass,
      bySubgroup,
      count: users.length,
      users,
    });
  } catch (error) {
    console.error("[api/users/telegram] GET Ошибка:", error);
    return NextResponse.json({ ok: false, error: (error as Error).message }, { status: 500 });
  }
}

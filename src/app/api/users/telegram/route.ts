import { NextRequest, NextResponse } from "next/server";
import { telegramPayload } from "@/lib/server/payloads";
import { db } from "@/lib/db";
import { isAdminRequest } from "@/lib/server/auth";
import { portalLogger } from "@/lib/server/logger";

export const dynamic = "force-dynamic";

/**
 * POST /api/users/telegram
 * Сохраняет или обновляет профиль пользователя при любом обращении к боту.
 */
export async function POST(request: NextRequest) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ ok: false, error: "Нет доступа" }, { status: 401 });
  }
  try {
    const parsed = telegramPayload.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: "Некорректные данные пользователя" }, { status: 400 });
    }
    const { id, action, ...profile } = parsed.data;
    const user = await db.telegramUser.upsert({
      where: { id },
      create: { id, ...profile, lastAction: action ?? "/start", actionsCount: 1 },
      update: { ...profile, lastAction: action, actionsCount: { increment: 1 }, lastActiveAt: new Date() },
    });
    portalLogger.audit("TG_USER_SYNC", `User ${id} synced; totalActions=${user.actionsCount}`);
    return NextResponse.json({ ok: true, user, isNew: user.actionsCount === 1 });
  } catch (error) {
    portalLogger.error("TELEGRAM_API", "POST /api/users/telegram error", error);
    return NextResponse.json({ ok: false, error: "Не удалось обработать запрос пользователей" }, { status: 500 });
  }
}

/**
 * GET /api/users/telegram
 * Возвращает пользователей бота.
 * При наличии X-Admin-Key выдаётся полный детализированный список.
 * Без ключа — возвращается обезличенная сводка (общее количество, распределение по классам и подгруппам).
 */
export async function GET(request: NextRequest) {
  try {
    const isAdmin = isAdminRequest(request);

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
    return NextResponse.json({ ok: false, error: "Не удалось обработать запрос пользователей" }, { status: 500 });
  }
}

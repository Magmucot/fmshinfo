import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isAdminRequest, getClientIp } from "@/lib/server/auth";
import { portalLogger, formatNskTimestamp } from "@/lib/server/logger";

export const dynamic = "force-dynamic";

/**
 * GET /api/users/stats
 * Сводная аналитика пользователей СУНЦ Инфо: Telegram-бот + веб-портал.
 * Без ключа: только публичные агрегированные цифры.
 * С ключом администратора: детализированный реестр учеников со всеми полями.
 */
export async function GET(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    const hasAdminHeader = Boolean(
      request.headers.get("x-admin-key") || request.headers.get("authorization")
    );
    const isAdmin = isAdminRequest(request);

    if (hasAdminHeader && !isAdmin) {
      portalLogger.warn(
        "SECURITY",
        `Invalid admin key provided on /api/users/stats from IP: ${ip}`
      );
    } else if (isAdmin) {
      portalLogger.audit(
        "ADMIN_ACCESS",
        `Admin (IP: ${ip}) accessed users stats and detailed registry`
      );
    }

    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [totalBotUsers, activeTodayBot, activeWeekBot, totalWebVisitors] = await Promise.all([
      db.telegramUser.count(),
      db.telegramUser.count({ where: { lastActiveAt: { gte: oneDayAgo } } }),
      db.telegramUser.count({ where: { lastActiveAt: { gte: oneWeekAgo } } }),
      db.webVisitor.count(),
    ]);

    // Распределение классов в Telegram-боте
    const botClasses = await db.telegramUser.findMany({
      where: { className: { not: null } },
      select: { className: true },
    });

    const botByClass: Record<string, number> = {};
    const byGrade: Record<string, number> = { "8": 0, "9": 0, "10": 0, "11": 0 };

    for (const u of botClasses) {
      if (u.className) {
        botByClass[u.className] = (botByClass[u.className] ?? 0) + 1;
        const grade = u.className.split("-")[0];
        if (grade && byGrade[grade] !== undefined) {
          byGrade[grade] = (byGrade[grade] ?? 0) + 1;
        }
      }
    }

    const sortedClasses = Object.entries(botByClass)
      .map(([className, count]) => ({ className, count }))
      .sort((a, b) => b.count - a.count);

    // Распределение по подгруппам
    const allUsersSubs = await db.telegramUser.findMany({
      select: { subgroup: true },
    });
    const bySubgroup: Record<string, number> = { "1": 0, "2": 0, "none": 0 };
    for (const u of allUsersSubs) {
      if (u.subgroup === 1) bySubgroup["1"] = (bySubgroup["1"] ?? 0) + 1;
      else if (u.subgroup === 2) bySubgroup["2"] = (bySubgroup["2"] ?? 0) + 1;
      else bySubgroup["none"] = (bySubgroup["none"] ?? 0) + 1;
    }

    // Детализированный реестр пользователей (только для верифицированного администратора)
    let recentUsers: Array<{
      id: string;
      username: string | null;
      firstName: string | null;
      lastName: string | null;
      className: string | null;
      subgroup: number | null;
      englishGroup: string | null;
      languageCode: string | null;
      isPremium: boolean;
      actionsCount: number;
      lastAction: string | null;
      firstSeenAt: Date;
      lastActiveAt: Date;
    }> = [];

    if (isAdmin) {
      recentUsers = await db.telegramUser.findMany({
        take: 250,
        orderBy: { lastActiveAt: "desc" },
        select: {
          id: true,
          username: true,
          firstName: true,
          lastName: true,
          className: true,
          subgroup: true,
          englishGroup: true,
          languageCode: true,
          isPremium: true,
          actionsCount: true,
          lastAction: true,
          firstSeenAt: true,
          lastActiveAt: true,
        },
      });
    }

    const now = new Date();
    const requestedAt = formatNskTimestamp(now);

    return NextResponse.json({
      ok: true,
      isAdmin,
      timestamp: now.toISOString(),
      requestedAt,
      bot: {
        totalUsers: totalBotUsers,
        activeToday: activeTodayBot,
        activeWeek: activeWeekBot,
        withClassCount: botClasses.length,
        byClass: botByClass,
        topClasses: sortedClasses,
        byGrade,
        bySubgroup,
        recentUsers,
      },
      web: {
        totalVisitors: totalWebVisitors,
      },
    });
  } catch (error) {
    portalLogger.error("STATS_API", "GET /api/users/stats error", error);
    return NextResponse.json({ ok: false, error: (error as Error).message }, { status: 500 });
  }
}

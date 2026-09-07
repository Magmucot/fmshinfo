import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ADMIN_KEY } from "@/lib/server/sources";

export const dynamic = "force-dynamic";

/**
 * GET /api/users/stats
 * Сводная аналитика пользователей СУНЦ Инфо: Telegram-бот + веб-портал
 */
export async function GET(request: NextRequest) {
  try {
    const adminKey = request.headers.get("x-admin-key") ?? request.nextUrl.searchParams.get("adminKey");
    const isAdmin = adminKey === ADMIN_KEY;

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

    // Последние активные пользователи (для админа — с именами и юзернеймами)
    let recentUsers: Array<{
      id: string;
      username: string | null;
      firstName: string | null;
      className: string | null;
      actionsCount: number;
      lastAction: string | null;
      lastActiveAt: Date;
    }> = [];

    if (isAdmin) {
      recentUsers = await db.telegramUser.findMany({
        take: 20,
        orderBy: { lastActiveAt: "desc" },
        select: {
          id: true,
          username: true,
          firstName: true,
          className: true,
          actionsCount: true,
          lastAction: true,
          lastActiveAt: true,
        },
      });
    }

    return NextResponse.json({
      ok: true,
      isAdmin,
      bot: {
        totalUsers: totalBotUsers,
        activeToday: activeTodayBot,
        activeWeek: activeWeekBot,
        withClassCount: botClasses.length,
        byClass: botByClass,
        topClasses: sortedClasses,
        byGrade,
        recentUsers,
      },
      web: {
        totalVisitors: totalWebVisitors,
      },
    });
  } catch (error) {
    console.error("[api/users/stats] Ошибка:", error);
    return NextResponse.json({ ok: false, error: (error as Error).message }, { status: 500 });
  }
}

/**
 * In-Process API Dispatcher for SUNC Info.
 * Dispatches API requests directly in memory to server libraries and Prisma,
 * eliminating HTTP loopback overhead and removing the Next.js runtime requirement.
 */

import os from "os";
import { readFileSync, existsSync } from "fs";
import { db } from "../db";
import { cached, TTL } from "./cache";
import { getMenu } from "./menu";
import { getSchedule, getBells, getClasses } from "./tableSesc";
import { getWeather } from "./weather";
import { getEvents } from "./events";
import { getNews } from "./news";
import {
  CANTEEN_SHIFTS,
  WEEKDAY_MEALS,
  WEEKEND_MEALS,
  CANTEEN_FOOTNOTE,
  getMealsForClass,
  getCurrentMealState,
} from "./canteenSchedule";
import { SCHOOL_INFO } from "./sources";
import { ensureSeedData } from "./seed";
import { feedbackPayload } from "./payloads";
import {
  isAdminRequest,
  getClientIp,
  constantTimeCompare,
  recordFailedAdminAttempt,
  resetFailedAdminAttempts,
  isIpRateLimited,
} from "./auth";
import { portalLogger, formatNskTimestamp } from "./logger";

export interface ApiDispatchResult {
  status: number;
  data: any;
}

export interface DispatchOptions {
  method?: string;
  body?: any;
  headers?: Headers | Record<string, string | string[] | undefined>;
}

function normalizeHeaders(
  headers?: Headers | Record<string, string | string[] | undefined>
): Headers {
  if (!headers) return new Headers();
  if (headers instanceof Headers) return headers;
  const h = new Headers();
  for (const [key, val] of Object.entries(headers)) {
    if (val !== undefined) {
      if (Array.isArray(val)) {
        for (const v of val) h.append(key, v);
      } else {
        h.set(key, val);
      }
    }
  }
  return h;
}

function checkAdminAuth(headers: Headers): boolean {
  const configured = process.env.ADMIN_KEY;
  if (!configured) return false;
  const adminHeader = headers.get("x-admin-key");
  if (adminHeader && constantTimeCompare(adminHeader, configured)) return true;
  const authHeader = headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7).trim();
    if (constantTimeCompare(token, configured)) return true;
  }
  return false;
}

function getMemInfo() {
  try {
    if (existsSync("/proc/meminfo")) {
      const content = readFileSync("/proc/meminfo", "utf-8");
      let totalKb = 0;
      let availableKb = 0;
      for (const line of content.split("\n")) {
        if (line.startsWith("MemTotal:")) {
          totalKb = parseInt(line.replace(/\D/g, ""), 10);
        } else if (line.startsWith("MemAvailable:")) {
          availableKb = parseInt(line.replace(/\D/g, ""), 10);
        }
      }
      if (totalKb > 0 && availableKb > 0) {
        const total = totalKb * 1024;
        const free = availableKb * 1024;
        const used = total - free;
        return { total, free, used, percent: Math.round((used / total) * 100) };
      }
    }
  } catch {}

  const total = os.totalmem();
  const free = os.freemem();
  const used = total - free;
  return { total, free, used, percent: Math.round((used / total) * 100) };
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " КБ";
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(0) + " МБ";
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + " ГБ";
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d} дн. ${h} ч. ${m} мин.`;
  if (h > 0) return `${h} ч. ${m} мин.`;
  return `${m} мин.`;
}

/**
 * Dispatches an API path and query to the corresponding in-process service.
 */
export async function handleApiRoute(
  pathAndQuery: string,
  options: DispatchOptions = {}
): Promise<ApiDispatchResult> {
  const method = (options.method ?? "GET").toUpperCase();
  const headers = normalizeHeaders(options.headers);
  const dummyBase = "http://localhost";
  const url = new URL(pathAndQuery.startsWith("http") ? pathAndQuery : `${dummyBase}${pathAndQuery.startsWith("/") ? "" : "/"}${pathAndQuery}`);
  const pathname = url.pathname;
  const params = url.searchParams;

  try {
    // 1. GET /api/schedule
    if (pathname === "/api/schedule") {
      const group = params.get("group") ?? undefined;
      const teacher = params.get("teacher") ?? undefined;
      const classroom = params.get("classroom") ?? undefined;

      if (!group && !teacher && !classroom) {
        return {
          status: 400,
          data: { ok: false, error: "Укажите параметр group, teacher или classroom" },
        };
      }

      const { data, stale } = await cached(
        `schedule:${group ?? ""}|${teacher ?? ""}|${classroom ?? ""}`,
        TTL.schedule,
        () => getSchedule({ group, teacher, classroom })
      );
      return { status: 200, data: { ok: true, ...data, stale } };
    }

    // 2. GET /api/bells
    if (pathname === "/api/bells") {
      const { data, stale } = await cached("bells", TTL.schedule, getBells);
      return { status: 200, data: { ok: true, ...data, stale } };
    }

    // 3. GET /api/classes
    if (pathname === "/api/classes") {
      const { data, stale } = await cached("classes", TTL.schedule, getClasses);
      return { status: 200, data: { ok: true, ...data, stale } };
    }

    // 4. GET /api/canteen/schedule
    if (pathname === "/api/canteen/schedule") {
      const className = params.get("class");
      const isWeekendParam = params.get("weekend");
      const isWeekend = isWeekendParam !== null ? isWeekendParam === "true" || isWeekendParam === "1" : undefined;
      const currentStatus = getCurrentMealState(undefined, className ?? undefined);

      if (className) {
        const classSchedule = getMealsForClass(className, isWeekend ?? currentStatus.isWeekend);
        return {
          status: 200,
          data: {
            ok: true,
            shifts: CANTEEN_SHIFTS,
            selectedClass: className,
            classSchedule,
            currentStatus,
            source: "График работы столовой со 2 сентября (rasp.jpg)",
          },
        };
      }

      return {
        status: 200,
        data: {
          ok: true,
          shifts: CANTEEN_SHIFTS,
          weekdayMeals: WEEKDAY_MEALS,
          weekendMeals: WEEKEND_MEALS,
          footnote: CANTEEN_FOOTNOTE,
          currentStatus,
          source: "График работы столовой со 2 сентября (rasp.jpg)",
        },
      };
    }

    // 5. GET /api/menu
    if (pathname === "/api/menu") {
      const date = params.get("date") ?? undefined;
      const { data, stale } = await cached(
        `menu:${(date ?? "").trim()}`,
        TTL.menu,
        () => getMenu(date)
      );
      return { status: 200, data: { ok: true, ...data, stale } };
    }

    // 6. GET /api/weather
    if (pathname === "/api/weather") {
      const { data, stale } = await cached("weather", TTL.weather, getWeather);
      return { status: 200, data: { ok: true, ...data, stale } };
    }

    // 7. GET /api/events
    if (pathname === "/api/events") {
      const { data, stale } = await cached("events", 30 * 60 * 1000, getEvents);
      return {
        status: 200,
        data: {
          ok: true,
          stale,
          source: data.source,
          title: data.title,
          yearFrom: data.yearFrom,
          yearTo: data.yearTo,
          classes: data.classes,
          days: data.days,
          count: data.days.length,
          eventsTotal: data.eventsTotal,
          updatedAt: data.updatedAt,
        },
      };
    }

    // 8. GET /api/news
    if (pathname === "/api/news") {
      const limitParam = Number(params.get("limit") ?? "12");
      const limit = Number.isFinite(limitParam) ? Math.min(Math.max(1, limitParam), 25) : 12;
      const { data, stale } = await cached("news:all", TTL.news, () => getNews(25));
      return { status: 200, data: { ok: true, items: data.items.slice(0, limit), stale } };
    }

    // 9. /api/duty
    if (pathname === "/api/duty") {
      if (method === "GET") {
        await ensureSeedData();
        const date = params.get("date");
        const items = await db.dutyEntry.findMany({
          where: date ? { date } : undefined,
          orderBy: [{ date: "asc" }, { id: "asc" }],
        });
        return { status: 200, data: { ok: true, items, count: items.length } };
      }
      if (method === "POST") {
        if (!checkAdminAuth(headers)) {
          return { status: 401, data: { ok: false, error: "Неверный X-Admin-Key" } };
        }
        const body = options.body ?? {};
        if (!body.date || !/^\d{2}\.\d{2}\.\d{4}$/.test(body.date)) {
          return { status: 400, data: { ok: false, error: "Поле date обязательно в формате ДД.ММ.ГГГГ" } };
        }
        const entry = body.id
          ? await db.dutyEntry.update({ where: { id: body.id }, data: body })
          : await db.dutyEntry.create({ data: body });
        return { status: 200, data: { ok: true, entry } };
      }
    }

    // 10. /api/counselors
    if (pathname === "/api/counselors" || pathname === "/api/night-counselors") {
      if (method === "GET") {
        await ensureSeedData();
        const date = params.get("date");
        const items = await db.nightCounselor.findMany({
          where: date ? { date } : undefined,
          orderBy: [{ date: "asc" }, { dormitory: "asc" }],
        });
        return { status: 200, data: { ok: true, counselors: items, count: items.length } };
      }
      if (method === "POST") {
        if (!checkAdminAuth(headers)) {
          return { status: 401, data: { ok: false, error: "Неверный X-Admin-Key" } };
        }
        const body = options.body ?? {};
        const entry = body.id
          ? await db.nightCounselor.update({ where: { id: body.id }, data: body })
          : await db.nightCounselor.create({ data: body });
        return { status: 200, data: { ok: true, entry } };
      }
    }

    // 11. GET /api/info
    if (pathname === "/api/info") {
      return { status: 200, data: { ok: true, ...SCHOOL_INFO } };
    }

    // 12. /api/feedback
    if (pathname === "/api/feedback") {
      if (method === "POST") {
        const parsed = feedbackPayload.safeParse(options.body);
        if (!parsed.success) {
          return {
            status: 400,
            data: { ok: false, error: "Заполните имя и контакт (до 200 символов), сообщение (до 4000 символов)" },
          };
        }
        const entry = await db.feedback.create({ data: parsed.data });
        return {
          status: 200,
          data: {
            ok: true,
            id: entry.id,
            createdAt: entry.createdAt.toISOString(),
            formattedTime: formatNskTimestamp(entry.createdAt),
            createdAtNsk: formatNskTimestamp(entry.createdAt),
          },
        };
      }
      if (method === "GET") {
        if (params.get("clear") === "all") {
          if (!checkAdminAuth(headers)) {
            return { status: 401, data: { ok: false, error: "Доступ запрещён: требуется ключ администратора" } };
          }
          await db.feedback.deleteMany({});
          return { status: 200, data: { ok: true, clearedAll: true } };
        }
        if (!checkAdminAuth(headers)) {
          return { status: 401, data: { ok: false, error: "Доступ запрещён: требуется ключ администратора" } };
        }
        const items = await db.feedback.findMany({ orderBy: { createdAt: "desc" }, take: 200 });
        return {
          status: 200,
          data: {
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
          },
        };
      }
      if (method === "DELETE") {
        if (!checkAdminAuth(headers)) {
          return { status: 401, data: { ok: false, error: "Доступ запрещён: требуется ключ администратора" } };
        }
        const clearAll = params.get("clear") === "all" || options.body?.clear === true;
        if (clearAll) {
          await db.feedback.deleteMany({});
          return { status: 200, data: { ok: true, clearedAll: true } };
        }
        const targetId = Number(params.get("id") ?? options.body?.id);
        if (!targetId || isNaN(targetId)) {
          return { status: 400, data: { ok: false, error: "Не указан ID отчёта для удаления" } };
        }
        await db.feedback.delete({ where: { id: targetId } });
        return { status: 200, data: { ok: true, deletedId: targetId } };
      }
    }

    // 13. GET /api/admin/system
    if (pathname === "/api/admin/system") {
      if (!checkAdminAuth(headers)) {
        return { status: 403, data: { ok: false, error: "Доступ запрещён: неверный ключ администратора" } };
      }
      const mem = getMemInfo();
      const loadavg = os.loadavg();
      const procMem = process.memoryUsage();
      return {
        status: 200,
        data: {
          ok: true,
          timestamp: new Date().toISOString(),
          memory: {
            totalBytes: mem.total,
            usedBytes: mem.used,
            freeBytes: mem.free,
            percent: mem.percent,
            formatted: {
              total: formatBytes(mem.total),
              used: formatBytes(mem.used),
              free: formatBytes(mem.free),
              procRss: formatBytes(procMem.rss),
              procHeap: formatBytes(procMem.heapUsed),
            },
          },
          cpu: {
            cores: os.cpus().length,
            loadavg: [
              Number(loadavg[0].toFixed(2)),
              Number(loadavg[1].toFixed(2)),
              Number(loadavg[2].toFixed(2)),
            ],
          },
          uptime: {
            systemSeconds: Math.floor(os.uptime()),
            processSeconds: Math.floor(process.uptime()),
            formattedSystem: formatUptime(os.uptime()),
            formattedProcess: formatUptime(process.uptime()),
          },
          platform: {
            os: process.platform,
            arch: process.arch,
            nodeVersion: process.version,
          },
        },
      };
    }

    return { status: 404, data: { ok: false, error: `Not found: ${pathname}` } };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { status: 500, data: { ok: false, error: message } };
  }
}

/**
 * Direct typed helper for calling internal API without network sockets.
 */
export async function dispatchApi<T = any>(
  pathAndQuery: string,
  options?: DispatchOptions
): Promise<T | null> {
  const res = await handleApiRoute(pathAndQuery, options);
  if (res.status >= 200 && res.status < 300) {
    return res.data as T;
  }
  return null;
}

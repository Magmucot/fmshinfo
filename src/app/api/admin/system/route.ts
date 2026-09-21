import { NextRequest, NextResponse } from "next/server";
import os from "os";
import { readFileSync, existsSync } from "fs";
import {
  isAdminRequest,
  getClientIp,
  recordFailedAdminAttempt,
  resetFailedAdminAttempts,
  isIpRateLimited,
} from "@/lib/server/auth";
import { portalLogger } from "@/lib/server/logger";

export const dynamic = "force-dynamic";

let prevCpuTimes: { idle: number; total: number } | null = null;

function getCpuSnapshot() {
  const cpus = os.cpus();
  let idle = 0;
  let total = 0;
  for (const cpu of cpus) {
    for (const t in cpu.times) {
      total += cpu.times[t as keyof typeof cpu.times];
    }
    idle += cpu.times.idle;
  }
  return { idle, total, count: cpus.length, model: cpus[0]?.model || "CPU" };
}

function calculateCpuUsage(current: { idle: number; total: number; count: number }): number {
  if (!prevCpuTimes) {
    prevCpuTimes = { idle: current.idle, total: current.total };
    const load1 = os.loadavg()[0];
    return Math.min(100, Math.max(0, Math.round((load1 / current.count) * 100)));
  }
  const idleDiff = current.idle - prevCpuTimes.idle;
  const totalDiff = current.total - prevCpuTimes.total;
  prevCpuTimes = { idle: current.idle, total: current.total };
  if (totalDiff <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round(((totalDiff - idleDiff) / totalDiff) * 100)));
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
 * GET /api/admin/system
 * Возвращает метрики нагрузки сервера (ОЗУ, CPU, аптайм, процесс).
 * Защищено ADMIN_KEY.
 */
export async function GET(request: NextRequest) {
  const ip = getClientIp(request);

  if (isIpRateLimited(ip)) {
    portalLogger.warn("SECURITY", `Blocked rate-limited request to /api/admin/system from IP: ${ip}`);
    return NextResponse.json(
      { ok: false, error: "Слишком много неудачных попыток. Повторите позже." },
      { status: 429 }
    );
  }

  if (!isAdminRequest(request)) {
    recordFailedAdminAttempt(ip);
    portalLogger.warn("SECURITY", `Unauthorized GET /api/admin/system attempt from IP: ${ip}`);
    return NextResponse.json(
      { ok: false, error: "Доступ запрещён: неверный ключ администратора" },
      { status: 403 }
    );
  }

  resetFailedAdminAttempts(ip);

  try {
    const mem = getMemInfo();
    const cpuSnapshot = getCpuSnapshot();
    const cpuPercent = calculateCpuUsage(cpuSnapshot);
    const loadavg = os.loadavg();
    const procMem = process.memoryUsage();

    return NextResponse.json({
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
        percent: cpuPercent,
        cores: cpuSnapshot.count,
        model: cpuSnapshot.model,
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
    });
  } catch (error) {
    portalLogger.error("SYSTEM_API", "GET /api/admin/system error", error);
    return NextResponse.json({ ok: false, error: (error as Error).message }, { status: 500 });
  }
}

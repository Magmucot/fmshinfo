"use client";

/** API-клиент и React-Query хуки «СУНЦ Инфо» */

import { useQuery } from "@tanstack/react-query";
import type {
  BellsResponse,
  ClassesResponse,
  CounselorsResponse,
  DocumentResponse,
  DutyResponse,
  EventsResponse,
  InfoResponse,
  MenuResponse,
  MenuStatsResponse,
  NewsResponse,
  ScheduleResponse,
  WeatherResponse,
} from "./types";

async function api<T>(path: string, adminKey?: string): Promise<T> {
  const response = await fetch(path, { headers: { Accept: "application/json", ...(adminKey ? { "X-Admin-Key": adminKey } : {}) } });
  const data = (await response.json().catch(() => ({}))) as T & { ok?: boolean; error?: string };
  if (!response.ok || data.ok === false) {
    throw new Error(data.error || `Ошибка запроса (${response.status})`);
  }
  return data;
}

export function useMenu(date?: string) {
  return useQuery<MenuResponse>({
    queryKey: ["menu", date ?? "today"],
    queryFn: () => api<MenuResponse>(`/api/menu${date ? `?date=${encodeURIComponent(date)}` : ""}`),
    staleTime: 30 * 60 * 1000,
  });
}

export function useMenuStats(days = 10, enabled = true) {
  return useQuery<MenuStatsResponse>({
    queryKey: ["menuStats", days],
    queryFn: () => api<MenuStatsResponse>(`/api/menu/stats?days=${days}`),
    staleTime: 10 * 60 * 1000,
    enabled,
  });
}

export function useBells() {
  return useQuery<BellsResponse>({
    queryKey: ["bells"],
    queryFn: () => api<BellsResponse>("/api/bells"),
    staleTime: 60 * 60 * 1000,
  });
}

export function useClasses() {
  return useQuery<ClassesResponse>({
    queryKey: ["classes"],
    queryFn: () => api<ClassesResponse>("/api/classes"),
    staleTime: 60 * 60 * 1000,
  });
}

export function useSchedule(group: string | null) {
  return useQuery<ScheduleResponse>({
    queryKey: ["schedule", group],
    queryFn: () => api<ScheduleResponse>(`/api/schedule?group=${encodeURIComponent(group ?? "")}`),
    enabled: Boolean(group),
    staleTime: 60 * 60 * 1000,
  });
}

export function useWeather() {
  return useQuery<WeatherResponse>({
    queryKey: ["weather"],
    queryFn: () => api<WeatherResponse>("/api/weather"),
    refetchInterval: 10 * 60 * 1000,
    staleTime: 5 * 60 * 1000,
  });
}

export function useNews(limit = 12) {
  return useQuery<NewsResponse>({
    queryKey: ["news", limit],
    queryFn: () => api<NewsResponse>(`/api/news?limit=${limit}`),
    staleTime: 60 * 60 * 1000,
  });
}

export function useDuty(date?: string) {
  return useQuery<DutyResponse>({
    queryKey: ["duty", date ?? "all"],
    queryFn: () => api<DutyResponse>(`/api/duty${date ? `?date=${encodeURIComponent(date)}` : ""}`),
    staleTime: 60 * 1000,
  });
}

export function useCounselors(date?: string) {
  return useQuery<CounselorsResponse>({
    queryKey: ["counselors", date ?? "all"],
    queryFn: () =>
      api<CounselorsResponse>(`/api/counselors${date ? `?date=${encodeURIComponent(date)}` : ""}`),
    staleTime: 60 * 1000,
  });
}

export function useInfo() {
  return useQuery<InfoResponse>({
    queryKey: ["info"],
    queryFn: () => api<InfoResponse>("/api/info"),
    staleTime: 24 * 60 * 60 * 1000,
  });
}

export function useDocument() {
  return useQuery<DocumentResponse>({
    queryKey: ["document"],
    queryFn: () => api<DocumentResponse>("/api/document"),
    staleTime: 24 * 60 * 60 * 1000,
  });
}

export function useEvents() {
  return useQuery<EventsResponse>({
    queryKey: ["events"],
    queryFn: () => api<EventsResponse>("/api/events"),
    staleTime: 15 * 60 * 1000,
  });
}

export function useCanteenSchedule(className?: string) {
  return useQuery<any>({
    queryKey: ["canteenSchedule", className ?? "all"],
    queryFn: () => api<any>(`/api/canteen/schedule${className ? `?class=${encodeURIComponent(className)}` : ""}`),
    staleTime: 5 * 60 * 1000,
    refetchInterval: 60 * 1000, // каждую минуту обновляем статус
  });
}

/** Административные запросы (X-Admin-Key) */
export async function adminRequest(
  path: string,
  method: "POST" | "DELETE",
  adminKey: string,
  body?: unknown
): Promise<{ ok: boolean; error?: string }> {
  const response = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json", "X-Admin-Key": adminKey },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string };
  if (!response.ok || data.ok === false) {
    throw new Error(data.error || `Ошибка запроса (${response.status})`);
  }
  return { ok: true };
}

/** Обратная связь */
export async function sendFeedback(name: string, contact: string, message: string): Promise<void> {
  const response = await fetch("/api/feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, contact, message }),
  });
  const data = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string };
  if (!response.ok || data.ok === false) {
    throw new Error(data.error || "Не удалось отправить сообщение");
  }
}

export interface TelegramUserProfile {
  id: string;
  username: string | null;
  firstName: string | null;
  lastName?: string | null;
  className: string | null;
  subgroup?: number | null;
  englishGroup?: string | null;
  languageCode?: string | null;
  isPremium?: boolean;
  actionsCount: number;
  lastAction: string | null;
  firstSeenAt?: string;
  lastActiveAt: string;
}

export interface UsersStatsData {
  ok: boolean;
  isAdmin: boolean;
  bot: {
    totalUsers: number;
    activeToday: number;
    activeWeek: number;
    withClassCount: number;
    byClass: Record<string, number>;
    topClasses: Array<{ className: string; count: number }>;
    byGrade: Record<string, number>;
    bySubgroup?: Record<string, number>;
    recentUsers?: TelegramUserProfile[];
  };
  web: {
    totalVisitors: number;
  };
}

/** Статистика аудитории и пользователей Telegram-бота и сайта */
export function useUsersStats(adminKey?: string) {
  return useQuery<UsersStatsData>({
    queryKey: ["usersStats", adminKey ?? ""],
    queryFn: () =>
      api<UsersStatsData>(
        "/api/users/stats", adminKey
      ),
    staleTime: 30 * 1000,
  });
}

export interface ParsedLogEntry {
  raw: string;
  timestamp: string;
  level: string;
  category: string;
  message: string;
  userId?: string;
  username?: string;
}

export interface AdminLogsData {
  ok: boolean;
  file: string;
  totalLines: number;
  count: number;
  lines: string[];
  parsed?: ParsedLogEntry[];
}

/** Получение строк логов для админ-панели */
export function useAdminLogs(
  adminKey?: string,
  file = "bot",
  level = "ALL",
  search?: string,
  limit = 150,
  autoRefresh = true
) {
  return useQuery<AdminLogsData>({
    queryKey: ["adminLogs", adminKey ?? "", file, level, search ?? "", limit],
    queryFn: () => {
      const p = new URLSearchParams();
      p.set("file", file);
      if (level && level !== "ALL") p.set("level", level);
      if (search && search.trim()) p.set("search", search.trim());
      if (limit) p.set("limit", String(limit));
      return api<AdminLogsData>(`/api/admin/logs?${p.toString()}`, adminKey);
    },
    enabled: Boolean(adminKey),
    refetchInterval: autoRefresh ? 5000 : false,
  });
}

export interface SystemMetricsData {
  ok: boolean;
  timestamp: string;
  memory: {
    totalBytes: number;
    usedBytes: number;
    freeBytes: number;
    percent: number;
    formatted: {
      total: string;
      used: string;
      free: string;
      procRss: string;
      procHeap: string;
    };
  };
  cpu: {
    percent: number;
    cores: number;
    model: string;
    loadavg: [number, number, number];
  };
  uptime: {
    systemSeconds: number;
    processSeconds: number;
    formattedSystem: string;
    formattedProcess: string;
  };
  platform: {
    os: string;
    arch: string;
    nodeVersion: string;
  };
}

/** Системные метрики нагрузки сервера (ОЗУ, CPU, Uptime) для администратора */
export function useSystemMetrics(adminKey?: string, enabled = true) {
  return useQuery<SystemMetricsData>({
    queryKey: ["systemMetrics", adminKey ?? ""],
    queryFn: () => api<SystemMetricsData>("/api/admin/system", adminKey),
    enabled: Boolean(adminKey) && enabled,
    refetchInterval: 3500, // автообновление каждые 3.5 сек
    staleTime: 2000,
  });
}




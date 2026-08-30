"use client";

/** API-клиент и React-Query хуки «СУНЦ Инфо» */

import { useQuery } from "@tanstack/react-query";
import type {
  BellsResponse,
  ClassesResponse,
  CounselorsResponse,
  DocumentResponse,
  DutyResponse,
  InfoResponse,
  MenuResponse,
  MenuStatsResponse,
  NewsResponse,
  ScheduleResponse,
  WeatherResponse,
} from "./types";

async function api<T>(path: string): Promise<T> {
  const response = await fetch(path, { headers: { Accept: "application/json" } });
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

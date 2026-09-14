"use client";

import { useSyncExternalStore, useCallback } from "react";

const CLASS_KEY = "sunc_user_class";
export const DEFAULT_CLASS = "10-4";

let memoryClass: string | null = null;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((l) => l());
}

function getSnapshot(): string {
  if (typeof window === "undefined") return DEFAULT_CLASS;
  try {
    const stored = localStorage.getItem(CLASS_KEY);
    return stored || memoryClass || DEFAULT_CLASS;
  } catch {
    return memoryClass || DEFAULT_CLASS;
  }
}

function getServerSnapshot(): string {
  return DEFAULT_CLASS;
}

function subscribe(callback: () => void): () => void {
  listeners.add(callback);
  const onStorage = (e: StorageEvent) => {
    if (e.key === CLASS_KEY) {
      callback();
    }
  };
  const onCustom = () => callback();
  window.addEventListener("storage", onStorage);
  window.addEventListener("sunc:class-changed", onCustom);

  return () => {
    listeners.delete(callback);
    window.removeEventListener("storage", onStorage);
    window.removeEventListener("sunc:class-changed", onCustom);
  };
}

/**
 * Хук для реактивной синхронизации выбранного класса по всему сайту
 * (Расписание, Столовая, Дашборд) с персистентностью в localStorage
 */
export function useUserClass(): [string, (cls: string) => void] {
  const userClass = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setUserClass = useCallback((cls: string) => {
    const trimmed = cls.trim();
    if (!trimmed) return;
    memoryClass = trimmed;
    try {
      localStorage.setItem(CLASS_KEY, trimmed);
      window.dispatchEvent(new CustomEvent("sunc:class-changed", { detail: trimmed }));

      const clientId = localStorage.getItem("sunc_client_id");
      if (clientId) {
        fetch("/api/users/web", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clientId, className: trimmed, path: window.location.pathname }),
        }).catch(() => {});
      }
    } catch {}
    notify();
  }, []);

  return [userClass, setUserClass];
}

"use client";

/** Логика установки PWA: beforeinstallprompt + состояние (клиентский стор) */

type InstallState = "unavailable" | "available" | "installed";

let initialized = false;
let deferredPrompt: BeforeInstallPromptEvent | null = null;
let state: InstallState = "unavailable";
const listeners = new Set<() => void>();

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function emit() {
  listeners.forEach((l) => l());
}

/** Вызывается один раз при монтировании приложения */
export function initPwaInstall() {
  if (typeof window === "undefined" || initialized) return;
  initialized = true;

  const mq = window.matchMedia("(display-mode: standalone)");
  const isStandalone = mq.matches || (window.navigator as unknown as { standalone?: boolean }).standalone === true;
  if (isStandalone) {
    state = "installed";
    emit();
  }
  mq.addEventListener?.("change", (e) => {
    if (e.matches) {
      state = "installed";
      emit();
    }
  });

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
    state = "available";
    emit();
  });

  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    state = "installed";
    emit();
  });
}

export function getInstallState(): InstallState {
  return state;
}

export function subscribeInstall(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Показать системный диалог установки */
export async function promptInstall(): Promise<"accepted" | "dismissed" | "unavailable"> {
  if (!deferredPrompt) return "unavailable";
  await deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  deferredPrompt = null;
  if (outcome === "accepted") {
    state = "installed";
    emit();
    return "accepted";
  }
  return "dismissed";
}

/** iOS Safari не поддерживает beforeinstallprompt — только инструкция */
export function isIOS(): boolean {
  if (typeof window === "undefined") return false;
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

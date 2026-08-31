"use client";

/** Кнопка установки PWA (шапка) и баннер-подсказка (дашборд) */

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { Download, Share, PlusCircle, Smartphone, X } from "lucide-react";
import { getInstallState, isIOS, isStandalone, promptInstall, subscribeInstall } from "@/lib/pwa-install";
import { toast } from "@/hooks/use-toast";

function useInstallState() {
  const subscribe = useCallback((cb: () => void) => subscribeInstall(cb), []);
  return useSyncExternalStore(subscribe, getInstallState, () => "unavailable" as const);
}

/** Компактная кнопка в шапке: показывается, только если установка доступна */
export function InstallAppButton() {
  const state = useInstallState();
  if (state !== "available") return null;

  const install = async () => {
    const result = await promptInstall();
    if (result === "accepted") {
      toast({ title: "Приложение установлено", description: "Найдите «СУНЦ Инфо» на главном экране" });
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={install}
      className="h-9 gap-1.5 rounded-xl border-primary/40 bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary"
      aria-label="Установить приложение на телефон"
    >
      <Download className="h-4 w-4" />
      <span className="hidden sm:inline">Приложение</span>
    </Button>
  );
}

const DISMISS_KEY = "sunc-info:install-dismissed";

/** Баннер на дашборде: системная установка или инструкция для iOS */
export function InstallBannerCard() {
  const state = useInstallState();
  const [dismissed, setDismissed] = useState(true);
  const [iosHint, setIosHint] = useState(false);
  const [standalone, setStandalone] = useState(true); // до гидратации считаем «установлено», чтобы не мигало

  // Чтение окружения после монтирования (вне синхронного тела эффекта)
  useEffect(() => {
    const t = window.setTimeout(() => {
      setStandalone(isStandalone());
      setIosHint(isIOS());
      try {
        setDismissed(localStorage.getItem(DISMISS_KEY) === "1");
      } catch {
        /* приватный режим */
      }
    }, 0);
    return () => window.clearTimeout(t);
  }, []);

  const hide = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
  };

  if (standalone || dismissed) return null;

  // Chrome/Android: системный диалог доступен
  if (state === "available") {
    return (
      <div className="relative overflow-hidden rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/15 via-primary/5 to-transparent p-4">
        <button
          onClick={hide}
          className="absolute right-2.5 top-2.5 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          aria-label="Скрыть подсказку"
        >
          <X className="h-4 w-4" />
        </button>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-md shadow-amber-500/25">
            <Smartphone className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold">Установить «СУНЦ Инфо» как приложение</p>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              Работает офлайн, открывается с главного экрана, без адресной строки — как родное приложение
            </p>
          </div>
          <Button
            size="sm"
            className="gap-1.5 rounded-xl"
            onClick={async () => {
              const r = await promptInstall();
              if (r === "accepted") hide();
            }}
          >
            <Download className="h-4 w-4" /> Установить
          </Button>
        </div>
      </div>
    );
  }

  // iOS Safari: инструкция «На экран Домой»
  if (iosHint) {
    return (
      <div className="relative rounded-2xl border border-primary/25 bg-secondary/40 p-4">
        <button
          onClick={hide}
          className="absolute right-2.5 top-2.5 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          aria-label="Скрыть подсказку"
        >
          <X className="h-4 w-4" />
        </button>
        <p className="text-sm font-bold">Добавьте портал на экран «Домой»</p>
        <ol className="mt-2 space-y-1.5 text-xs leading-relaxed text-muted-foreground">
          <li className="flex items-center gap-2">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[10px] font-bold text-primary">1</span>
            <span>
              Нажмите <Share className="mx-0.5 inline h-3.5 w-3.5" /> «Поделиться» в панели Safari
            </span>
          </li>
          <li className="flex items-center gap-2">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[10px] font-bold text-primary">2</span>
            <span>
              Выберите <PlusCircle className="mx-0.5 inline h-3.5 w-3.5" /> «На экран „Домой“»
            </span>
          </li>
        </ol>
      </div>
    );
  }

  return null;
}

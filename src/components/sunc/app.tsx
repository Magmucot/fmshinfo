"use client";

/** Каркас приложения «СУНЦ Инфо»: шапка, навигация, разделы, футер */

import { useCallback, useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { motion, AnimatePresence } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard, CalendarDays, Utensils, CalendarClock, BrushCleaning, MoonStar, CloudSun, Newspaper, Info, Sun, Moon, Users,
} from "lucide-react";
import { useWeather } from "./api";
import { nowNsk, fmtRu, WEEKDAYS_SHORT } from "./types";
import { InstallAppButton } from "./install-banner";
import { DashboardSection } from "./sections/dashboard";
import { ScheduleSection } from "./sections/schedule";
import { CanteenSection } from "./sections/canteen";
import { EventsSection } from "./sections/events";
import { DutySection } from "./sections/duty";
import { CounselorsSection } from "./sections/counselors";
import { WeatherSection } from "./sections/weather";
import { NewsSection } from "./sections/news";
import { InfoSection } from "./sections/info";
import { UsersStatsSection } from "./sections/users-stats";

const TABS = [
  { id: "dashboard", label: "Главная", icon: LayoutDashboard },
  { id: "schedule", label: "Расписание", icon: CalendarDays },
  { id: "canteen", label: "Столовая", icon: Utensils },
  { id: "events", label: "Мероприятия", icon: CalendarClock },
  { id: "duty", label: "Дежурства", icon: BrushCleaning },
  { id: "counselors", label: "Вожатые", icon: MoonStar },
  { id: "weather", label: "Погода", icon: CloudSun },
  { id: "news", label: "Новости", icon: Newspaper },
  { id: "info", label: "Инфо", icon: Info },
  { id: "users", label: "Аудитория", icon: Users },
] as const;

type TabId = (typeof TABS)[number]["id"];

const TAB_IDS = TABS.map((t) => t.id) as readonly TabId[];

/** Режим раздела «Столовая»: меню, график смен питания (rasp.jpg) или аналитика */
export type CanteenView = "menu" | "schedule" | "analytics";

function LiveClock() {
  const [time, setTime] = useState("");

  useEffect(() => {
    const update = () => {
      const now = nowNsk();
      setTime(
        `${String(now.getUTCHours()).padStart(2, "0")}:${String(now.getUTCMinutes()).padStart(2, "0")}`
      );
    };
    update();
    const timer = setInterval(update, 15000);
    return () => clearInterval(timer);
  }, []);

  return (
    <span className="tabular-nums font-bold">{time}</span>
  );
}

function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <Button
      variant="outline"
      size="icon"
      className="h-9 w-9 rounded-xl"
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      aria-label="Переключить тему"
    >
      {/* Иконка выбирается CSS-классами — без рассинхрона гидратации */}
      <Sun className="h-4 w-4 dark:hidden" />
      <Moon className="hidden h-4 w-4 dark:block" />
    </Button>
  );
}

export default function SuncApp() {
  const [tab, setTab] = useState<TabId>("dashboard");
  /** Подрежим «Столовой»: Меню ↔ Аналитика (аналитика перенесена внутрь раздела) */
  const [canteenView, setCanteenView] = useState<CanteenView>("menu");
  const weather = useWeather();
  const now = nowNsk();
  const todayLabel = `${WEEKDAYS_SHORT[now.getUTCDay()]}, ${fmtRu(now)}`;

  const navigate = useCallback((next: string, opts?: { canteenView?: CanteenView }) => {
    // Глубокая ссылка прежней вкладки «Аналитика» → раздел «Столовая», режим аналитики
    const target = next === "analytics" ? "canteen" : next;
    if ((TAB_IDS as readonly string[]).includes(target)) {
      setTab(target as TabId);
      if (opts?.canteenView || next === "analytics") {
        setCanteenView(opts?.canteenView ?? "analytics");
      }
    }
  }, []);

  // Глубокая ссылка ?tab=… (PWA-шорткаты / «Поделиться»).
  // Применяется после монтирования (вне синхронного тела эффекта),
  // чтобы не было рассинхрона гидратации с серверным HTML.
  useEffect(() => {
    const applyDeepLink = () => {
      const t = new URLSearchParams(window.location.search).get("tab");
      navigate(t ?? "dashboard");
    };
    const timer = window.setTimeout(applyDeepLink, 0);
    return () => window.clearTimeout(timer);
  }, [navigate]);

  // Горячие клавиши: Alt+1…9 — вкладки 1–9
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      if (!/^[1-9]$/.test(e.key)) return;
      e.preventDefault();
      const idx = Number(e.key) - 1;
      if (idx < TABS.length) setTab(TABS[idx].id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Анонимный учет веб-посетителей и активности
  useEffect(() => {
    try {
      let clientId = localStorage.getItem("sunc_client_id");
      if (!clientId) {
        clientId = "web_" + Math.random().toString(36).slice(2, 11) + "_" + Date.now().toString(36);
        localStorage.setItem("sunc_client_id", clientId);
      }
      fetch("/api/users/web", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          path: window.location.pathname,
          userAgent: navigator.userAgent,
        }),
      }).catch(() => {});
    } catch {}
  }, []);

  return (
    <div className="app-modern-bg flex min-h-screen flex-col">
      {/* Шапка */}
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-xl transition-all">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2 px-3 py-2.5 sm:gap-3 sm:px-6 sm:py-3">
          <div className="flex min-w-0 flex-1 items-center gap-2.5 sm:flex-none sm:gap-3">
            <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-xl border border-primary/30 shadow-md shadow-primary/20 transition-transform duration-300 hover:scale-105 sm:h-11 sm:w-11">
              <img
                src="/avatar.png"
                alt="ФМШ"
                className="h-full w-full object-cover"
              />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-base font-extrabold tracking-tight sm:text-xl text-foreground">СУНЦ Инфо</h1>
              <p className="truncate text-[11px] text-muted-foreground sm:text-xs">
                портал ученика ФМШ · {todayLabel}
              </p>
            </div>
          </div>

          <div className="ml-auto flex items-center gap-1.5 sm:gap-2 sm:gap-3">
            <InstallAppButton />
            <div className="hidden items-center gap-2 rounded-xl border border-border/60 bg-secondary/30 px-3 py-1.5 transition-colors hover:border-primary/40 sm:flex">
              <span className="text-lg leading-none select-none" aria-hidden>
                {weather.data?.current.icon ?? "⛅"}
              </span>
              <div className="leading-tight">
                <span className="block text-sm font-bold tabular-nums">
                  {weather.data?.current.temperature !== undefined && weather.data?.current.temperature !== null
                    ? `${weather.data.current.temperature}°C`
                    : "…"}
                </span>
                <span className="block text-[10px] text-muted-foreground">Академгородок</span>
              </div>
            </div>
            <div className="flex items-center gap-1.5 rounded-xl border border-border/60 bg-secondary/30 px-2.5 py-1.5 sm:px-3">
              <LiveClock />
              <span className="text-[10px] text-muted-foreground">НСК</span>
            </div>
            <ThemeToggle />
          </div>
        </div>

        {/* Навигация */}
        <nav className="mx-auto max-w-6xl px-3 sm:px-6 pb-2.5" aria-label="Разделы">
          <div className="flex gap-1 overflow-x-auto no-scrollbar p-1 rounded-2xl bg-secondary/30 border border-border/40">
            {TABS.map(({ id, label, icon: Icon }, i) => (
              <button
                key={id}
                onClick={() => {
                  setTab(id);
                  if (id === "canteen") setCanteenView("menu");
                }}
                aria-current={tab === id ? "page" : undefined}
                title={`${label} (Alt+${i + 1})`}
                className={`flex h-9 shrink-0 items-center gap-1.5 rounded-xl px-3 text-[12px] font-semibold outline-none transition-all duration-200 focus-visible:ring-2 focus-visible:ring-ring sm:px-3.5 sm:text-xs ${
                  tab === id
                    ? "bg-primary text-primary-foreground shadow-xs"
                    : "text-muted-foreground hover:bg-background/80 hover:text-foreground"
                }`}
              >
                <Icon className={`h-3.5 w-3.5 transition-transform duration-200 ${tab === id ? "scale-105" : ""}`} />
                <span>{label}</span>
              </button>
            ))}
          </div>
        </nav>
      </header>

      {/* Контент */}
      <main className="mx-auto w-full max-w-6xl flex-1 px-3 py-4 sm:px-6 sm:py-6">
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
          >
            {tab === "dashboard" && <DashboardSection onNavigate={navigate} />}
            {tab === "schedule" && <ScheduleSection />}
            {tab === "canteen" && (
              <CanteenSection view={canteenView} onViewChange={setCanteenView} />
            )}
            {tab === "events" && <EventsSection />}
            {tab === "duty" && <DutySection />}
            {tab === "counselors" && <CounselorsSection />}
            {tab === "weather" && <WeatherSection />}
            {tab === "news" && <NewsSection />}
            {tab === "info" && <InfoSection />}
            {tab === "users" && <UsersStatsSection />}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Футер (прижат к низу) */}
      <footer className="mt-auto border-t border-border/70 bg-background/80 backdrop-blur-md">
        <div className="mx-auto max-w-6xl px-3 py-4 sm:px-6">
          <div className="flex flex-col items-center justify-between gap-2.5 text-center sm:flex-row sm:text-left">
            <div className="space-y-1">
              <p className="text-xs leading-relaxed text-muted-foreground">
                «СУНЦ Инфо» — неофициальный агрегатор. Данные:{" "}
                <a href="https://sesc.nsu.ru" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                  sesc.nsu.ru
                </a>
                ,{" "}
                <a href="https://table-sesc.nsu.ru" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                  table-sesc.nsu.ru
                </a>
                , Open-Meteo/wttr.in, Google Sheets
              </p>
              <p className="text-[11px] text-muted-foreground/80">
                СУНЦ НГУ · ул. Пирогова, здание 4 · sesc@nsu.ru · быстрый переход: Alt+1…9
              </p>
            </div>
            <Badge variant="outline" className="shrink-0 border-primary/30 bg-primary/5 text-primary">
              сделано для ФМШ ♥
            </Badge>
          </div>
        </div>
      </footer>
    </div>
  );
}

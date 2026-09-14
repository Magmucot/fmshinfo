"use client";

/**
 * Главная страница: Дашборд «Студент OS» СУНЦ НГУ (ФМШ)
 * - Dynamic Campus Live Island: статус звонков, столовой и быстрые переходы
 * - Bento Grid: Звонки и таймер, Погода Академгородка, Энергия и КБЖУ дня
 * - Столовая и меню дня с интерактивным переключением
 * - Пульс кампуса: дежурства, ночные вожатые интерната, события
 * - Лента новостей школы
 */

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CloudSun, Clock, Utensils, BrushCleaning, MoonStar, Newspaper, ArrowRight, Flame, Wind,
  Droplets, Sunrise, Sunset, CalendarClock, Megaphone, Users, Sparkles, CalendarDays, ExternalLink,
} from "lucide-react";
import {
  useBells, useCanteenSchedule, useDuty, useCounselors, useEvents, useMenu, useMenuStats, useNews, useWeather, useUsersStats,
} from "../api";
import { useUserClass } from "../useUserClass";
import { ErrorCard, LoadingBlock, MacroPills, SectionCard, humanDate } from "../shared";
import { InstallBannerCard } from "../install-banner";
import { Bell, Dish, MealSection } from "../types";
import { nowNsk, fmtRu, parseRuDate, ruDayMonth } from "../types";

/** Интерактивный Live Island в верхней части дашборда */
function LiveCampusIsland({
  bells,
  canteenDesc,
  temp,
  weatherIcon,
  onNavigate,
}: {
  bells: Bell[];
  canteenDesc?: string;
  temp?: number | null;
  weatherIcon?: string;
  onNavigate: (tab: string) => void;
}) {
  const now = nowNsk();
  const minutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

  const current = bells.find((b) => minutes >= toMin(b.begin) && minutes < toMin(b.end));
  const next = bells.find((b) => toMin(b.begin) > minutes);
  const isSunday = now.getUTCDay() === 0;

  let bellStatusText = "Учебный день завершён";
  let bellBadgeColor = "bg-secondary text-muted-foreground";

  if (current) {
    const remain = toMin(current.end) - minutes;
    const pairName = current.pairName ? ` (${current.pairName})` : "";
    bellStatusText = `Идёт урок ${current.begin}–${current.end}${pairName} · звонок через ${remain} мин`;
    bellBadgeColor = "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30";
  } else if (next) {
    const until = toMin(next.begin) - minutes;
    bellStatusText = `Перемена · следующий урок в ${next.begin} (через ${until} мин)`;
    bellBadgeColor = "bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30";
  } else if (isSunday) {
    bellStatusText = "Воскресенье — выходной день";
    bellBadgeColor = "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border border-indigo-500/30";
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border border-border/80 bg-gradient-to-r from-card via-card/95 to-secondary/30 p-3.5 shadow-sm backdrop-blur-xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Статус звонка / занятия */}
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="relative flex h-3 w-3 shrink-0">
            <span className="absolute inline-flex h-full w-full rounded-full bg-primary opacity-75 animate-ping" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-primary" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`rounded-md px-2 py-0.5 text-[11px] font-bold tracking-tight ${bellBadgeColor}`}>
                {bellStatusText}
              </span>
            </div>
            {canteenDesc ? (
              <p className="truncate text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                <span>🍱</span>
                <span>{canteenDesc}</span>
              </p>
            ) : null}
          </div>
        </div>

        {/* Быстрые действия */}
        <div className="flex items-center gap-2 shrink-0 ml-auto">
          {temp !== undefined && temp !== null ? (
            <div className="hidden sm:flex items-center gap-1.5 rounded-xl border border-border/60 bg-secondary/40 px-2.5 py-1 text-xs font-bold tabular-nums">
              <span>{weatherIcon ?? "⛅"}</span>
              <span>{temp > 0 ? `+${temp}` : temp}°C</span>
            </div>
          ) : null}

          <button
            onClick={() => onNavigate("schedule")}
            className="flex items-center gap-1.5 rounded-xl bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground shadow-xs transition-all hover:bg-primary/90 hover:shadow-sm active:scale-98 cursor-pointer"
          >
            <CalendarDays className="h-3.5 w-3.5" />
            <span>Расписание</span>
          </button>
          <button
            onClick={() => onNavigate("canteen")}
            className="flex items-center gap-1.5 rounded-xl border border-border/70 bg-secondary/50 px-3 py-1.5 text-xs font-bold text-foreground transition-all hover:bg-secondary active:scale-98 cursor-pointer"
          >
            <Utensils className="h-3.5 w-3.5" />
            <span>Столовая</span>
          </button>
        </div>
      </div>
    </div>
  );
}

/** Текущий/следующий звонок с визуальным прогрессом */
export function BellNow({ bells, loading }: { bells: Bell[]; loading: boolean }) {
  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-6 w-2/3" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-4 w-1/2" />
      </div>
    );
  }
  if (!bells.length) return <LoadingBlock lines={2} />;

  const now = nowNsk();
  const minutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

  const current = bells.find((b) => minutes >= toMin(b.begin) && minutes < toMin(b.end));
  const next = bells.find((b) => toMin(b.begin) > minutes);
  const prevEnd = [...bells].reverse().find((b) => toMin(b.end) <= minutes);

  const isSunday = now.getUTCDay() === 0;
  let status: string;
  let detail: string;
  if (current) {
    status = `Идёт урок ${current.begin}–${current.end}`;
    detail = `до звонка осталось ${toMin(current.end) - minutes} мин`;
  } else if (next) {
    status = `Перемена · звонок в ${next.begin}`;
    detail = `следующий урок ${next.begin}–${next.end}`;
  } else if (isSunday) {
    status = "Воскресенье — выходной";
    detail = "занятий нет";
  } else {
    status = "Учебный день завершён";
    detail = prevEnd ? `последний звонок был в ${prevEnd.end}` : "—";
  }

  const progress = current
    ? Math.round(((minutes - toMin(current.begin)) / (toMin(current.end) - toMin(current.begin))) * 100)
    : 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full rounded-full bg-primary opacity-60 animate-ping" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-primary" />
          </span>
          <p className="text-sm font-bold leading-tight">{status}</p>
        </div>
      </div>
      <Progress value={progress} className="h-2 rounded-full" />
      <p className="text-xs text-muted-foreground font-medium">{detail}</p>
      <div className="grid grid-cols-3 gap-2">
        {[
          { num: 1, title: "1-я пара", time: "08:30–10:10", begin: "08:30", end: "10:10" },
          { num: 2, title: "2-я пара", time: "10:20–12:00", begin: "10:20", end: "12:00" },
          { num: 3, title: "3-я пара", time: "12:30–14:10", begin: "12:30", end: "14:10" },
        ].map((p) => {
          const isPairActive = minutes >= toMin(p.begin) && minutes < toMin(p.end);
          return (
            <div
              key={p.num}
              className={`rounded-xl border px-2 py-1.5 text-center transition-all ${
                isPairActive
                  ? "border-primary/60 bg-primary/15 text-primary font-bold shadow-xs scale-102"
                  : "border-border/60 bg-secondary/30 text-muted-foreground"
              }`}
            >
              <span className="block text-[11px] font-bold">{p.title}</span>
              <span className="block text-[10px] font-mono tabular-nums opacity-80">{p.time}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WeatherMini({ weather, loading }: { weather: ReturnType<typeof useWeather>["data"]; loading: boolean }) {
  if (loading || !weather) {
    return (
      <div className="flex items-center gap-4">
        <Skeleton className="h-12 w-12 rounded-xl" />
        <div className="space-y-2">
          <Skeleton className="h-7 w-24" />
          <Skeleton className="h-4 w-32" />
        </div>
      </div>
    );
  }
  const c = weather.current;
  return (
    <div className="flex items-center gap-4">
      <div className="text-5xl leading-none select-none" aria-hidden>
        {c.icon}
      </div>
      <div>
        <div className="text-3xl font-black tracking-tight tabular-nums">
          {c.temperature ?? "—"}
          <span className="text-lg font-bold text-muted-foreground">°C</span>
        </div>
        <p className="text-xs text-muted-foreground font-medium">
          {c.description}
          {c.apparent !== null ? ` · ощущается ${c.apparent}°` : ""}
        </p>
      </div>
    </div>
  );
}

function MealPreview({ meal }: { meal: MealSection }) {
  const top = meal.dishes.slice(0, 3);
  return (
    <div className="rounded-xl border border-border/60 bg-secondary/30 p-3 transition-all hover:border-primary/40">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-bold">{meal.type}</p>
        {meal.totals?.kcal ? (
          <Badge variant="outline" className="gap-1 border-primary/30 bg-primary/5 text-primary shrink-0 text-[10px] font-bold">
            <Flame className="h-3 w-3" />
            {meal.totals.kcal} ккал
          </Badge>
        ) : null}
      </div>
      <ul className="mt-2 space-y-1">
        {top.map((dish: Dish, i: number) => (
          <li key={i} className="truncate text-xs text-muted-foreground">
            • {dish.name}
            {dish.weight ? <span className="opacity-60">, {dish.weight} г</span> : null}
          </li>
        ))}
        {meal.dishes.length > 3 ? (
          <li className="text-[11px] text-muted-foreground/70 italic pl-1">и ещё {meal.dishes.length - 3}…</li>
        ) : null}
      </ul>
    </div>
  );
}

export function DashboardSection({
  onNavigate,
}: {
  onNavigate: (tab: string, opts?: { canteenView?: "menu" | "schedule" | "analytics" }) => void;
}) {
  const [userClass] = useUserClass();
  const weather = useWeather();
  const bells = useBells();
  const menu = useMenu();
  const canteenSchedule = useCanteenSchedule(userClass);
  const duty = useDuty(fmtRu(nowNsk()));
  const counselors = useCounselors(fmtRu(nowNsk()));
  const news = useNews(4);
  const events = useEvents();
  const usersStats = useUsersStats();

  // Вкладка внутри карточки «Пульс кампуса»
  const [pulseTab, setPulseTab] = useState<"duty" | "counselors" | "events">("duty");

  // Фоновый прогрев кэша статистики питания (раздел «Аналитика»)
  useMenuStats(10);

  const today = fmtRu(nowNsk());
  const todayTs = parseRuDate(today)?.getTime() ?? 0;
  // Ближайшие 4 события (от сегодня и позже)
  const upcoming = (events.data?.days ?? [])
    .filter((d) => (parseRuDate(d.date)?.getTime() ?? 0) >= todayTs)
    .flatMap((d) => [
      ...d.general.map((t) => ({ date: d.date, weekday: d.weekday, className: null as string | null, text: t })),
      ...Object.entries(d.byClass).flatMap(([className, texts]) =>
        texts.map((t) => ({ date: d.date, weekday: d.weekday, className, text: t }))
      ),
    ])
    .slice(0, 4);

  return (
    <div className="space-y-4">
      {/* Dynamic Campus Live Island */}
      <LiveCampusIsland
        bells={bells.data?.bells ?? []}
        canteenDesc={canteenSchedule.data?.currentStatus?.description}
        temp={weather.data?.current.temperature}
        weatherIcon={weather.data?.current.icon}
        onNavigate={onNavigate}
      />

      {/* Подсказка об установке приложения (PWA) */}
      <InstallBannerCard />

      {/* Интерактивный баннер аудитории и пользователей бота */}
      {usersStats.data?.bot && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/70 bg-card/60 p-3.5 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-bold">Аудитория «СУНЦ Инфо»</span>
                <Badge variant="secondary" className="text-[11px] font-mono">
                  {usersStats.data.bot.totalUsers} чел. в Telegram-боте
                </Badge>
                {usersStats.data.bot.activeToday > 0 && (
                  <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-[11px]">
                    ● {usersStats.data.bot.activeToday} сегодня
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {usersStats.data.bot.topClasses.length > 0
                  ? `Лидируют классы: ${usersStats.data.bot.topClasses.slice(0, 3).map((c) => c.className).join(", ")}`
                  : "Подключайтесь к боту @fmshinfobot для персонального расписания"}
              </p>
            </div>
          </div>
          <button
            onClick={() => onNavigate("users")}
            className="flex items-center gap-1.5 rounded-xl border bg-background px-3 py-1.5 text-xs font-semibold hover:bg-accent transition-colors cursor-pointer"
          >
            Аналитика и реестр <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Строка 1: Bento Grid (Звонки + Погода + Калории) */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <SectionCard title="Сейчас в школе" icon={<Clock className="h-4 w-4" />}>
          <BellNow bells={bells.data?.bells ?? []} loading={bells.isLoading} />
          {canteenSchedule.data?.currentStatus ? (
            <div className="mt-3 border-t border-border/50 pt-2.5 text-xs text-muted-foreground">
              <span className="font-bold text-foreground">🍱 Столовая:</span>{" "}
              {canteenSchedule.data.currentStatus.description}
            </div>
          ) : null}
        </SectionCard>

        <SectionCard title="Погода в Академгородке" icon={<CloudSun className="h-4 w-4" />}>
          <WeatherMini weather={weather.data} loading={weather.isLoading} />
          {weather.data ? (
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {weather.data.current.humidity !== null ? (
                <span className="flex items-center gap-1">
                  <Droplets className="h-3.5 w-3.5" /> {weather.data.current.humidity}%
                </span>
              ) : null}
              {weather.data.current.windSpeed !== null ? (
                <span className="flex items-center gap-1">
                  <Wind className="h-3.5 w-3.5" /> {weather.data.current.windSpeed} м/с
                  {weather.data.current.windDirection ? ` (${weather.data.current.windDirection})` : ""}
                </span>
              ) : null}
              {weather.data.current.sunrise ? (
                <span className="flex items-center gap-1">
                  <Sunrise className="h-3.5 w-3.5" /> {weather.data.current.sunrise}
                </span>
              ) : null}
              {weather.data.current.sunset ? (
                <span className="flex items-center gap-1">
                  <Sunset className="h-3.5 w-3.5" /> {weather.data.current.sunset}
                </span>
              ) : null}
            </div>
          ) : null}
          {weather.isError ? (
            <p className="mt-2 text-xs text-destructive">Погода временно недоступна</p>
          ) : null}
        </SectionCard>

        <SectionCard
          title="Калории сегодня"
          icon={<Flame className="h-4 w-4" />}
          action={
            <button
              onClick={() => onNavigate("canteen", { canteenView: "analytics" })}
              className="flex items-center gap-1 text-xs font-bold text-primary hover:underline cursor-pointer"
              title="Столовая → Аналитика"
            >
              Аналитика <ArrowRight className="h-3.5 w-3.5" />
            </button>
          }
        >
          {menu.isLoading ? (
            <LoadingBlock lines={2} />
          ) : menu.data ? (
            <div className="space-y-3">
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-black tabular-nums tracking-tight">
                  {menu.data.dayTotals?.kcal ?? "—"}
                </span>
                <span className="text-sm text-muted-foreground font-medium">ккал за день</span>
              </div>
              <MacroPills totals={menu.data.dayTotals} size="md" />
              <p className="text-xs text-muted-foreground">Меню на {menu.data.date}</p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Меню недоступно</p>
          )}
        </SectionCard>
      </div>

      {/* Строка 2: Меню столовой + Пульс кампуса */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Левая колонка: Меню столовой */}
        <SectionCard
          className="lg:col-span-2"
          title="Меню столовой сегодня"
          icon={<Utensils className="h-4 w-4" />}
          action={
            <div className="flex items-center gap-2 text-xs">
              <button
                onClick={() => onNavigate("canteen", { canteenView: "schedule" })}
                className="font-semibold text-muted-foreground hover:text-primary hover:underline cursor-pointer"
                title="График работы и смены столовой"
              >
                График смен
              </button>
              <span className="text-muted-foreground/40">·</span>
              <button
                onClick={() => onNavigate("canteen", { canteenView: "menu" })}
                className="flex items-center gap-1 font-bold text-primary hover:underline cursor-pointer"
              >
                Полное меню <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          }
        >
          {menu.isLoading ? (
            <LoadingBlock lines={4} />
          ) : menu.data && menu.data.meals.length ? (
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {menu.data.meals.map((meal, i) => (
                <MealPreview key={i} meal={meal} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              {menu.error ? "Источник меню временно недоступен." : "Меню на сегодня не опубликовано."}
            </p>
          )}
        </SectionCard>

        {/* Правая колонка: Интерактивный пульс кампуса (Дежурства / Вожатые / События) */}
        <SectionCard
          title="Пульс кампуса"
          icon={<Sparkles className="h-4 w-4" />}
          action={
            <div className="flex items-center gap-1 rounded-lg bg-secondary/50 p-0.5 border border-border/50 text-[11px]">
              <button
                onClick={() => setPulseTab("duty")}
                className={`rounded-md px-2 py-0.5 font-bold transition-all ${
                  pulseTab === "duty" ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Дежурные
              </button>
              <button
                onClick={() => setPulseTab("counselors")}
                className={`rounded-md px-2 py-0.5 font-bold transition-all ${
                  pulseTab === "counselors" ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Вожатые
              </button>
              <button
                onClick={() => setPulseTab("events")}
                className={`rounded-md px-2 py-0.5 font-bold transition-all ${
                  pulseTab === "events" ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                События
              </button>
            </div>
          }
        >
          {/* 1. Дежурства */}
          {pulseTab === "duty" ? (
            duty.isLoading ? (
              <LoadingBlock lines={2} />
            ) : duty.data && duty.data.count > 0 ? (
              <ul className="space-y-2">
                {duty.data.items.map((item) => (
                  <li key={item.id} className="rounded-xl border border-border/60 bg-secondary/30 p-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-bold text-foreground">{item.className ?? "—"}</span>
                      <Badge variant="outline" className="text-[11px] font-semibold">{item.dutyType}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {item.timeInterval ?? ""}
                      {item.responsible ? ` · ${item.responsible}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground py-4 text-center">На сегодня дежурств не назначено</p>
            )
          ) : null}

          {/* 2. Ночные вожатые */}
          {pulseTab === "counselors" ? (
            counselors.isLoading ? (
              <LoadingBlock lines={2} />
            ) : counselors.data && counselors.data.count > 0 ? (
              <ul className="space-y-2">
                {counselors.data.items.map((item) => (
                  <li key={item.id} className="rounded-xl border border-border/60 bg-secondary/30 p-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-muted-foreground">{item.dormitory}</span>
                      {item.floor ? <span className="text-[11px] text-muted-foreground font-mono">{item.floor}</span> : null}
                    </div>
                    <p className="mt-1 text-sm font-bold text-foreground">{item.counselorName}</p>
                    {item.phone ? (
                      <p className="text-[11px] text-primary font-mono mt-0.5">📞 {item.phone}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground py-4 text-center">График дежурных вожатых не опубликован</p>
            )
          ) : null}

          {/* 3. Ближайшие события */}
          {pulseTab === "events" ? (
            events.isLoading ? (
              <LoadingBlock lines={3} />
            ) : upcoming.length ? (
              <ul className="space-y-2">
                {upcoming.map((e, i) => (
                  <li key={i} className="flex items-start gap-2 rounded-xl border border-border/60 bg-secondary/30 p-2.5">
                    <span className={`mt-0.5 shrink-0 ${e.className === null ? "text-amber-600 dark:text-amber-400" : "text-teal-700 dark:text-teal-400"}`}>
                      {e.className === null ? <Megaphone className="h-3.5 w-3.5" /> : <Users className="h-3.5 w-3.5" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-bold leading-snug">{e.text}</p>
                      <p className="text-[10px] text-muted-foreground tabular-nums mt-0.5">
                        {ruDayMonth(e.date)} · {e.weekday}
                        {e.date === today ? " · сегодня" : ""}
                        {e.className ? ` · ${e.className}` : ""}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground py-4 text-center">Ближайших событий в календаре нет</p>
            )
          ) : null}
        </SectionCard>
      </div>

      {/* Строка 3: Новости школы */}
      <SectionCard
        title="Новости СУНЦ НГУ"
        icon={<Newspaper className="h-4 w-4" />}
        action={
          <button
            onClick={() => onNavigate("news")}
            className="flex items-center gap-1 text-xs font-bold text-primary hover:underline cursor-pointer"
          >
            Все новости <ArrowRight className="h-3.5 w-3.5" />
          </button>
        }
      >
        {news.isLoading ? (
          <LoadingBlock lines={3} />
        ) : news.data ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {news.data.items.slice(0, 4).map((item) => (
              <a
                key={item.id}
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex flex-col justify-between rounded-xl border border-border/60 bg-secondary/30 p-3.5 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/50 hover:bg-card hover:shadow-sm"
              >
                <p className="text-sm font-semibold leading-snug transition-colors group-hover:text-primary">
                  {item.title}
                </p>
                <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                  <span>{item.date ?? ""} {item.rubric ? `· ${item.rubric}` : ""}</span>
                  <ExternalLink className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-100 text-primary" />
                </div>
              </a>
            ))}
          </div>
        ) : (
          <ErrorCard message="Новости временно недоступны" onRetry={() => news.refetch()} />
        )}
      </SectionCard>

      <p className="px-1 text-xs text-muted-foreground">
        Сегодня {humanDate(today)} · Данные синхронизируются автоматически: sesc.nsu.ru, table-sesc.nsu.ru, Open-Meteo, Google Sheets
      </p>
    </div>
  );
}

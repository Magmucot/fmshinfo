"use client";

/** Главная страница: дашборд (погода, звонки сейчас, меню, дежурства, вожатые, новости) */

import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CloudSun, Clock, Utensils, BrushCleaning, MoonStar, Newspaper, ArrowRight, Flame, Wind, Droplets, Sunrise, Sunset,
} from "lucide-react";
import { useBells, useDuty, useCounselors, useMenu, useMenuStats, useNews, useWeather } from "../api";
import { ErrorCard, LoadingBlock, MacroPills, SectionCard, humanDate } from "../shared";
import { InstallBannerCard } from "../install-banner";
import { Bell, Dish, MealSection } from "../types";
import { nowNsk, fmtRu } from "../types";

/** Текущий/следующий звонок с прогрессом */
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
    status = `Идёт занятие ${current.begin}–${current.end}`;
    detail = `до звонка ${toMin(current.end) - minutes} мин`;
  } else if (next) {
    status = `Перемена · звонок в ${next.begin}`;
    detail = `следующее занятие ${next.begin}–${next.end}`;
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
            <span className="absolute inline-flex h-full w-full rounded-full bg-primary opacity-60 animate-soft-pulse" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-primary" />
          </span>
          <p className="text-sm font-semibold leading-tight">{status}</p>
        </div>
      </div>
      <Progress value={progress} className="h-2" />
      <p className="text-xs text-muted-foreground">{detail}</p>
      <div className="grid grid-cols-2 gap-1.5">
        {bells.slice(0, 6).map((b, i) => {
          const isCurrent = current === b;
          return (
            <span
              key={i}
              className={`rounded-md px-1.5 py-0.5 text-xs tabular-nums transition-colors ${
                isCurrent
                  ? "bg-primary/15 font-bold text-primary"
                  : "text-muted-foreground"
              }`}
            >
              {b.begin}–{b.end}
            </span>
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
        <div className="text-3xl font-extrabold tracking-tight tabular-nums">
          {c.temperature ?? "—"}
          <span className="text-lg font-bold text-muted-foreground">°C</span>
        </div>
        <p className="text-sm text-muted-foreground">
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
    <div className="rounded-xl border border-border/60 bg-secondary/40 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-bold">{meal.type}</p>
        {meal.totals?.kcal ? (
          <Badge variant="outline" className="gap-1 border-primary/30 bg-primary/5 text-primary shrink-0">
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
          <li className="text-xs text-muted-foreground/70">и ещё {meal.dishes.length - 3}…</li>
        ) : null}
      </ul>
    </div>
  );
}

export function DashboardSection({ onNavigate }: { onNavigate: (tab: string) => void }) {
  const weather = useWeather();
  const bells = useBells();
  const menu = useMenu();
  const duty = useDuty(fmtRu(nowNsk()));
  const counselors = useCounselors(fmtRu(nowNsk()));
  const news = useNews(4);
  // Фоновый прогрев кэша статистики питания (раздел «Аналитика»):
  // первый запрос разбирает PDF-меню за 10 дней и может занять ~30–40 с
  useMenuStats(10);

  const today = fmtRu(nowNsk());

  return (
    <div className="space-y-4">
      {/* Подсказка об установке приложения (PWA) */}
      <InstallBannerCard />

      {/* Строка 1: погода + звонки + калории */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
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

        <SectionCard title="Сейчас в школе" icon={<Clock className="h-4 w-4" />}>
          <BellNow bells={bells.data?.bells ?? []} loading={bells.isLoading} />
        </SectionCard>

        <SectionCard
          title="Калории сегодня"
          icon={<Flame className="h-4 w-4" />}
          action={
            <button
              onClick={() => onNavigate("analytics")}
              className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
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
                <span className="text-4xl font-extrabold tabular-nums tracking-tight">
                  {menu.data.dayTotals?.kcal ?? "—"}
                </span>
                <span className="text-sm text-muted-foreground">ккал за день</span>
              </div>
              <MacroPills totals={menu.data.dayTotals} size="md" />
              <p className="text-xs text-muted-foreground">Меню на {menu.data.date}</p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Меню недоступно</p>
          )}
        </SectionCard>
      </div>

      {/* Строка 2: меню + сегодня (дежурства/вожатые) */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <SectionCard
          className="lg:col-span-2"
          title="Меню столовой сегодня"
          icon={<Utensils className="h-4 w-4" />}
          action={
            <button
              onClick={() => onNavigate("canteen")}
              className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
            >
              Полное меню <ArrowRight className="h-3.5 w-3.5" />
            </button>
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

        <div className="space-y-4">
          <SectionCard title="Дежурства сегодня" icon={<BrushCleaning className="h-4 w-4" />}>
            {duty.isLoading ? (
              <LoadingBlock lines={2} />
            ) : duty.data && duty.data.count > 0 ? (
              <ul className="space-y-2">
                {duty.data.items.map((item) => (
                  <li key={item.id} className="rounded-lg border border-border/60 bg-secondary/40 px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold">{item.className ?? "—"}</span>
                      <Badge variant="outline" className="text-[11px]">{item.dutyType}</Badge>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {item.timeInterval ?? ""}
                      {item.responsible ? ` · ${item.responsible}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">На сегодня дежурств нет</p>
            )}
          </SectionCard>

          <SectionCard title="Ночные вожатые" icon={<MoonStar className="h-4 w-4" />}>
            {counselors.isLoading ? (
              <LoadingBlock lines={2} />
            ) : counselors.data && counselors.data.count > 0 ? (
              <ul className="space-y-2">
                {counselors.data.items.map((item) => (
                  <li key={item.id} className="rounded-lg border border-border/60 bg-secondary/40 px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-muted-foreground">{item.dormitory}</span>
                      {item.floor ? <span className="text-[11px] text-muted-foreground">{item.floor}</span> : null}
                    </div>
                    <p className="mt-0.5 text-sm font-semibold">{item.counselorName}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">График не внесён</p>
            )}
          </SectionCard>
        </div>
      </div>

      {/* Строка 3: новости */}
      <SectionCard
        title="Новости школы"
        icon={<Newspaper className="h-4 w-4" />}
        action={
          <button
            onClick={() => onNavigate("news")}
            className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
          >
            Все новости <ArrowRight className="h-3.5 w-3.5" />
          </button>
        }
      >
        {news.isLoading ? (
          <LoadingBlock lines={3} />
        ) : news.data ? (
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {news.data.items.slice(0, 4).map((item) => (
              <a
                key={item.id}
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex flex-col justify-between rounded-xl border border-border/60 bg-secondary/40 p-3 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:bg-accent hover:shadow-sm"
              >
                <p className="text-sm font-medium leading-snug transition-colors group-hover:text-primary">
                  {item.title}
                </p>
                <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                  {item.date ?? ""} {item.rubric ? `· ${item.rubric}` : ""}
                  <ArrowRight className="ml-auto h-3.5 w-3.5 shrink-0 -translate-x-1 opacity-0 transition-all duration-200 group-hover:translate-x-0 group-hover:opacity-100" />
                </p>
              </a>
            ))}
          </div>
        ) : (
          <ErrorCard message="Новости временно недоступны" onRetry={() => news.refetch()} />
        )}
      </SectionCard>

      <p className="px-1 text-xs text-muted-foreground">
        Сегодня {humanDate(today)} · Данные обновляются автоматически: sesc.nsu.ru, table-sesc.nsu.ru, Open-Meteo
      </p>
    </div>
  );
}

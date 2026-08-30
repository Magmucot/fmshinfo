"use client";

/** Раздел «Аналитика»: тренд калорий за дни, распределение по приёмам пищи, калькулятор «Мой выбор» */

import { useCallback, useMemo, useSyncExternalStore } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BarChart3, Flame, TrendingUp, TrendingDown, Scale, CheckSquare, Square, Trash2, Utensils, Sparkles,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useMenu, useMenuStats } from "../api";
import { ErrorCard, LoadingBlock, MacroPills, SectionCard, StaleBadge, humanDate } from "../shared";
import { WEEKDAYS_SHORT, fmtRu, nowNsk } from "../types";
import type { Dish } from "../types";

const STORAGE_KEY = "sunc-info:my-plate";

interface PickedDish {
  name: string;
  kcal: number | null;
  protein: number | null;
  fat: number | null;
  carbs: number | null;
  weight: number | null;
}

const pickedKey = (d: PickedDish) => `${d.name}|${d.kcal ?? ""}|${d.weight ?? ""}`;

/** Хранилище выбора блюд в localStorage (hydration-safe через useSyncExternalStore) */
function usePickedDishes(): [PickedDish[], (next: PickedDish[]) => void] {
  const subscribe = useCallback((onChange: () => void) => {
    window.addEventListener("storage", onChange);
    window.addEventListener("sunc-plate-change", onChange);
    return () => {
      window.removeEventListener("storage", onChange);
      window.removeEventListener("sunc-plate-change", onChange);
    };
  }, []);

  const getSnapshot = useCallback(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) ?? "[]";
    } catch {
      return "[]";
    }
  }, []);

  const raw = useSyncExternalStore(subscribe, getSnapshot, () => "[]");

  const value = useMemo<PickedDish[]>(() => {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }, [raw]);

  const setValue = useCallback((next: PickedDish[]) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* приватный режим — просто в памяти */
    }
    window.dispatchEvent(new Event("sunc-plate-change"));
  }, []);

  return [value, setValue];
}

/** Столбчатый график ккал по дням (CSS, без библиотек) */
function KcalChart({
  days,
  today,
  avgKcal,
}: {
  days: Array<{ date: string; kcal: number | null }>;
  today: string;
  avgKcal: number | null;
}) {
  const valid = days.filter((d) => typeof d.kcal === "number" && d.kcal > 0) as Array<{ date: string; kcal: number }>;
  if (!valid.length) return null;

  const max = Math.max(...valid.map((d) => d.kcal));
  const min = Math.min(...valid.map((d) => d.kcal));
  /** высота столбца в % от трека */
  const scale = (v: number) => Math.max(4, (v / max) * 100);

  return (
    <div>
      <div className="relative" style={{ height: 210 }}>
        {/* Область треков: значение сверху (16px) + трек + даты снизу (32px) */}
        {avgKcal ? (
          <div className="pointer-events-none absolute inset-x-0 top-[20px] bottom-[36px]">
            <div
              className="absolute left-0 right-0 z-10 border-t border-dashed border-primary/60"
              style={{ bottom: `${Math.min(98, (avgKcal / max) * 100)}%` }}
            >
              <span className="absolute -top-2.5 right-0 rounded-md border border-primary/30 bg-background px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-primary shadow-sm">
                ср. {avgKcal}
              </span>
            </div>
          </div>
        ) : null}

        <div className="flex h-full items-stretch gap-1.5 sm:gap-2.5">
          {days.map((d) => {
            const isToday = d.date === today;
            const isMax = d.kcal === max;
            const isMin = d.kcal === min;
            const dayIdx = Number(d.date.slice(0, 2));
            const weekday = WEEKDAYS_SHORT[
              new Date(Number(d.date.slice(6, 10)), Number(d.date.slice(3, 5)) - 1, dayIdx).getDay()
            ];
            return (
              <div key={d.date} className="group flex h-full flex-1 flex-col items-center">
                {/* Значение над столбцом */}
                <span
                  className={`h-4 shrink-0 text-[10px] font-bold leading-4 tabular-nums transition-colors ${
                    isToday ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
                  }`}
                >
                  {d.kcal ?? "—"}
                </span>

                {/* Трек с столбцом */}
                <div className="relative mt-1 w-full max-w-[46px] flex-1">
                  <div
                    title={`${d.date}${d.kcal ? `: ${d.kcal} ккал` : ": нет данных"}`}
                    className={`absolute inset-x-0 bottom-0 rounded-t-lg transition-all duration-300 group-hover:brightness-110 ${
                      d.kcal === null
                        ? "bg-muted"
                        : isToday
                          ? "bg-gradient-to-t from-orange-500 to-amber-400 shadow-md shadow-amber-500/30"
                          : isMax
                            ? "bg-gradient-to-t from-rose-500/90 to-rose-400/90"
                            : isMin
                              ? "bg-gradient-to-t from-emerald-500/90 to-emerald-400/90"
                              : "bg-gradient-to-t from-primary/70 to-primary/50"
                    }`}
                    style={{ height: d.kcal ? `${scale(d.kcal)}%` : "3px" }}
                  />
                </div>

                {/* Дата и день недели */}
                <div className="mt-1.5 flex h-8 shrink-0 flex-col items-center justify-start">
                  <span
                    className={`text-[10px] font-semibold leading-4 tabular-nums ${
                      isToday ? "text-primary" : "text-muted-foreground"
                    }`}
                  >
                    {dayIdx}
                  </span>
                  <span
                    className={`text-[9px] leading-4 uppercase ${
                      isToday ? "font-bold text-primary" : "text-muted-foreground"
                    }`}
                  >
                    {weekday}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-gradient-to-t from-orange-500 to-amber-400" /> сегодня
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-rose-500/90" /> максимум
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500/90" /> минимум
        </span>
        <span className="ml-auto">ккал в день</span>
      </div>
    </div>
  );
}

/** Калькулятор «Мой выбор»: отметить блюда → живые итоги */
function MyPlate({ dishes }: { dishes: Array<{ meal: string; dish: Dish }> }) {
  const [picked, persist] = usePickedDishes();

  const totals = picked.reduce(
    (acc, d) => ({
      kcal: acc.kcal + (d.kcal ?? 0),
      protein: acc.protein + (d.protein ?? 0),
      fat: acc.fat + (d.fat ?? 0),
      carbs: acc.carbs + (d.carbs ?? 0),
    }),
    { kcal: 0, protein: 0, fat: 0, carbs: 0 }
  );

  const pickedKeys = useMemo(() => new Set(picked.map(pickedKey)), [picked]);

  const toggle = (dish: Dish) => {
    const candidate: PickedDish = {
      name: dish.name,
      kcal: dish.kcal,
      protein: dish.protein,
      fat: dish.fat,
      carbs: dish.carbs,
      weight: dish.weight,
    };
    const k = pickedKey(candidate);
    if (pickedKeys.has(k)) {
      persist(picked.filter((p) => pickedKey(p) !== k));
    } else {
      persist([...picked, candidate]);
    }
  };

  const dayKcal = 2500; // ориентир для школьника 14–18 лет
  const share = Math.min(100, Math.round((totals.kcal / dayKcal) * 100));

  return (
    <div className="space-y-4">
      {/* Итоги выбора */}
      <div className="rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/10 via-transparent to-transparent p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-extrabold tabular-nums tracking-tight">
              {picked.length ? Math.round(totals.kcal) : 0}
            </span>
            <span className="text-sm text-muted-foreground">ккал в моей тарелке</span>
          </div>
          {picked.length ? (
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 rounded-xl text-muted-foreground hover:text-destructive"
              onClick={() => {
                persist([]);
                toast({ title: "Тарелка очищена" });
              }}
            >
              <Trash2 className="h-3.5 w-3.5" /> Очистить
            </Button>
          ) : null}
        </div>

        {picked.length ? (
          <>
            <div className="mt-3 flex items-center gap-3">
              <Progress value={share} className="h-2.5" />
              <span className="shrink-0 text-xs font-semibold tabular-nums text-muted-foreground">
                {share}% от ~{dayKcal}
              </span>
            </div>
            <div className="mt-3">
              <MacroPills
                totals={{
                  kcal: Math.round(totals.protein),
                  protein: Math.round(totals.protein),
                  fat: Math.round(totals.fat),
                  carbs: Math.round(totals.carbs),
                }}
                size="md"
              />
            </div>
            <ul className="mt-3 space-y-1">
              {picked.map((p, i) => (
                <li key={i} className="flex items-center justify-between gap-2 rounded-lg bg-background/60 px-2.5 py-1.5 text-xs">
                  <span className="truncate font-medium">{p.name}</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {p.kcal !== null ? `${p.kcal} ккал` : ""}
                    {p.weight ? ` · ${p.weight} г` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="mt-2 text-xs text-muted-foreground">
            Отметьте блюда из меню ниже — итоги посчитаются автоматически и сохранятся на этом устройстве.
          </p>
        )}
      </div>

      {/* Список блюд для выбора */}
      {dishes.length ? (
        <div className="max-h-96 space-y-3 overflow-y-auto pr-1 custom-scroll">
          {dishes.map(({ meal, dish }, i) => {
            const candidate: PickedDish = {
              name: dish.name,
              kcal: dish.kcal,
              protein: dish.protein,
              fat: dish.fat,
              carbs: dish.carbs,
              weight: dish.weight,
            };
            const active = pickedKeys.has(pickedKey(candidate));
            return (
              <button
                key={i}
                onClick={() => toggle(dish)}
                className={`flex w-full items-center justify-between gap-2.5 rounded-xl border px-3 py-2 text-left transition-all duration-200 ${
                  active
                    ? "border-primary/50 bg-primary/10 shadow-sm"
                    : "border-border/60 bg-secondary/30 hover:border-primary/30 hover:bg-secondary/50"
                }`}
              >
                <span className="flex min-w-0 items-center gap-2.5">
                  {active ? (
                    <CheckSquare className="h-4 w-4 shrink-0 text-primary" />
                  ) : (
                    <Square className="h-4 w-4 shrink-0 text-muted-foreground/60" />
                  )}
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{dish.name}</span>
                    <span className="block text-[10.5px] uppercase tracking-wide text-muted-foreground">{meal}</span>
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-xs font-bold tabular-nums text-primary">
                    {dish.kcal !== null ? `${dish.kcal} ккал` : "—"}
                  </span>
                  {dish.weight !== null ? (
                    <span className="block text-[10px] tabular-nums text-muted-foreground">{dish.weight} г</span>
                  ) : null}
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <LoadingBlock lines={4} />
      )}
    </div>
  );
}

export function AnalyticsSection() {
  const stats = useMenuStats(10);
  const menu = useMenu();
  const today = fmtRu(nowNsk());

  const dishChoices = useMemo(() => {
    if (!menu.data?.meals.length) return [];
    return menu.data.meals.flatMap((meal) =>
      meal.dishes.map((dish) => ({ meal: meal.type, dish }))
    );
  }, [menu.data]);

  return (
    <div className="space-y-4">
      <SectionCard
        title="Калории за 10 дней"
        icon={<BarChart3 className="h-4 w-4" />}
        action={<StaleBadge stale={stats.data?.stale} />}
      >
        {stats.isLoading ? (
          <div>
            <div className="flex items-end gap-2" style={{ height: 190 }} aria-hidden>
              {Array.from({ length: 10 }).map((_, i) => (
                <Skeleton key={i} className="flex-1 rounded-t-lg" style={{ height: `${30 + ((i * 37) % 60)}%` }} />
              ))}
            </div>
            <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
              <span className="h-1.5 w-1.5 animate-soft-pulse rounded-full bg-primary" />
              Собираем меню за 10 дней: разбираем PDF-меню каждого дня, первый запуск может занять до минуты…
            </p>
          </div>
        ) : stats.isError ? (
          <ErrorCard
            message={(stats.error as Error)?.message ?? "Статистика временно недоступна"}
            onRetry={() => stats.refetch()}
          />
        ) : stats.data ? (
          <KcalChart days={stats.data.days} today={stats.data.today} avgKcal={stats.data.avg.kcal} />
        ) : null}
      </SectionCard>

      {/* Сводка: средние, мин, макс */}
      {stats.data && !stats.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-border/70 bg-card p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Scale className="h-4 w-4 text-primary" />
              <span className="text-xs font-semibold uppercase tracking-wider">Среднее</span>
            </div>
            <p className="mt-2 text-2xl font-extrabold tabular-nums">
              {stats.data.avg.kcal ?? "—"}
              <span className="text-sm font-semibold text-muted-foreground"> ккал/день</span>
            </p>
            <div className="mt-2">
              <MacroPills totals={stats.data.avg} />
            </div>
            <p className="mt-1.5 text-[11px] text-muted-foreground">Б — белки · Ж — жиры · У — углеводы, г/день</p>
          </div>

          <div className="rounded-2xl border border-border/70 bg-card p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
            <div className="flex items-center gap-2 text-muted-foreground">
              <TrendingDown className="h-4 w-4 text-emerald-600" />
              <span className="text-xs font-semibold uppercase tracking-wider">Минимум</span>
            </div>
            <p className="mt-2 text-2xl font-extrabold tabular-nums">
              {stats.data.min.kcal ?? "—"}
              <span className="text-sm font-semibold text-muted-foreground"> ккал</span>
            </p>
            <p className="mt-1.5 text-xs text-muted-foreground">
              {stats.data.min.date ? humanDate(stats.data.min.date) : "нет данных"}
            </p>
          </div>

          <div className="rounded-2xl border border-border/70 bg-card p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
            <div className="flex items-center gap-2 text-muted-foreground">
              <TrendingUp className="h-4 w-4 text-rose-600" />
              <span className="text-xs font-semibold uppercase tracking-wider">Максимум</span>
            </div>
            <p className="mt-2 text-2xl font-extrabold tabular-nums">
              {stats.data.max.kcal ?? "—"}
              <span className="text-sm font-semibold text-muted-foreground"> ккал</span>
            </p>
            <p className="mt-1.5 text-xs text-muted-foreground">
              {stats.data.max.date ? humanDate(stats.data.max.date) : "нет данных"}
            </p>
          </div>
        </div>
      ) : null}

      {/* Распределение по приёмам пищи */}
      {stats.data?.mealAverages.length ? (
        <SectionCard title="Калории по приёмам пищи" icon={<Sparkles className="h-4 w-4" />}>
          <div className="space-y-3">
            {stats.data.mealAverages.map((m) => (
              <div key={m.type}>
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="flex items-center gap-1.5 font-semibold">
                    <Utensils className="h-3.5 w-3.5 text-primary/70" />
                    {m.type}
                  </span>
                  <span className="tabular-nums text-muted-foreground">
                    <span className="font-bold text-foreground">{m.kcal}</span> ккал · {m.share}%
                  </span>
                </div>
                <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-secondary">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-amber-400 to-orange-500 transition-all duration-500"
                    style={{ width: `${m.share}%` }}
                  />
                </div>
              </div>
            ))}
            <p className="pt-1 text-xs text-muted-foreground">
              Средние значения за {stats.data.days.filter((d) => d.ok).length} дней по данным меню столовой
            </p>
          </div>
        </SectionCard>
      ) : null}

      {/* Калькулятор «Мой выбор» */}
      <SectionCard title="Мой выбор — калькулятор калорий" icon={<Flame className="h-4 w-4" />}>
        {menu.isLoading ? (
          <LoadingBlock lines={5} />
        ) : menu.isError ? (
          <ErrorCard message="Меню недоступно — калькулятор работает по данным меню" onRetry={() => menu.refetch()} />
        ) : (
          <MyPlate dishes={dishChoices} />
        )}
      </SectionCard>

      <p className="px-1 text-xs text-muted-foreground">
        Дни без опубликованного меню не учитываются. Ориентир ~2500 ккал/день — усреднённая норма для школьников
        14–18 лет; индивидуальные значения может отличаться.
      </p>
      <Badge variant="outline" className="hidden">
        {today}
      </Badge>
    </div>
  );
}

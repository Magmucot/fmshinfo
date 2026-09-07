"use client";

/** Раздел «Столовая»: полное меню на день с КБЖУ, поиском, фильтрами и аллергенами.
 *  Внутри раздела — переключатель «Меню / Аналитика» (аналитика питания перенесена сюда). */

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  BarChart3, ChevronDown, ChevronLeft, ChevronRight, Clock, ExternalLink, FileText, Utensils, Flame, Info,
  Search, Share2, X, Leaf, Milk, Wheat, Egg, Fish, Nut, Dumbbell,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useMenu } from "../api";
import { ErrorCard, LoadingBlock, MacroPills, SectionCard, StaleBadge, humanDate } from "../shared";
import type { CanteenView } from "../app";
import { AnalyticsSection } from "./analytics";
import { CanteenScheduleView } from "./canteen-schedule";
import type { Dish, MealSection } from "../types";
import {
  ALLERGENS, DISH_FILTERS, analyzeDish, dishMatchesQuery, menuToShareText, splitHighlight,
} from "../nutrition";
import type { DishFilterId } from "../nutrition";

/** Сегментированный переключатель «Меню / График смен / Аналитика» вверху раздела «Столовая» */
function CanteenViewSwitch({ view, onChange }: { view: CanteenView; onChange: (v: CanteenView) => void }) {
  const items: Array<{ id: CanteenView; label: string; icon: React.ComponentType<{ className?: string }> }> = [
    { id: "menu", label: "Меню", icon: Utensils },
    { id: "schedule", label: "График смен", icon: Clock },
    { id: "analytics", label: "Аналитика", icon: BarChart3 },
  ];
  return (
    <div
      role="tablist"
      aria-label="Режим раздела «Столовая»"
      className="flex w-full max-w-sm items-center gap-1 rounded-2xl border border-border/70 bg-secondary/40 p-1"
    >
      {items.map(({ id, label, icon: Icon }) => {
        const active = view === id;
        return (
          <button
            key={id}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(id)}
            className={`flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl text-sm font-semibold outline-none transition-all duration-200 focus-visible:ring-2 focus-visible:ring-ring ${
              active
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-secondary hover:text-foreground"
            }`}
          >
            <Icon className={`h-4 w-4 transition-transform duration-200 ${active ? "scale-110" : ""}`} />
            {label}
          </button>
        );
      })}
    </div>
  );
}

const ALLERGEN_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  milk: Milk,
  gluten: Wheat,
  egg: Egg,
  fish: Fish,
  nuts: Nut,
};

/** Небольшие значки аллергенов блюда */
function AllergenDots({ ids }: { ids: string[] }) {
  if (!ids.length) return null;
  return (
    <TooltipProvider delayDuration={200}>
      <span className="flex items-center gap-1">
        {ids.map((id) => {
          const def = ALLERGENS.find((a) => a.id === id);
          const Icon = ALLERGEN_ICONS[id];
          if (!def || !Icon) return null;
          return (
            <Tooltip key={id}>
              <TooltipTrigger asChild>
                <span className="flex h-4 w-4 items-center justify-center rounded text-muted-foreground/70" aria-label={`Содержит: ${def.label}`}>
                  <Icon className="h-3 w-3" />
                </span>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">
                содержит: {def.label}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </span>
    </TooltipProvider>
  );
}

function HighlightedName({ name, query }: { name: string; query: string }) {
  const parts = splitHighlight(name, query);
  if (!query.trim()) return <>{name}</>;
  return (
    <>
      {parts.map((p, i) =>
        p.hit ? (
          <mark key={i} className="rounded bg-primary/25 px-0.5 text-inherit">{p.text}</mark>
        ) : (
          <span key={i}>{p.text}</span>
        )
      )}
    </>
  );
}

function KbjuBadges({ dish }: { dish: Dish }) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-1">
      {dish.kcal !== null ? (
        <Badge variant="outline" className="gap-0.5 border-primary/25 bg-primary/5 text-primary text-[11px] tabular-nums">
          <Flame className="h-3 w-3" /> {dish.kcal}
        </Badge>
      ) : null}
      {dish.protein !== null ? (
        <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-[11px] tabular-nums">
          Б {dish.protein}
        </Badge>
      ) : null}
      {dish.fat !== null ? (
        <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400 text-[11px] tabular-nums">
          Ж {dish.fat}
        </Badge>
      ) : null}
      {dish.carbs !== null ? (
        <Badge variant="outline" className="border-teal-500/30 bg-teal-500/10 text-teal-700 dark:text-teal-400 text-[11px] tabular-nums">
          У {dish.carbs}
        </Badge>
      ) : null}
    </div>
  );
}

function DishRow({ dish, query }: { dish: Dish; query: string }) {
  const flags = useMemo(() => analyzeDish(dish), [dish]);
  return (
    <div className="group rounded-xl border border-border/60 bg-secondary/30 p-3 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:bg-secondary/50 hover:shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-snug">
            <HighlightedName name={dish.name} query={query} />
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {flags.vegetarian ? (
              <Badge variant="outline" className="gap-0.5 border-emerald-500/35 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-[10px]">
                <Leaf className="h-3 w-3" /> вегет
              </Badge>
            ) : null}
            {flags.highProtein ? (
              <Badge variant="outline" className="gap-0.5 border-orange-500/35 bg-orange-500/10 text-orange-700 dark:text-orange-400 text-[10px]">
                <Dumbbell className="h-3 w-3" /> белковое
              </Badge>
            ) : null}
            <AllergenDots ids={flags.allergens} />
          </div>
          {dish.ingredients ? (
            <Collapsible>
              <CollapsibleTrigger className="mt-1.5 flex items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground">
                <ChevronDown className="h-3 w-3 transition-transform duration-200 group-data-[state=open]:rotate-180" />
                Состав
              </CollapsibleTrigger>
              <CollapsibleContent>
                <p className="mt-1 rounded-lg bg-muted px-2.5 py-2 text-[11px] leading-relaxed text-muted-foreground">
                  {dish.ingredients}
                </p>
              </CollapsibleContent>
            </Collapsible>
          ) : null}
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          {dish.weight !== null ? (
            <Badge variant="outline" className="tabular-nums text-[11px]">{dish.weight} г</Badge>
          ) : null}
          <KbjuBadges dish={dish} />
        </div>
      </div>
    </div>
  );
}

/** Аккордеонная секция приёма пищи с заголовком-градиентом */
function MealBlock({ meal, query, activeFilters }: { meal: MealSection; query: string; activeFilters: number }) {
  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-2">
        <h3 className="flex items-center gap-2 text-sm font-extrabold uppercase tracking-wider text-primary">
          <Utensils className="h-4 w-4" />
          {meal.type}
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-bold normal-case tracking-normal text-primary">
            {meal.dishes.length}
          </span>
        </h3>
        {meal.totals?.kcal ? (
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Flame className="h-3.5 w-3.5 text-primary" />
              <span className="tabular-nums font-bold text-foreground">{meal.totals.kcal} ккал</span>
            </span>
            <span className="hidden sm:block">
              <MacroPills totals={meal.totals} />
            </span>
          </div>
        ) : null}
      </div>
      <div className="grid min-w-0 grid-cols-1 gap-2 md:grid-cols-2">
        {meal.dishes.map((dish, i) => (
          <DishRow key={i} dish={dish} query={query} />
        ))}
      </div>
      {activeFilters > 0 ? null : <span className="sr-only">Фильтры активны</span>}
    </div>
  );
}

export function CanteenSection({ view = "menu", onViewChange }: { view?: CanteenView; onViewChange?: (v: CanteenView) => void }) {
  const [selectedDate, setSelectedDate] = useState<string>("__today__");
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<Set<DishFilterId>>(new Set());
  const menu = useMenu(selectedDate === "__today__" ? undefined : selectedDate);
  const setView = onViewChange ?? (() => {});

  const dates = menu.data?.availableDates ?? [];
  const currentIndex = menu.data ? dates.indexOf(menu.data.date) : -1;

  const gotoDate = (offset: number) => {
    const next = currentIndex + offset;
    if (next >= 0 && next < dates.length) setSelectedDate(dates[next]);
  };

  /** Отфильтрованные секции приёмов пищи */
  const filteredMeals = useMemo(() => {
    if (!menu.data) return [];
    const active = DISH_FILTERS.filter((f) => filters.has(f.id));
    return menu.data.meals
      .map((meal) => ({
        ...meal,
        dishes: meal.dishes.filter((dish) => {
          if (!dishMatchesQuery(dish, query)) return false;
          const flags = analyzeDish(dish);
          return active.every((f) => f.match(dish, flags));
        }),
      }))
      .filter((meal) => meal.dishes.length > 0);
  }, [menu.data, query, filters]);

  const totalBefore = menu.data?.meals.reduce((acc, m) => acc + m.dishes.length, 0) ?? 0;
  const totalAfter = filteredMeals.reduce((acc, m) => acc + m.dishes.length, 0);
  const filtering = query.trim().length > 0 || filters.size > 0;

  const toggleFilter = (id: DishFilterId) => {
    setFilters((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const shareMenu = async () => {
    if (!menu.data) return;
    const text = menuToShareText(menu.data.date, menu.data.meals, menu.data.dayTotals?.kcal ?? null);
    try {
      if (navigator.share) {
        await navigator.share({ title: `Меню столовой на ${menu.data.date}`, text });
      } else {
        await navigator.clipboard.writeText(text);
        toast({ title: "Меню скопировано", description: "Текст меню в буфере обмена — можно отправить друзьям" });
      }
    } catch {
      try {
        await navigator.clipboard.writeText(text);
        toast({ title: "Меню скопировано", description: "Текст меню в буфере обмена" });
      } catch {
        toast({ title: "Не удалось поделиться", variant: "destructive" });
      }
    }
  };

  return (
    <div className="space-y-4">
      {/* Переключатель Меню / Аналитика */}
      <CanteenViewSwitch view={view} onChange={setView} />

      {view === "schedule" ? (
        <CanteenScheduleView />
      ) : view === "analytics" ? (
        <AnalyticsSection />
      ) : (
      <>
      <SectionCard
        title="Меню столовой"
        icon={<Utensils className="h-4 w-4" />}
        action={<StaleBadge stale={menu.data?.stale} />}
      >
        {/* Дата: назад/вперёд + выбор + сегодня */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9 rounded-xl"
              onClick={() => gotoDate(-1)}
              disabled={currentIndex <= 0}
              aria-label="Предыдущий день с меню"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            {menu.data && dates.length > 0 ? (
              <Select value={menu.data.date} onValueChange={setSelectedDate}>
                <SelectTrigger className="w-[160px] rounded-xl">
                  <SelectValue placeholder="Дата" />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {dates.map((d) => (
                    <SelectItem key={d} value={d}>
                      {d}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Skeleton className="h-9 w-[160px] rounded-xl" />
            )}
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9 rounded-xl"
              onClick={() => gotoDate(1)}
              disabled={currentIndex < 0 || currentIndex >= dates.length - 1}
              aria-label="Следующий день с меню"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          {selectedDate !== "__today__" ? (
            <Button variant="ghost" size="sm" className="rounded-xl text-primary" onClick={() => setSelectedDate("__today__")}>
              Сегодня
            </Button>
          ) : null}

          <div className="ml-auto flex items-center gap-2">
            {menu.data?.pdfUrl ? (
              <Button variant="outline" size="sm" asChild className="gap-1.5 rounded-xl">
                <a href={menu.data.pdfUrl} target="_blank" rel="noopener noreferrer">
                  <FileText className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Оригинал (PDF)</span>
                  <span className="sm:hidden">PDF</span>
                  <ExternalLink className="h-3 w-3 opacity-60" />
                </a>
              </Button>
            ) : null}
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 rounded-xl"
              onClick={shareMenu}
              disabled={!menu.data?.meals.length}
            >
              <Share2 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Поделиться</span>
            </Button>
          </div>
        </div>

        {/* Поиск и фильтры */}
        {menu.data?.meals.length ? (
          <div className="mt-3 space-y-2.5">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Поиск блюда или состава…"
                className="rounded-xl pl-9 pr-9"
                aria-label="Поиск по блюдам"
              />
              {query ? (
                <button
                  onClick={() => setQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-0.5 text-muted-foreground transition-colors hover:text-foreground"
                  aria-label="Очистить поиск"
                >
                  <X className="h-4 w-4" />
                </button>
              ) : null}
            </div>
            <div className="-mx-1 flex items-center gap-1.5 overflow-x-auto px-1 pb-1 no-scrollbar sm:flex-wrap sm:overflow-visible">
              {DISH_FILTERS.map((f) => {
                const active = filters.has(f.id);
                return (
                  <button
                    key={f.id}
                    onClick={() => toggleFilter(f.id)}
                    aria-pressed={active}
                    className={`h-9 shrink-0 rounded-full border px-3.5 text-xs font-semibold transition-all duration-200 ${
                      active
                        ? "border-primary/50 bg-primary text-primary-foreground shadow-sm"
                        : "border-border/70 bg-secondary/40 text-muted-foreground hover:border-primary/30 hover:text-foreground"
                    }`}
                  >
                    {f.label}
                  </button>
                );
              })}
              {filtering ? (
                <button
                  onClick={() => {
                    setQuery("");
                    setFilters(new Set());
                  }}
                  className="flex h-9 shrink-0 items-center gap-1 rounded-full border border-border/70 px-3.5 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" /> Сбросить
                </button>
              ) : null}
            </div>
          </div>
        ) : null}

        {menu.data?.substituted && menu.data.message ? (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{menu.data.message}</span>
          </div>
        ) : null}

        <p className="mt-3 text-xs text-muted-foreground">
          Источник:{" "}
          <a
            href="https://sesc.nsu.ru/sveden/catering"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            sesc.nsu.ru → Питание
          </a>
        </p>
      </SectionCard>

      {menu.isLoading ? (
        <SectionCard>
          <LoadingBlock lines={8} />
        </SectionCard>
      ) : menu.isError ? (
        <SectionCard>
          <ErrorCard message={(menu.error as Error)?.message ?? "Меню временно недоступно"} onRetry={() => menu.refetch()} />
        </SectionCard>
      ) : menu.data ? (
        <>
          {filtering && totalBefore > 0 ? (
            <p className="px-1 text-xs font-medium text-muted-foreground" role="status">
              Найдено блюд: <span className="font-bold text-primary">{totalAfter}</span> из {totalBefore}
            </p>
          ) : null}

          {menu.data.meals.length ? (
            filteredMeals.length ? (
              <div className="space-y-4">
                {filteredMeals.map((meal, i) => (
                  <SectionCard key={i}>
                    <MealBlock meal={meal} query={query} activeFilters={filters.size} />
                  </SectionCard>
                ))}

                <SectionCard title={`Итоги дня — ${menu.data.date}`} icon={<Flame className="h-4 w-4" />}>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <div className="rounded-xl bg-primary/10 p-3 text-center transition-transform hover:scale-[1.02]">
                      <p className="text-2xl font-extrabold tabular-nums text-primary">
                        {menu.data.dayTotals?.kcal ?? "—"}
                      </p>
                      <p className="text-xs text-muted-foreground">ккал</p>
                    </div>
                    <div className="rounded-xl bg-emerald-500/10 p-3 text-center transition-transform hover:scale-[1.02]">
                      <p className="text-2xl font-extrabold tabular-nums text-emerald-700 dark:text-emerald-400">
                        {menu.data.dayTotals?.protein ?? "—"}
                      </p>
                      <p className="text-xs text-muted-foreground">белки, г</p>
                    </div>
                    <div className="rounded-xl bg-amber-500/10 p-3 text-center transition-transform hover:scale-[1.02]">
                      <p className="text-2xl font-extrabold tabular-nums text-amber-700 dark:text-amber-400">
                        {menu.data.dayTotals?.fat ?? "—"}
                      </p>
                      <p className="text-xs text-muted-foreground">жиры, г</p>
                    </div>
                    <div className="rounded-xl bg-teal-500/10 p-3 text-center transition-transform hover:scale-[1.02]">
                      <p className="text-2xl font-extrabold tabular-nums text-teal-700 dark:text-teal-400">
                        {menu.data.dayTotals?.carbs ?? "—"}
                      </p>
                      <p className="text-xs text-muted-foreground">углеводы, г</p>
                    </div>
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground">
                    {humanDate(menu.data.date)} · шестиразовое питание · столовая: ул. Пирогова 11/2, +7 (383) 363-43-97
                  </p>
                </SectionCard>
              </div>
            ) : (
              <SectionCard>
                <div className="flex flex-col items-center gap-2 py-8 text-center">
                  <Search className="h-8 w-8 text-muted-foreground/50" />
                  <p className="text-sm font-semibold">Ничего не найдено</p>
                  <p className="max-w-sm text-xs text-muted-foreground">
                    По запросу{query.trim() ? ` «${query.trim()}»` : ""} и выбранным фильтрам блюд нет. Попробуйте
                    изменить запрос или сбросить фильтры.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-1 rounded-xl"
                    onClick={() => {
                      setQuery("");
                      setFilters(new Set());
                    }}
                  >
                    Сбросить всё
                  </Button>
                </div>
              </SectionCard>
            )
          ) : (
            <SectionCard>
              <p className="py-6 text-center text-sm text-muted-foreground">
                Меню не опубликовано или не удалось разобрать PDF
              </p>
            </SectionCard>
          )}
        </>
      ) : null}
      </>
      )}
    </div>
  );
}

"use client";

/** Раздел «Столовая»: полное меню на день с КБЖУ и ингредиентами */

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ExternalLink, FileText, Utensils, Flame, Info } from "lucide-react";
import { useMenu } from "../api";
import { ErrorCard, LoadingBlock, SectionCard, StaleBadge, humanDate } from "../shared";
import type { Dish, MealSection } from "../types";

function KbjuBadges({ dish }: { dish: Dish }) {
  const hasAny = dish.kcal !== null || dish.protein !== null || dish.fat !== null || dish.carbs !== null;
  if (!hasAny) return null;
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1">
      {dish.kcal !== null ? (
        <Badge variant="outline" className="gap-0.5 border-primary/25 bg-primary/5 text-primary text-[11px]">
          <Flame className="h-3 w-3" /> {dish.kcal}
        </Badge>
      ) : null}
      {dish.protein !== null ? <Badge variant="secondary" className="text-[11px]">Б {dish.protein}</Badge> : null}
      {dish.fat !== null ? <Badge variant="secondary" className="text-[11px]">Ж {dish.fat}</Badge> : null}
      {dish.carbs !== null ? <Badge variant="secondary" className="text-[11px]">У {dish.carbs}</Badge> : null}
    </div>
  );
}

function DishRow({ dish }: { dish: Dish }) {
  return (
    <div className="rounded-xl border border-border/60 bg-secondary/30 p-3 transition-colors hover:border-primary/30">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-snug">{dish.name}</p>
          {dish.ingredients ? (
            <Collapsible>
              <CollapsibleTrigger className="mt-1.5 flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors">
                <ChevronDown className="h-3 w-3" />
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

function MealBlock({ meal }: { meal: MealSection }) {
  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-bold text-primary">
          <Utensils className="h-4 w-4" />
          {meal.type}
          <span className="text-xs font-medium text-muted-foreground">({meal.dishes.length})</span>
        </h3>
        {meal.totals?.kcal ? (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Flame className="h-3.5 w-3.5 text-primary" />
            <span className="tabular-nums font-semibold text-foreground">{meal.totals.kcal} ккал</span>
            <span className="hidden sm:inline tabular-nums">
              · Б{meal.totals.protein ?? "—"} Ж{meal.totals.fat ?? "—"} У{meal.totals.carbs ?? "—"}
            </span>
          </div>
        ) : null}
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        {meal.dishes.map((dish, i) => (
          <DishRow key={i} dish={dish} />
        ))}
      </div>
    </div>
  );
}

export function CanteenSection() {
  const [selectedDate, setSelectedDate] = useState<string>("__today__");
  const menu = useMenu(selectedDate === "__today__" ? undefined : selectedDate);

  return (
    <div className="space-y-4">
      <SectionCard
        title="Меню столовой"
        icon={<Utensils className="h-4 w-4" />}
        action={<StaleBadge stale={menu.data?.stale} />}
      >
        <div className="flex flex-wrap items-center gap-3">
          {menu.data && menu.data.availableDates.length > 0 ? (
            <Select value={menu.data.date} onValueChange={setSelectedDate}>
              <SelectTrigger className="w-[190px]">
                <SelectValue placeholder="Дата" />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {menu.data.availableDates.map((d) => (
                  <SelectItem key={d} value={d}>
                    {d === menu.data?.date ? `${d}` : d}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Skeleton className="h-9 w-[190px]" />
          )}
          {menu.data?.pdfUrl ? (
            <Button variant="outline" size="sm" asChild className="gap-1.5">
              <a href={menu.data.pdfUrl} target="_blank" rel="noopener noreferrer">
                <FileText className="h-3.5 w-3.5" />
                Оригинал (PDF)
                <ExternalLink className="h-3 w-3 opacity-60" />
              </a>
            </Button>
          ) : null}
          <p className="text-xs text-muted-foreground">
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
        </div>

        {menu.data?.substituted && menu.data.message ? (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{menu.data.message}</span>
          </div>
        ) : null}
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
          {menu.data.meals.length ? (
            <div className="space-y-4">
              {menu.data.meals.map((meal, i) => (
                <SectionCard key={i}>
                  <MealBlock meal={meal} />
                </SectionCard>
              ))}

              <SectionCard title={`Итоги дня — ${menu.data.date}`} icon={<Flame className="h-4 w-4" />}>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="rounded-xl bg-primary/10 p-3 text-center">
                    <p className="text-2xl font-extrabold tabular-nums text-primary">
                      {menu.data.dayTotals?.kcal ?? "—"}
                    </p>
                    <p className="text-xs text-muted-foreground">ккал</p>
                  </div>
                  <div className="rounded-xl bg-secondary p-3 text-center">
                    <p className="text-2xl font-extrabold tabular-nums">{menu.data.dayTotals?.protein ?? "—"}</p>
                    <p className="text-xs text-muted-foreground">белки, г</p>
                  </div>
                  <div className="rounded-xl bg-secondary p-3 text-center">
                    <p className="text-2xl font-extrabold tabular-nums">{menu.data.dayTotals?.fat ?? "—"}</p>
                    <p className="text-xs text-muted-foreground">жиры, г</p>
                  </div>
                  <div className="rounded-xl bg-secondary p-3 text-center">
                    <p className="text-2xl font-extrabold tabular-nums">{menu.data.dayTotals?.carbs ?? "—"}</p>
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
              <p className="py-6 text-center text-sm text-muted-foreground">
                Меню не опубликовано или не удалось разобрать PDF
              </p>
            </SectionCard>
          )}
        </>
      ) : null}
    </div>
  );
}

"use client";

/**
 * График работы столовой по сменам (источник: rasp.jpg)
 */

import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Clock,
  Utensils,
  Calendar,
  AlertCircle,
  Users,
} from "lucide-react";
import { useCanteenSchedule, useClasses } from "../api";
import { SectionCard, LoadingBlock, ErrorCard } from "../shared";
import { useUserClass } from "../useUserClass";

export function CanteenScheduleView() {
  const [selectedClass, setSelectedClass] = useUserClass();
  const { data: scheduleData, isLoading, isError } = useCanteenSchedule(selectedClass);
  const { data: classesData } = useClasses();

  const classesList = useMemo(() => {
    if (classesData?.classes && classesData.classes.length > 0) {
      return classesData.classes;
    }
    return [
      "8-1",
      "9-1", "9-2", "9-3",
      "10-1", "10-2", "10-3", "10-4", "10-5", "10-6", "10-7", "10-8", "10-9",
      "11-1", "11-2", "11-3", "11-4", "11-5", "11-6", "11-7", "11-8", "11-9", "11-10", "11-11", "11-12",
    ];
  }, [classesData?.classes]);

  const parallels = useMemo(() => {
    const groups: { [key: string]: string[] } = { "8": [], "9": [], "10": [], "11": [] };
    classesList.forEach((c) => {
      const p = c.split("-")[0];
      if (groups[p]) groups[p].push(c);
      else {
        if (!groups[p]) groups[p] = [];
        groups[p].push(c);
      }
    });
    return groups;
  }, [classesList]);

  if (isLoading) {
    return <LoadingBlock lines={4} />;
  }

  if (isError || !scheduleData?.ok) {
    return <ErrorCard message="Не удалось загрузить график работы столовой" />;
  }

  const shifts = scheduleData.shifts;
  const currentStatus = scheduleData.currentStatus;
  const classSchedule = scheduleData.classSchedule;
  const userShift = classSchedule?.shift;

  return (
    <div className="space-y-6">
      {/* 1. Карточка живого статуса столовой (с учётом выбранного класса) */}
      <SectionCard
        contentClassName="relative overflow-hidden"
        title="Сейчас в столовой"
        icon={<Clock className="h-4 w-4 text-primary" />}
      >
        <div aria-hidden className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-primary/10 blur-2xl" />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="relative flex h-3 w-3">
                <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${
                  currentStatus.status === "active" ? "bg-emerald-400" : currentStatus.status === "duty" ? "bg-amber-400" : "bg-primary"
                }`} />
                <span className={`relative inline-flex h-3 w-3 rounded-full ${
                  currentStatus.status === "active" ? "bg-emerald-500" : currentStatus.status === "duty" ? "bg-amber-500" : "bg-primary"
                }`} />
              </span>
              <p className="text-base font-bold sm:text-lg">
                {currentStatus.description}
              </p>
            </div>
            {currentStatus.timeRange ? (
              <p className="mt-1 text-xs text-muted-foreground">
                Время приёма для {selectedClass} ({userShift}-я смена):{" "}
                <code className="rounded bg-primary/10 px-1.5 py-0.5 font-bold text-primary">
                  {currentStatus.timeRange}
                </code>
              </p>
            ) : null}
          </div>

          {currentStatus.nextMealName ? (
            <Badge variant="outline" className="h-7 border-primary/40 bg-primary/10 px-3 text-xs font-semibold text-primary">
              Далее: {currentStatus.nextMealName} ({currentStatus.nextMealTime})
            </Badge>
          ) : null}
        </div>
      </SectionCard>

      {/* 2. Выбор своего класса и персональный график */}
      <SectionCard
        title="Твоя смена и время приёмов пищи"
        icon={<Utensils className="h-4 w-4 text-primary" />}
      >
        <div className="mb-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-semibold flex items-center gap-1.5">
              <Users className="h-4 w-4 text-primary" />
              <span>Выбор твоего класса:</span>
            </span>
            <Badge variant="outline" className="border-primary/40 bg-primary/10 text-xs font-semibold text-primary">
              Выбран: {selectedClass} ({userShift ? `${userShift}-я смена` : ""})
            </Badge>
          </div>

          <div className="space-y-2 rounded-xl border border-border/60 bg-secondary/15 p-3">
            {Object.entries(parallels).map(([p, clsList]) => (
              <div key={p} className="flex flex-wrap items-center gap-1.5">
                <span className="w-16 shrink-0 text-xs font-bold text-muted-foreground">
                  {p} классы:
                </span>
                <div className="flex flex-wrap gap-1">
                  {clsList.map((c) => (
                    <Button
                      key={c}
                      size="sm"
                      variant={selectedClass === c ? "default" : "outline"}
                      className={`h-7 px-2 text-xs font-medium transition-all ${
                        selectedClass === c
                          ? "shadow-xs font-bold ring-2 ring-primary/40"
                          : "bg-card hover:bg-secondary/60"
                      }`}
                      onClick={() => setSelectedClass(c)}
                    >
                      {c}
                    </Button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {classSchedule ? (
          <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-primary/20 pb-3">
              <div>
                <p className="text-base font-bold">
                  Класс {classSchedule.className} относится к{" "}
                  <span className="text-primary">{classSchedule.shift}-й смене</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {shifts[classSchedule.shift]?.description}
                </p>
              </div>
              <Badge className="bg-primary text-primary-foreground font-bold">
                {classSchedule.shift}-я смена
              </Badge>
            </div>

            <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              {classSchedule.meals.map((m: any, idx: number) => {
                const isCurrent = currentStatus.status === "active" && currentStatus.currentMealName === m.meal;
                const isNext = currentStatus.nextMealName === m.meal;

                return (
                  <div
                    key={idx}
                    className={`flex flex-col justify-between rounded-xl border p-3 transition-all ${
                      isCurrent
                        ? "border-emerald-500/60 bg-emerald-500/10 ring-2 ring-emerald-500/30 shadow-sm"
                        : isNext
                        ? "border-primary/50 bg-primary/5 ring-1 ring-primary/20"
                        : "border-border/70 bg-card shadow-xs"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-bold">{m.meal}</span>
                        {isCurrent && (
                          <Badge className="bg-emerald-500 text-[10px] text-white px-1.5 py-0 h-4">
                            Сейчас
                          </Badge>
                        )}
                        {!isCurrent && isNext && (
                          <Badge variant="outline" className="border-primary/40 text-[10px] text-primary px-1.5 py-0 h-4">
                            Далее
                          </Badge>
                        )}
                      </div>
                      <Badge variant="outline" className="border-primary/40 bg-primary/10 text-xs font-semibold tabular-nums text-primary">
                        {m.time}
                      </Badge>
                    </div>
                    <div className="mt-2 space-y-1 text-[11px] text-muted-foreground">
                      <p>Дежурные: <span className="font-medium text-foreground">{m.duty}</span></p>
                      {m.late ? (
                        <p>Опоздавшие: <span className="font-medium text-foreground">{m.late}</span></p>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}
      </SectionCard>

      {/* 3. Сводная таблица графика смен (Пн - Сб) с подсветкой смены пользователя */}
      <SectionCard
        title="График работы столовой со 2 сентября (Будние дни)"
        icon={<Calendar className="h-4 w-4" />}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs sm:text-sm">
            <thead>
              <tr className="border-b border-border/80 text-muted-foreground">
                <th className="pb-2.5 font-semibold">Приём пищи</th>
                <th className="pb-2.5 font-semibold text-amber-600 dark:text-amber-400">Дежурные</th>
                <th className={`pb-2.5 font-semibold transition-colors ${userShift === 1 ? "text-primary font-bold bg-primary/10 px-2 rounded-t-lg" : ""}`}>
                  1-я смена {userShift === 1 && <span className="ml-1 text-[10px] font-normal text-primary">★ Твоя</span>}
                </th>
                <th className={`pb-2.5 font-semibold transition-colors ${userShift === 2 ? "text-primary font-bold bg-primary/10 px-2 rounded-t-lg" : ""}`}>
                  2-я смена {userShift === 2 && <span className="ml-1 text-[10px] font-normal text-primary">★ Твоя</span>}
                </th>
                <th className={`pb-2.5 font-semibold transition-colors ${userShift === 3 ? "text-primary font-bold bg-primary/10 px-2 rounded-t-lg" : ""}`}>
                  3-я смена {userShift === 3 && <span className="ml-1 text-[10px] font-normal text-primary">★ Твоя</span>}
                </th>
                <th className="pb-2.5 font-semibold text-rose-600 dark:text-rose-400">Опоздавшие</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              <tr className="hover:bg-secondary/30">
                <td className="py-2.5 font-bold">Завтрак</td>
                <td className="py-2.5 tabular-nums text-amber-700 dark:text-amber-300">07:20 – 07:35</td>
                <td className={`py-2.5 tabular-nums ${userShift === 1 ? "bg-primary/10 font-bold text-primary px-2" : ""}`}>07:35 – 08:10</td>
                <td className={`py-2.5 tabular-nums ${userShift === 2 ? "bg-primary/10 font-bold text-primary px-2" : ""}`}>07:35 – 08:10</td>
                <td className={`py-2.5 tabular-nums ${userShift === 3 ? "bg-primary/10 font-bold text-primary px-2" : ""}`}>07:35 – 08:10</td>
                <td className="py-2.5 tabular-nums text-rose-600 dark:text-rose-400">07:35 – 08:10</td>
              </tr>
              <tr className="hover:bg-secondary/30">
                <td className="py-2.5 font-bold">2-й завтрак</td>
                <td className="py-2.5 tabular-nums text-amber-700 dark:text-amber-300">11:50 – 12:00</td>
                <td className={`py-2.5 tabular-nums ${userShift === 1 ? "bg-primary/10 font-bold text-primary px-2" : ""}`}>12:00 – 12:25</td>
                <td className={`py-2.5 tabular-nums ${userShift === 2 ? "bg-primary/10 font-bold text-primary px-2" : ""}`}>12:00 – 12:25</td>
                <td className={`py-2.5 tabular-nums ${userShift === 3 ? "bg-primary/10 font-bold text-primary px-2" : ""}`}>12:00 – 12:25</td>
                <td className="py-2.5 tabular-nums text-rose-600 dark:text-rose-400">12:00 – 12:25</td>
              </tr>
              <tr className="bg-primary/5 hover:bg-primary/10">
                <td className="py-2.5 font-bold text-primary">Обед (посменно)</td>
                <td className="py-2.5 tabular-nums text-amber-700 dark:text-amber-300">14:00 – 14:15</td>
                <td className={`py-2.5 font-semibold tabular-nums ${userShift === 1 ? "bg-primary/15 font-bold text-primary px-2" : ""}`}>14:15 – 14:30</td>
                <td className={`py-2.5 font-semibold tabular-nums ${userShift === 2 ? "bg-primary/15 font-bold text-primary px-2" : ""}`}>14:30 – 14:45</td>
                <td className={`py-2.5 font-semibold tabular-nums ${userShift === 3 ? "bg-primary/15 font-bold text-primary px-2" : ""}`}>14:45 – 15:00</td>
                <td className="py-2.5 tabular-nums text-rose-600 dark:text-rose-400">15:00 – 15:10</td>
              </tr>
              <tr className="hover:bg-secondary/30">
                <td className="py-2.5 font-bold">Полдник</td>
                <td className="py-2.5 tabular-nums text-amber-700 dark:text-amber-300">17:20 – 17:30</td>
                <td className={`py-2.5 tabular-nums ${userShift === 1 ? "bg-primary/10 font-bold text-primary px-2" : ""}`}>17:30 – 17:55</td>
                <td className={`py-2.5 tabular-nums ${userShift === 2 ? "bg-primary/10 font-bold text-primary px-2" : ""}`}>17:30 – 17:55</td>
                <td className={`py-2.5 tabular-nums ${userShift === 3 ? "bg-primary/10 font-bold text-primary px-2" : ""}`}>17:30 – 17:55</td>
                <td className="py-2.5 tabular-nums text-rose-600 dark:text-rose-400">17:30 – 17:55</td>
              </tr>
              <tr className="bg-primary/5 hover:bg-primary/10">
                <td className="py-2.5 font-bold text-primary">Ужин (посменно)</td>
                <td className="py-2.5 tabular-nums text-amber-700 dark:text-amber-300">19:15 – 19:30</td>
                <td className={`py-2.5 font-semibold tabular-nums ${userShift === 1 ? "bg-primary/15 font-bold text-primary px-2" : ""}`}>19:30 – 19:40</td>
                <td className={`py-2.5 font-semibold tabular-nums ${userShift === 2 ? "bg-primary/15 font-bold text-primary px-2" : ""}`}>19:40 – 19:50</td>
                <td className={`py-2.5 font-semibold tabular-nums ${userShift === 3 ? "bg-primary/15 font-bold text-primary px-2" : ""}`}>19:50 – 20:00</td>
                <td className="py-2.5 tabular-nums text-rose-600 dark:text-rose-400">20:00 – 20:10</td>
              </tr>
              <tr className="hover:bg-secondary/30">
                <td className="py-2.5 font-bold">2-й ужин</td>
                <td className="py-2.5 tabular-nums text-amber-700 dark:text-amber-300">21:50 – 22:00</td>
                <td className={`py-2.5 tabular-nums ${userShift === 1 ? "bg-primary/10 font-bold text-primary px-2" : ""}`}>22:00 – 22:10</td>
                <td className={`py-2.5 tabular-nums ${userShift === 2 ? "bg-primary/10 font-bold text-primary px-2" : ""}`}>22:00 – 22:10</td>
                <td className={`py-2.5 tabular-nums ${userShift === 3 ? "bg-primary/10 font-bold text-primary px-2" : ""}`}>22:00 – 22:10</td>
                <td className="py-2.5 tabular-nums text-rose-600 dark:text-rose-400">22:00 – 22:10</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Справочник смен с подсветкой активной смены */}
        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className={`rounded-xl border p-3 transition-all ${
            userShift === 1
              ? "border-primary bg-primary/10 ring-2 ring-primary/40 shadow-sm"
              : "border-border/70 bg-secondary/30"
          }`}>
            <div className="flex items-center justify-between">
              <Badge variant={userShift === 1 ? "default" : "outline"} className="mb-1 font-bold">
                1-я смена
              </Badge>
              {userShift === 1 && (
                <span className="text-[11px] font-bold text-primary">Твоя смена</span>
              )}
            </div>
            <p className="text-xs font-semibold">8-1, 11-1 … 11-9 (и 11-11, 11-12)</p>
            <p className="mt-1 text-[11px] text-muted-foreground">Обед: 14:15 · Ужин: 19:30</p>
          </div>

          <div className={`rounded-xl border p-3 transition-all ${
            userShift === 2
              ? "border-primary bg-primary/10 ring-2 ring-primary/40 shadow-sm"
              : "border-border/70 bg-secondary/30"
          }`}>
            <div className="flex items-center justify-between">
              <Badge variant={userShift === 2 ? "default" : "outline"} className="mb-1 font-bold">
                2-я смена
              </Badge>
              {userShift === 2 && (
                <span className="text-[11px] font-bold text-primary">Твоя смена</span>
              )}
            </div>
            <p className="text-xs font-semibold">10-1 … 10-9 (все 10-е)</p>
            <p className="mt-1 text-[11px] text-muted-foreground">Обед: 14:30 · Ужин: 19:40</p>
          </div>

          <div className={`rounded-xl border p-3 transition-all ${
            userShift === 3
              ? "border-primary bg-primary/10 ring-2 ring-primary/40 shadow-sm"
              : "border-border/70 bg-secondary/30"
          }`}>
            <div className="flex items-center justify-between">
              <Badge variant={userShift === 3 ? "default" : "outline"} className="mb-1 font-bold">
                3-я смена
              </Badge>
              {userShift === 3 && (
                <span className="text-[11px] font-bold text-primary">Твоя смена</span>
              )}
            </div>
            <p className="text-xs font-semibold">9-1, 9-2, 9-3, 11-10</p>
            <p className="mt-1 text-[11px] text-muted-foreground">Обед: 14:45 · Ужин: 19:50</p>
          </div>
        </div>
      </SectionCard>

      {/* 4. Выходные и праздничные дни */}
      <SectionCard
        title="В выходные и праздничные дни"
        icon={<AlertCircle className="h-4 w-4 text-amber-500" />}
      >
        <div className="space-y-2 text-sm">
          <div className="flex flex-wrap items-center justify-between rounded-xl border border-border/60 bg-secondary/20 p-3">
            <span className="font-semibold">Завтрак</span>
            <span className="font-mono text-xs font-bold text-primary">08:35 – 09:10</span>
            <span className="text-xs text-muted-foreground">(дежурные: 08:20 – 08:35)</span>
          </div>
          <div className="flex flex-wrap items-center justify-between rounded-xl border border-border/60 bg-secondary/20 p-3">
            <span className="font-semibold">Обед</span>
            <span className="font-mono text-xs font-bold text-primary">14:00 – 14:45</span>
            <span className="text-xs text-muted-foreground">(дежурные: 13:45 – 14:00)</span>
          </div>
          <div className="flex flex-wrap items-center justify-between rounded-xl border border-border/60 bg-secondary/20 p-3">
            <span className="font-semibold">Полдник</span>
            <span className="font-mono text-xs font-bold text-primary">17:30 – 17:55</span>
            <span className="text-xs text-muted-foreground">(дежурные: 17:20 – 17:30)</span>
          </div>
          <div className="flex flex-wrap items-center justify-between rounded-xl border border-border/60 bg-secondary/20 p-3">
            <span className="font-semibold">Ужин</span>
            <span className="font-mono text-xs font-bold text-primary">19:30 – 20:00</span>
            <span className="text-xs text-muted-foreground">(дежурные: 19:15 – 19:30)</span>
          </div>
          <div className="grid grid-cols-2 gap-2 pt-2">
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-2.5 text-center text-xs font-bold text-rose-700 dark:text-rose-400">
              ❌ 2-го завтрака НЕТ
            </div>
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-2.5 text-center text-xs font-bold text-rose-700 dark:text-rose-400">
              ❌ 2-го ужина НЕТ
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-center text-xs font-bold text-amber-700 dark:text-amber-400">
          ⭐ Самые точные часы у ДЕЖУРНОГО АДМИНИСТРАТОРА
        </div>
      </SectionCard>
    </div>
  );
}

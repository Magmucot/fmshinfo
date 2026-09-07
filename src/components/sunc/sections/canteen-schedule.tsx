"use client";

/**
 * График работы столовой по сменам (источник: rasp.jpg)
 */

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Clock,
  Utensils,
  Calendar,
  AlertCircle,
  Users,
  CheckCircle2,
  Sparkles,
} from "lucide-react";
import { useCanteenSchedule, useClasses } from "../api";
import { SectionCard, LoadingBlock, ErrorCard } from "../shared";

export function CanteenScheduleView() {
  const [selectedClass, setSelectedClass] = useState<string>("10-1");
  const { data: scheduleData, isLoading, isError } = useCanteenSchedule(selectedClass);
  const { data: classesData } = useClasses();

  if (isLoading) {
    return <LoadingBlock lines={4} />;
  }

  if (isError || !scheduleData?.ok) {
    return <ErrorCard message="Не удалось загрузить график работы столовой" />;
  }

  const shifts = scheduleData.shifts;
  const currentStatus = scheduleData.currentStatus;
  const classSchedule = scheduleData.classSchedule;

  return (
    <div className="space-y-6">
      {/* 1. Карточка живого статуса столовой */}
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
                Время приёма: <code className="font-semibold">{currentStatus.timeRange}</code>
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
        icon={<Utensils className="h-4 w-4" />}
      >
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <label className="text-sm font-semibold">Твой класс:</label>
          <div className="flex flex-wrap gap-1.5">
            {(classesData?.classes ?? ["8-1", "9-1", "10-1", "11-1", "11-10"]).slice(0, 10).map((c) => (
              <Button
                key={c}
                size="sm"
                variant={selectedClass === c ? "default" : "outline"}
                className="h-8 px-2.5 text-xs font-medium"
                onClick={() => setSelectedClass(c)}
              >
                {c}
              </Button>
            ))}
            {(classesData?.classes?.length ?? 0) > 10 ? (
              <select
                aria-label="Выбрать другой класс для графика столовой"
                value={selectedClass}
                onChange={(e) => setSelectedClass(e.target.value)}
                className="h-8 rounded-lg border border-border/80 bg-background px-2 text-xs font-medium text-foreground outline-none"
              >
                {classesData?.classes?.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            ) : null}
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
              <Badge className="bg-primary text-primary-foreground">
                {classSchedule.shift}-я смена
              </Badge>
            </div>

            <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              {classSchedule.meals.map((m: any, idx: number) => (
                <div
                  key={idx}
                  className="flex flex-col justify-between rounded-xl border border-border/70 bg-card p-3 shadow-xs"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-bold">{m.meal}</span>
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
              ))}
            </div>
          </div>
        ) : null}
      </SectionCard>

      {/* 3. Сводная таблица графика смен (Пн - Сб) */}
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
                <th className="pb-2.5 font-semibold">1-я смена</th>
                <th className="pb-2.5 font-semibold">2-я смена</th>
                <th className="pb-2.5 font-semibold">3-я смена</th>
                <th className="pb-2.5 font-semibold text-rose-600 dark:text-rose-400">Опоздавшие</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              <tr className="hover:bg-secondary/30">
                <td className="py-2.5 font-bold">Завтрак</td>
                <td className="py-2.5 tabular-nums text-amber-700 dark:text-amber-300">07:20 – 07:35</td>
                <td className="py-2.5 tabular-nums">07:35 – 08:10</td>
                <td className="py-2.5 tabular-nums">07:35 – 08:10</td>
                <td className="py-2.5 tabular-nums">07:35 – 08:10</td>
                <td className="py-2.5 tabular-nums text-rose-600 dark:text-rose-400">07:35 – 08:10</td>
              </tr>
              <tr className="hover:bg-secondary/30">
                <td className="py-2.5 font-bold">2-й завтрак</td>
                <td className="py-2.5 tabular-nums text-amber-700 dark:text-amber-300">11:50 – 12:00</td>
                <td className="py-2.5 tabular-nums">12:00 – 12:25</td>
                <td className="py-2.5 tabular-nums">12:00 – 12:25</td>
                <td className="py-2.5 tabular-nums">12:00 – 12:25</td>
                <td className="py-2.5 tabular-nums text-rose-600 dark:text-rose-400">12:00 – 12:25</td>
              </tr>
              <tr className="bg-primary/5 hover:bg-primary/10">
                <td className="py-2.5 font-bold text-primary">Обед (посменно)</td>
                <td className="py-2.5 tabular-nums text-amber-700 dark:text-amber-300">14:00 – 14:15</td>
                <td className="py-2.5 font-semibold tabular-nums">14:15 – 14:30</td>
                <td className="py-2.5 font-semibold tabular-nums">14:30 – 14:45</td>
                <td className="py-2.5 font-semibold tabular-nums">14:45 – 15:00</td>
                <td className="py-2.5 tabular-nums text-rose-600 dark:text-rose-400">15:00 – 15:10</td>
              </tr>
              <tr className="hover:bg-secondary/30">
                <td className="py-2.5 font-bold">Полдник</td>
                <td className="py-2.5 tabular-nums text-amber-700 dark:text-amber-300">17:20 – 17:30</td>
                <td className="py-2.5 tabular-nums">17:30 – 17:55</td>
                <td className="py-2.5 tabular-nums">17:30 – 17:55</td>
                <td className="py-2.5 tabular-nums">17:30 – 17:55</td>
                <td className="py-2.5 tabular-nums text-rose-600 dark:text-rose-400">17:30 – 17:55</td>
              </tr>
              <tr className="bg-primary/5 hover:bg-primary/10">
                <td className="py-2.5 font-bold text-primary">Ужин (посменно)</td>
                <td className="py-2.5 tabular-nums text-amber-700 dark:text-amber-300">19:15 – 19:30</td>
                <td className="py-2.5 font-semibold tabular-nums">19:30 – 19:40</td>
                <td className="py-2.5 font-semibold tabular-nums">19:40 – 19:50</td>
                <td className="py-2.5 font-semibold tabular-nums">19:50 – 20:00</td>
                <td className="py-2.5 tabular-nums text-rose-600 dark:text-rose-400">20:00 – 20:10</td>
              </tr>
              <tr className="hover:bg-secondary/30">
                <td className="py-2.5 font-bold">2-й ужин</td>
                <td className="py-2.5 tabular-nums text-amber-700 dark:text-amber-300">21:50 – 22:00</td>
                <td className="py-2.5 tabular-nums">22:00 – 22:10</td>
                <td className="py-2.5 tabular-nums">22:00 – 22:10</td>
                <td className="py-2.5 tabular-nums">22:00 – 22:10</td>
                <td className="py-2.5 tabular-nums text-rose-600 dark:text-rose-400">22:00 – 22:10</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Справочник смен */}
        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-border/70 bg-secondary/30 p-3">
            <Badge variant="outline" className="mb-1 font-bold">1-я смена</Badge>
            <p className="text-xs font-semibold">8-1, 11-1 … 11-9</p>
            <p className="mt-1 text-[11px] text-muted-foreground">Обед: 14:15 · Ужин: 19:30</p>
          </div>
          <div className="rounded-xl border border-border/70 bg-secondary/30 p-3">
            <Badge variant="outline" className="mb-1 font-bold">2-я смена</Badge>
            <p className="text-xs font-semibold">10-1 … 10-9 (все 10-е)</p>
            <p className="mt-1 text-[11px] text-muted-foreground">Обед: 14:30 · Ужин: 19:40</p>
          </div>
          <div className="rounded-xl border border-border/70 bg-secondary/30 p-3">
            <Badge variant="outline" className="mb-1 font-bold">3-я смена</Badge>
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

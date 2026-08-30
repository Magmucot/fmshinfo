"use client";

/** Раздел «Расписание»: звонки + занятия по классам (table-sesc.nsu.ru) */

import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { BellRing, CalendarDays, DoorOpen, User, Users } from "lucide-react";
import { useBells, useClasses, useSchedule } from "../api";
import { ErrorCard, LoadingBlock, SectionCard, StaleBadge, EmptyState } from "../shared";
import { WEEKDAYS, nowNsk, fmtRu } from "../types";

function BellsTable() {
  const bells = useBells();

  if (bells.isLoading) {
    return <LoadingBlock lines={6} />;
  }
  if (bells.isError) {
    return <ErrorCard message="Расписание звонков временно недоступно" onRetry={() => bells.refetch()} />;
  }

  const now = nowNsk();
  const minutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  const current = (bells.data?.bells ?? []).find(
    (b) => minutes >= toMin(b.begin) && minutes < toMin(b.end)
  );

  // группировка по парам
  const groups = new Map<string, typeof bells.data.bells>();
  for (const bell of bells.data?.bells ?? []) {
    const key = bell.pairName ?? "Дополнительно";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(bell);
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        {[...groups.entries()].map(([pairName, groupBells]) => (
          <div
            key={pairName}
            className="rounded-xl border border-border/60 bg-secondary/30 p-3.5 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-sm"
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{pairName}</p>
            <div className="mt-2 space-y-1.5">
              {groupBells.map((b, i) => {
                const isNow = current?.begin === b.begin;
                return (
                  <div
                    key={i}
                    className={`flex items-center justify-between rounded-lg px-2.5 py-1.5 text-sm tabular-nums ${
                      isNow ? "bg-primary/15 font-bold text-primary" : "bg-background/60"
                    }`}
                  >
                    <span>{b.begin}</span>
                    <span className="text-xs text-muted-foreground">—</span>
                    <span>{b.end}</span>
                    {isNow ? <span className="ml-1 h-1.5 w-1.5 rounded-full bg-primary animate-soft-pulse" /> : null}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Источник: {bells.data?.source}. Между 3-й и 4-й парой — обеденный перерыв (14:10–16:00), в 15:00–16:00 —
        факультативы.
      </p>
    </div>
  );
}

function ClassSchedule() {
  const classes = useClasses();
  const [selected, setSelected] = useState<string | null>(null);

  // Эффективный класс: выбранный или дефолтный «10-1» — без эффекта
  const effectiveSelected =
    selected ?? classes.data?.classes.find((c) => c === "10-1") ?? classes.data?.classes[0] ?? null;

  const schedule = useSchedule(effectiveSelected);
  const today = nowNsk().getUTCDay(); // 0=Вс

  const totalByDay = useMemo(() => {
    const days = schedule.data?.days ?? {};
    return Object.fromEntries(Object.entries(days).map(([wd, lessons]) => [wd, lessons.length]));
  }, [schedule.data]);

  if (classes.isLoading) {
    return <LoadingBlock lines={4} />;
  }
  if (classes.isError) {
    return <ErrorCard message="Список классов временно недоступен" onRetry={() => classes.refetch()} />;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Select value={effectiveSelected ?? undefined} onValueChange={setSelected}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Класс" />
          </SelectTrigger>
          <SelectContent className="max-h-72">
            {(classes.data?.classes ?? []).map((c) => (
              <SelectItem key={c} value={c}>
                {c} класс
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Badge variant="secondary" className="gap-1">
          <Users className="h-3 w-3" />
          {classes.data?.count ?? 0} классов
        </Badge>
        {schedule.data ? (
          <Badge variant="outline" className="gap-1 border-primary/30 bg-primary/5 text-primary">
            {schedule.data.totalLessons} занятий/нед
          </Badge>
        ) : null}
        <p className="text-xs text-muted-foreground">
          Источник:{" "}
          <a
            href="https://table-sesc.nsu.ru"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            table-sesc.nsu.ru
          </a>
        </p>
      </div>

      {schedule.isLoading ? (
        <LoadingBlock lines={6} />
      ) : schedule.isError ? (
        <ErrorCard
          message={`Не удалось загрузить расписание класса ${effectiveSelected}`}
          onRetry={() => schedule.refetch()}
        />
      ) : schedule.data ? (
        <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((wd) => {
            const lessons = schedule.data!.days[String(wd)] ?? [];
            const isToday = wd === today;
            return (
              <div
                key={wd}
                className={`rounded-xl border p-3.5 ${
                  isToday ? "border-primary/50 bg-primary/5 shadow-sm" : "border-border/60 bg-secondary/30"
                }`}
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm font-bold">{WEEKDAYS[wd]}</p>
                  <div className="flex items-center gap-1.5">
                    {isToday ? (
                      <Badge className="bg-primary text-primary-foreground text-[10px]">сегодня</Badge>
                    ) : null}
                    <span className="text-xs text-muted-foreground tabular-nums">{totalByDay[String(wd)] ?? 0} урок.</span>
                  </div>
                </div>
                {lessons.length ? (
                  <ul className="mt-2.5 space-y-1.5 max-h-80 overflow-y-auto custom-scroll pr-1">
                    {lessons.map((lesson, i) => (
                      <li key={i} className="rounded-lg bg-background/70 px-2.5 py-2 transition-colors hover:bg-background">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-[13px] font-semibold leading-snug">{lesson.lesson}</p>
                            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                              {lesson.teacher ? (
                                <span className="flex items-center gap-1">
                                  <User className="h-3 w-3" /> {lesson.teacher}
                                </span>
                              ) : null}
                              {lesson.classroom ? (
                                <span className="flex items-center gap-1">
                                  <DoorOpen className="h-3 w-3" /> {lesson.classroom}
                                </span>
                              ) : null}
                              {lesson.classes.length > 1 ? (
                                <span className="flex items-center gap-1">
                                  <Users className="h-3 w-3" /> {lesson.classes.join(", ")}
                                </span>
                              ) : null}
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-1 shrink-0">
                            <span className="text-[11px] font-semibold tabular-nums text-muted-foreground">
                              {lesson.begin}–{lesson.end}
                            </span>
                            {lesson.typeName && lesson.type !== 1 ? (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0">{lesson.typeName}</Badge>
                            ) : null}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="py-4 text-center text-xs text-muted-foreground">Нет занятий</p>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <EmptyState text="Выберите класс, чтобы увидеть расписание" icon={<CalendarDays className="h-8 w-8" />} />
      )}
    </div>
  );
}

export function ScheduleSection() {
  return (
    <div className="space-y-4">
      <Tabs defaultValue="classes">
        <TabsList className="h-auto w-full justify-start overflow-x-auto no-scrollbar sm:w-auto">
          <TabsTrigger value="classes" className="gap-1.5">
            <CalendarDays className="h-4 w-4" />
            Расписание занятий
          </TabsTrigger>
          <TabsTrigger value="bells" className="gap-1.5">
            <BellRing className="h-4 w-4" />
            Расписание звонков
          </TabsTrigger>
        </TabsList>
        <TabsContent value="classes" className="mt-4">
          <SectionCard>
            <ClassSchedule />
          </SectionCard>
        </TabsContent>
        <TabsContent value="bells" className="mt-4">
          <SectionCard action={<StaleBadge stale={false} />}>
            <BellsTable />
          </SectionCard>
        </TabsContent>
      </Tabs>
    </div>
  );
}

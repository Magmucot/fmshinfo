"use client";

/** Раздел «Расписание»: звонки + занятия по классам (table-sesc.nsu.ru).
 *  Параллельные уроки (одно время) = класс разделён на группы. */

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BellRing, CalendarDays, DoorOpen, GitBranch, User, Users,
} from "lucide-react";
import { useBells, useClasses, useSchedule } from "../api";
import { ErrorCard, LoadingBlock, SectionCard, StaleBadge, EmptyState } from "../shared";
import { WEEKDAYS, nowNsk } from "../types";
import type { ScheduleLesson } from "../types";

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
      <div className="grid grid-cols-1 gap-2.5 min-w-0 sm:grid-cols-2 lg:grid-cols-3">
        {[...groups.entries()].map(([pairName, groupBells]) => (
          <div
            key={pairName}
            className="min-w-0 rounded-xl border border-border/60 bg-secondary/30 p-3.5 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-sm"
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

/** Временной слот: один или несколько параллельных уроков (групп) */
interface TimeSlot {
  key: string;
  begin: string;
  end: string;
  lessons: ScheduleLesson[];
  parallel: boolean;
}

/** Уроки с одинаковым временем идут параллельно → класс делится на группы */
function groupBySlots(lessons: ScheduleLesson[]): TimeSlot[] {
  const map = new Map<string, ScheduleLesson[]>();
  for (const l of lessons) {
    const key = `${l.begin}-${l.end}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(l);
  }
  return [...map.entries()].map(([key, ls]) => ({
    key,
    begin: ls[0].begin,
    end: ls[0].end,
    lessons: ls,
    parallel: ls.length > 1,
  }));
}

/** Мета одного урока внутри слота (учитель/кабинет/классы) */
function LessonMeta({ lesson }: { lesson: ScheduleLesson }) {
  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px] leading-snug text-muted-foreground">
      {lesson.teacher ? (
        <span className="flex min-w-0 items-center gap-1">
          <User className="h-3 w-3 shrink-0" />
          <span className="truncate">{lesson.teacher}</span>
        </span>
      ) : null}
      {lesson.classroom ? (
        <span className="flex items-center gap-1">
          <DoorOpen className="h-3 w-3 shrink-0" /> {lesson.classroom}
        </span>
      ) : null}
      {lesson.classes.length > 1 ? (
        <span className="flex items-center gap-1 break-words">
          <Users className="h-3 w-3 shrink-0" /> {lesson.classes.join(", ")}
        </span>
      ) : null}
    </div>
  );
}

/** Слот с ОДНИМ уроком — компактная строка */
function SingleLessonRow({ lesson, slotKey }: { lesson: ScheduleLesson; slotKey: string }) {
  return (
    <li key={slotKey} className="rounded-lg bg-background/70 px-2.5 py-2 transition-colors hover:bg-background">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold leading-snug">{lesson.lesson}</p>
          <LessonMeta lesson={lesson} />
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className="text-[11px] font-semibold tabular-nums text-muted-foreground">
            {lesson.begin}–{lesson.end}
          </span>
          {lesson.typeName && lesson.type !== 1 ? (
            <Badge variant="outline" className="px-1.5 py-0 text-[10px]">{lesson.typeName}</Badge>
          ) : null}
        </div>
      </div>
    </li>
  );
}

/** Слот с НЕСКОЛЬКИМИ уроками — класс разделён на группы */
function ParallelGroupsBlock({ slot }: { slot: TimeSlot }) {
  return (
    <li key={slot.key} className="rounded-lg border border-dashed border-primary/35 bg-primary/[0.04] px-2.5 py-2">
      {/* Заголовок слота: время + признак деления */}
      <div className="flex flex-wrap items-center justify-between gap-1.5">
        <span className="flex items-center gap-1.5 text-[11px] font-bold tabular-nums text-primary">
          {slot.begin}–{slot.end}
        </span>
        <span className="flex items-center gap-1 text-[10px] font-semibold text-muted-foreground">
          <GitBranch className="h-3 w-3 text-primary/70" />
          класс делится на {slot.lessons.length} группы
        </span>
      </div>
      {/* Карточки групп */}
      <div className="mt-1.5 grid min-w-0 grid-cols-1 gap-1.5 sm:grid-cols-2">
        {slot.lessons.map((lesson, i) => (
          <div
            key={i}
            className="min-w-0 rounded-lg border border-border/60 bg-background/80 px-2.5 py-1.5 transition-all duration-200 hover:border-primary/40 hover:shadow-sm"
          >
            <div className="flex items-center gap-1.5">
              <span
                className="flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[10px] font-extrabold text-primary"
                aria-label={`Группа ${i + 1}`}
              >
                {i + 1}
              </span>
              <p className="min-w-0 flex-1 truncate text-[13px] font-semibold leading-snug">{lesson.lesson}</p>
              {lesson.typeName && lesson.type !== 1 ? (
                <Badge variant="outline" className="shrink-0 px-1.5 py-0 text-[9px]">{lesson.typeName}</Badge>
              ) : null}
            </div>
            <div className="pl-6">
              <LessonMeta lesson={lesson} />
            </div>
          </div>
        ))}
      </div>
    </li>
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

  /** Слоты по дням + счётчики */
  const slotsByDay = useMemo(() => {
    const days = schedule.data?.days ?? {};
    const res: Record<string, { slots: TimeSlot[]; lessons: number; parallelSlots: number }> = {};
    for (const [wd, lessons] of Object.entries(days)) {
      const slots = groupBySlots(lessons);
      res[wd] = {
        slots,
        lessons: lessons.length,
        parallelSlots: slots.filter((s) => s.parallel).length,
      };
    }
    return res;
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

      {/* Легенда групп */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-border/60 bg-secondary/30 px-3.5 py-2.5 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <GitBranch className="h-3.5 w-3.5 text-primary/70" />
          Уроки в одно время — класс разделён на группы: каждый ходит на свой предмет
        </span>
      </div>

      {schedule.isLoading ? (
        <LoadingBlock lines={6} />
      ) : schedule.isError ? (
        <ErrorCard
          message={`Не удалось загрузить расписание класса ${effectiveSelected}`}
          onRetry={() => schedule.refetch()}
        />
      ) : schedule.data ? (
        <div className="grid min-w-0 grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((wd) => {
            const info = slotsByDay[String(wd)];
            const isToday = wd === today;
            return (
              <div
                key={wd}
                className={`min-w-0 rounded-xl border p-3.5 ${
                  isToday ? "border-primary/50 bg-primary/5 shadow-sm" : "border-border/60 bg-secondary/30"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-bold">{WEEKDAYS[wd]}</p>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {isToday ? (
                      <Badge className="bg-primary text-primary-foreground text-[10px]">сегодня</Badge>
                    ) : null}
                    {info?.parallelSlots ? (
                      <Badge variant="outline" className="gap-0.5 border-primary/30 bg-primary/10 px-1.5 text-[10px] text-primary">
                        <GitBranch className="h-2.5 w-2.5" />
                        {info.parallelSlots}×группы
                      </Badge>
                    ) : null}
                    <span className="text-xs tabular-nums text-muted-foreground">{info?.slots.length ?? 0} урок.</span>
                  </div>
                </div>
                {info?.slots.length ? (
                  <ul className="custom-scroll mt-2.5 max-h-80 space-y-1.5 overflow-y-auto pr-1">
                    {info.slots.map((slot) =>
                      slot.parallel ? (
                        <ParallelGroupsBlock key={slot.key} slot={slot} />
                      ) : (
                        <SingleLessonRow key={slot.key} lesson={slot.lessons[0]} slotKey={slot.key} />
                      )
                    )}
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

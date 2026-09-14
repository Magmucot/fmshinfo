"use client";

/**
 * Раздел «Расписание»:
 * - Четкое разделение: [Пара · 90 мин] vs [Урок · 45 мин].
 * - Устранение раздутости (10-4 и др.):
 *   1. Интерактивный переключатель дней (Пн..Сб + Вся неделя) с фокусом на сегодня.
 *   2. Фильтр подгрупп (Все / 1-я / 2-я).
 *   3. Компактные карточки для нескольких подгрупп (англ. яз I..IV в аккуратном гриде).
 *   4. Минималистичные строки окон без гигантских пустых боксов.
 * - Расписание звонков с 3 школьными парами и второй половиной дня.
 */

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BellRing, CalendarDays, DoorOpen, User, Users, Coffee, BookOpen, ChevronLeft, ChevronRight,
} from "lucide-react";
import { useBells, useClasses, useSchedule } from "../api";
import { useUserClass } from "../useUserClass";
import { ErrorCard, LoadingBlock, SectionCard, StaleBadge, EmptyState } from "../shared";
import { WEEKDAYS, nowNsk } from "../types";
import type { ScheduleLesson } from "../types";

/** Школьные пары СУНЦ НГУ */
const PAIRS_DEF = [
  {
    num: 1,
    title: "1-я пара",
    time: "08:30–10:10",
    slot1: { num: 1, begin: "08:30", end: "09:15" },
    slot2: { num: 2, begin: "09:25", end: "10:10" },
  },
  {
    num: 2,
    title: "2-я пара",
    time: "10:20–12:00",
    slot1: { num: 3, begin: "10:20", end: "11:05" },
    slot2: { num: 4, begin: "11:15", end: "12:00" },
  },
  {
    num: 3,
    title: "3-я пара",
    time: "12:30–14:10",
    slot1: { num: 5, begin: "12:30", end: "13:15" },
    slot2: { num: 6, begin: "13:25", end: "14:10" },
  },
] as const;

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

  const mainPairs = [
    {
      num: 1,
      title: "1-я пара",
      time: "08:30 – 10:10",
      lessons: [
        { name: "1-й урок", begin: "08:30", end: "09:15" },
        { name: "2-й урок", begin: "09:25", end: "10:10" },
      ],
      breakAfter: "Большая перемена: 10:10 – 10:20 (10 мин)",
    },
    {
      num: 2,
      title: "2-я пара",
      time: "10:20 – 12:00",
      lessons: [
        { name: "3-й урок", begin: "10:20", end: "11:05" },
        { name: "4-й урок", begin: "11:15", end: "12:00" },
      ],
      breakAfter: "Обеденный перерыв: 12:00 – 12:30 (30 мин)",
    },
    {
      num: 3,
      title: "3-я пара",
      time: "12:30 – 14:10",
      lessons: [
        { name: "5-й урок", begin: "12:30", end: "13:15" },
        { name: "6-й урок", begin: "13:25", end: "14:10" },
      ],
      breakAfter: "Обед и отдых: 14:10 – 16:00 (факультативы 15:00–16:00)",
    },
  ];

  const eveningActivities = [
    { name: "Факультативы и консультации", time: "15:00 – 16:00" },
    { name: "Спецкурсы кафедр / ОБЗР", time: "16:00 – 17:30" },
    { name: "Вечерние спецкурсы", time: "18:00 – 19:30" },
    { name: "Самоподготовка (интернат)", time: "20:30 – 22:00" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center justify-between gap-2 mb-3">
          <h3 className="text-sm font-bold tracking-tight text-foreground flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-primary/10 text-primary text-xs font-black">
              3
            </span>
            Основные учебные пары (до 14:10)
          </h3>
          <span className="text-xs text-muted-foreground">В школе 3 пары в день</span>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {mainPairs.map((p) => (
            <div
              key={p.num}
              className="relative overflow-hidden rounded-xl border border-border/70 bg-card p-4 shadow-sm transition-all duration-200 hover:border-primary/40 hover:shadow-md"
            >
              <div className="flex items-center justify-between gap-2 mb-2.5">
                <span className="text-xs font-bold uppercase tracking-wider text-primary">
                  {p.title}
                </span>
                <span className="text-xs font-semibold tabular-nums text-muted-foreground">
                  {p.time}
                </span>
              </div>
              <div className="space-y-2">
                {p.lessons.map((l, i) => {
                  const isNow = current?.begin === l.begin;
                  return (
                    <div
                      key={i}
                      className={`flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs tabular-nums transition-colors ${
                        isNow
                          ? "border border-primary/40 bg-primary/15 font-bold text-primary shadow-xs"
                          : "bg-secondary/40 text-foreground"
                      }`}
                    >
                      <span>{l.name}</span>
                      <span>
                        {l.begin} – {l.end}
                      </span>
                    </div>
                  );
                })}
              </div>
              <p className="mt-3 text-[11px] text-muted-foreground/80 leading-snug border-t border-border/40 pt-2 flex items-center gap-1">
                <Coffee className="h-3 w-3 shrink-0 text-amber-500" />
                {p.breakAfter}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Вечерние спецкурсы */}
      <div className="rounded-xl border border-border/60 bg-secondary/30 p-4">
        <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
          <BookOpen className="h-3.5 w-3.5 text-primary" />
          Вторая половина дня: Спецкурсы и факультативы
        </h4>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {eveningActivities.map((act, i) => (
            <div key={i} className="rounded-lg border border-border/50 bg-background/70 px-3 py-2 text-xs">
              <span className="block font-semibold text-foreground truncate">{act.name}</span>
              <span className="block text-[11px] text-muted-foreground tabular-nums mt-0.5">{act.time}</span>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          График питания в столовой (смены 1, 2, 3): перейдите во вкладку{" "}
          <span className="font-semibold text-foreground">«Столовая» → «График смен»</span>.
        </p>
      </div>
    </div>
  );
}

/** Метаданные урока (учитель, кабинет, смежные классы) */
function LessonMeta({ lesson }: { lesson: ScheduleLesson }) {
  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px] leading-snug text-muted-foreground">
      {lesson.teacher ? (
        <span className="flex min-w-0 items-center gap-1">
          <User className="h-3 w-3 shrink-0 text-primary/70" />
          <span className="truncate">{lesson.teacher}</span>
        </span>
      ) : null}
      {lesson.classroom ? (
        <span className="flex items-center gap-1 font-mono">
          <DoorOpen className="h-3 w-3 shrink-0 text-primary/70" />
          {lesson.classroom.replace(/_/g, ".")}
        </span>
      ) : null}
      {lesson.classes && lesson.classes.length > 1 ? (
        <span className="flex items-center gap-1">
          <Users className="h-3 w-3 shrink-0" />
          {lesson.classes.join(", ")}
        </span>
      ) : null}
    </div>
  );
}

/** Описание слота пары */
interface PairSlotData {
  lessonNum: number;
  begin: string;
  end: string;
  lessons: ScheduleLesson[];
}

/** Описание блока пары */
interface PairBlockData {
  num: number;
  title: string;
  time: string;
  slot1: PairSlotData;
  slot2: PairSlotData;
  isFullPair: boolean;
  isEmpty: boolean;
  unifiedLessons: ScheduleLesson[];
}

function organizeDayIntoPairs(lessons: ScheduleLesson[]): { pairs: PairBlockData[]; extras: ScheduleLesson[] } {
  const pairs: PairBlockData[] = PAIRS_DEF.map((def) => {
    const s1Lessons = lessons.filter((l) => l.begin === def.slot1.begin);
    const s2Lessons = lessons.filter((l) => l.begin === def.slot2.begin);

    const sig = (list: ScheduleLesson[]) =>
      list
        .map((l) => `${l.lesson}|${l.teacher ?? ""}|${l.classroom ?? ""}|${l.subgroup ?? ""}|${l.typeName ?? ""}`)
        .sort()
        .join(";;");

    const isFullPair = s1Lessons.length > 0 && s2Lessons.length > 0 && sig(s1Lessons) === sig(s2Lessons);
    const isEmpty = s1Lessons.length === 0 && s2Lessons.length === 0;

    return {
      num: def.num,
      title: def.title,
      time: def.time,
      slot1: { lessonNum: def.slot1.num, begin: def.slot1.begin, end: def.slot1.end, lessons: s1Lessons },
      slot2: { lessonNum: def.slot2.num, begin: def.slot2.begin, end: def.slot2.end, lessons: s2Lessons },
      isFullPair,
      isEmpty,
      unifiedLessons: isFullPair ? s1Lessons : [],
    };
  });

  const allMainSlots = PAIRS_DEF.flatMap((p) => [p.slot1.begin, p.slot2.begin]);
  const extras = lessons.filter((l) => !allMainSlots.includes(l.begin));

  return { pairs, extras };
}

/** Рендерер списка занятий внутри слота или пары */
function LessonsRenderer({
  lessons,
  subgroupFilter,
}: {
  lessons: ScheduleLesson[];
  subgroupFilter: "all" | "sub1" | "sub2";
}) {
  if (!lessons.length) return null;

  // Фильтр по подгруппе
  const filtered = lessons.filter((l) => {
    if (subgroupFilter === "all") return true;
    if (!l.subgroup) return true;
    if (subgroupFilter === "sub1") {
      return l.subgroup.includes("1-я") || l.subgroup.includes("3-я") || l.subgroup.includes("4-я");
    }
    if (subgroupFilter === "sub2") {
      return l.subgroup.includes("2-я") || l.subgroup.includes("5-я") || l.subgroup.includes("6-я");
    }
    return true;
  });

  if (!filtered.length) {
    return (
      <div className="rounded-lg bg-secondary/20 p-2.5 text-xs text-muted-foreground italic">
        💤 У выбранной подгруппы в это время нет занятий (окно)
      </div>
    );
  }

  // Компактный грид для подгрупп иностранного языка (3-я, 4-я, 5-я, 6-я)
  const isLanguageBlock =
    filtered.length >= 2 && filtered.every((l) => l.lesson.toLowerCase().includes("язык"));

  if (isLanguageBlock) {
    return (
      <div className="rounded-xl border border-primary/20 bg-primary/[0.03] p-2.5">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5 text-xs font-bold text-primary">
            <span>🌐</span>
            <span>Иностранный язык (по группам)</span>
          </div>
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-primary/30 text-primary">
            {filtered.length} групп
          </Badge>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
          {filtered.map((l, i) => (
            <div
              key={i}
              className="flex items-center justify-between gap-2 rounded-lg border border-border/50 bg-background/80 px-2.5 py-1.5 text-xs transition-colors hover:border-primary/40"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-primary text-[11px] shrink-0">
                    {l.subgroup ?? `${i + 1}-я`}:
                  </span>
                  <span className="truncate text-foreground font-medium text-[11px]">{l.lesson}</span>
                </div>
                {l.teacher ? (
                  <p className="truncate text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
                    <User className="h-2.5 w-2.5 text-primary/70 shrink-0" />
                    {l.teacher}
                  </p>
                ) : null}
              </div>
              {l.classroom ? (
                <span className="font-mono text-[10px] bg-secondary/80 px-1.5 py-0.5 rounded border border-border/50 shrink-0 text-foreground font-medium">
                  {l.classroom}
                </span>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Одиночный урок
  if (filtered.length === 1) {
    const l = filtered[0];
    return (
      <div className="rounded-xl border border-border/60 bg-background/80 p-3 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
          <div className="flex items-center gap-2">
            {l.subgroup ? (
              <Badge
                variant="outline"
                className="border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[10px] font-bold px-1.5 py-0"
              >
                👥 {l.subgroup}
              </Badge>
            ) : (
              <Badge variant="secondary" className="text-[10px] font-medium px-1.5 py-0">
                Весь класс
              </Badge>
            )}
            <span className="text-xs font-bold text-foreground">{l.lesson}</span>
          </div>
          {l.typeName ? (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
              {l.typeName}
            </Badge>
          ) : null}
        </div>
        {l.subgroup ? (
          <p className="text-[10px] text-muted-foreground/80 italic mb-1">
            💤 Для второй подгруппы в это время свободное окно (урока нет)
          </p>
        ) : null}
        <LessonMeta lesson={l} />
      </div>
    );
  }

  // Несколько подгрупп (например, 1-я подгруппа Математика, 2-я Физика)
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {filtered.map((l, idx) => (
        <div
          key={idx}
          className="rounded-xl border border-border/60 bg-background/80 p-2.5 shadow-xs transition-all hover:border-primary/40"
        >
          <div className="flex items-center justify-between gap-1 mb-1">
            <Badge
              variant="outline"
              className="border-primary/40 bg-primary/10 text-primary text-[10px] font-bold px-1.5 py-0"
            >
              👥 {l.subgroup ?? `${idx + 1}-я подгруппа`}
            </Badge>
            {l.typeName ? (
              <span className="text-[10px] text-muted-foreground font-medium">{l.typeName}</span>
            ) : null}
          </div>
          <p className="text-xs font-bold text-foreground truncate mt-0.5">{l.lesson}</p>
          <LessonMeta lesson={l} />
        </div>
      ))}
    </div>
  );
}

/** Карточка одного дня расписания */
function DayScheduleCard({
  dayNum,
  dayData,
  isToday,
  subgroupFilter,
}: {
  dayNum: number;
  dayData?: ReturnType<typeof organizeDayIntoPairs>;
  isToday: boolean;
  subgroupFilter: "all" | "sub1" | "sub2";
}) {
  const hasLessons = dayData && (dayData.pairs.some((p) => !p.isEmpty) || dayData.extras.length > 0);

  return (
    <div
      className={`rounded-2xl border p-4 transition-all duration-200 ${
        isToday
          ? "border-primary/60 bg-gradient-to-b from-primary/[0.07] via-background to-background shadow-md shadow-primary/5 ring-1 ring-primary/20"
          : "border-border/70 bg-card shadow-xs hover:border-border"
      }`}
    >
      <div className="flex items-center justify-between border-b border-border/50 pb-3 mb-3">
        <div className="flex items-center gap-2">
          <h3 className="text-base font-extrabold tracking-tight text-foreground">
            {WEEKDAYS[dayNum]}
          </h3>
          {isToday ? (
            <Badge className="bg-primary text-primary-foreground text-[10px] px-2 py-0.5 font-bold shadow-xs">
              Сегодня
            </Badge>
          ) : null}
        </div>
        <span className="text-xs text-muted-foreground font-medium">
          {dayNum === 6 ? "Шестидневка" : "Будний день"}
        </span>
      </div>

      {!hasLessons ? (
        <div className="py-10 text-center">
          <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-secondary text-muted-foreground mb-2">
            💤
          </div>
          <p className="text-sm font-semibold text-foreground">Занятий нет</p>
          <p className="text-xs text-muted-foreground">В этот день у класса свободный день или выходной</p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* 3 школьные пары */}
          {dayData?.pairs.map((p) => {
            if (p.isEmpty) {
              return (
                <div
                  key={p.num}
                  className="flex items-center justify-between rounded-xl border border-dashed border-border/50 bg-secondary/10 px-3 py-2 text-xs text-muted-foreground"
                >
                  <span className="font-semibold text-muted-foreground/80">
                    {p.title} <span className="font-mono text-[10px]">({p.time})</span>
                  </span>
                  <span className="text-[11px] italic">💤 Окно (пары нет · 90 мин)</span>
                </div>
              );
            }

            if (p.isFullPair) {
              return (
                <div
                  key={p.num}
                  className="rounded-xl border border-border/70 bg-secondary/20 p-3 transition-all hover:border-primary/40"
                >
                  <div className="flex items-center justify-between gap-2 border-b border-border/40 pb-2 mb-2">
                    <div className="flex items-center gap-2">
                      <Badge className="bg-gradient-to-r from-indigo-500 to-violet-600 text-white text-[10px] font-bold px-2 py-0.5 shadow-xs">
                        {p.title} · Пара (90 мин)
                      </Badge>
                      <span className="font-mono text-xs tabular-nums text-muted-foreground font-medium">
                        {p.time}
                      </span>
                    </div>
                    <span className="text-[10px] text-muted-foreground/80">2 урока подряд</span>
                  </div>
                  <LessonsRenderer lessons={p.unifiedLessons} subgroupFilter={subgroupFilter} />
                </div>
              );
            }

            // Раздельные уроки по 45 мин
            return (
              <div
                key={p.num}
                className="rounded-xl border border-border/70 bg-secondary/20 p-3 space-y-2.5 transition-all hover:border-primary/40"
              >
                <div className="flex items-center justify-between gap-2 border-b border-border/40 pb-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="border-border bg-background text-foreground text-[10px] font-bold px-2 py-0.5">
                      {p.title}
                    </Badge>
                    <span className="font-mono text-xs tabular-nums text-muted-foreground font-medium">
                      {p.time}
                    </span>
                  </div>
                  <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[10px] font-semibold">
                    Раздельные уроки (по 45 мин)
                  </Badge>
                </div>

                {/* 1-й урок */}
                <div className="rounded-lg bg-background/60 p-2 border border-border/30">
                  <div className="flex items-center justify-between text-[10px] font-bold text-muted-foreground mb-1">
                    <span className="text-primary">{p.slot1.lessonNum}-й урок · 45 мин</span>
                    <span className="font-mono">{p.slot1.begin}–{p.slot1.end}</span>
                  </div>
                  {p.slot1.lessons.length > 0 ? (
                    <LessonsRenderer lessons={p.slot1.lessons} subgroupFilter={subgroupFilter} />
                  ) : (
                    <p className="text-[11px] text-muted-foreground italic pl-1">💤 Окно (урока нет · 45 мин)</p>
                  )}
                </div>

                {/* 2-й урок */}
                <div className="rounded-lg bg-background/60 p-2 border border-border/30">
                  <div className="flex items-center justify-between text-[10px] font-bold text-muted-foreground mb-1">
                    <span className="text-primary">{p.slot2.lessonNum}-й урок · 45 мин</span>
                    <span className="font-mono">{p.slot2.begin}–{p.slot2.end}</span>
                  </div>
                  {p.slot2.lessons.length > 0 ? (
                    <LessonsRenderer lessons={p.slot2.lessons} subgroupFilter={subgroupFilter} />
                  ) : (
                    <p className="text-[11px] text-muted-foreground italic pl-1">💤 Окно (урока нет · 45 мин)</p>
                  )}
                </div>
              </div>
            );
          })}

          {/* Спецкурсы */}
          {dayData && dayData.extras.length > 0 ? (
            <div className="rounded-xl border border-primary/20 bg-primary/[0.03] p-2.5">
              <p className="text-[10px] font-bold uppercase tracking-wider text-primary mb-1.5 flex items-center gap-1">
                <BookOpen className="h-3 w-3" />
                Спецкурсы и факультативы (после 14:10)
              </p>
              <div className="space-y-1.5">
                {dayData.extras.map((ex, i) => (
                  <div
                    key={i}
                    className="rounded-lg bg-background/80 px-2.5 py-1.5 border border-border/40 text-xs flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <span className="font-bold text-[11px] text-foreground truncate block">{ex.lesson}</span>
                      <LessonMeta lesson={ex} />
                    </div>
                    <span className="font-mono text-[10px] text-muted-foreground shrink-0 bg-secondary/80 px-1.5 py-0.5 rounded border border-border/50">
                      {ex.begin}–{ex.end}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

function ClassSchedule() {
  const classes = useClasses();
  const [selectedClass, setSelectedClass] = useUserClass();

  const effectiveSelected =
    selectedClass || classes.data?.classes.find((c) => c === "10-4") || classes.data?.classes[0] || null;

  const handleSelectClass = (cls: string) => {
    setSelectedClass(cls);
  };

  const schedule = useSchedule(effectiveSelected);
  const today = nowNsk().getUTCDay(); // 0=Вс..6=Сб

  // Активный день: по умолчанию сегодня (или понедельник в вс)
  const [activeDay, setActiveDay] = useState<string>(() => {
    return today === 0 ? "1" : String(today);
  });
  const [subgroupFilter, setSubgroupFilter] = useState<"all" | "sub1" | "sub2">("all");

  // Группировка дней по 3 парам + спецкурсы
  const dayScheduleMap = useMemo(() => {
    const days = schedule.data?.days ?? {};
    const res: Record<string, ReturnType<typeof organizeDayIntoPairs>> = {};
    for (const [wd, ls] of Object.entries(days)) {
      res[wd] = organizeDayIntoPairs(ls);
    }
    return res;
  }, [schedule.data]);

  if (classes.isLoading) {
    return <LoadingBlock lines={4} />;
  }
  if (classes.isError) {
    return <ErrorCard message="Список классов временно недоступен" onRetry={() => classes.refetch()} />;
  }

  // Навигация по дням (Предыдущий / Следующий)
  const currentDayNum = Number(activeDay);
  const handlePrevDay = () => {
    if (activeDay === "all") return setActiveDay("6");
    const prev = currentDayNum <= 1 ? 6 : currentDayNum - 1;
    setActiveDay(String(prev));
  };
  const handleNextDay = () => {
    if (activeDay === "all") return setActiveDay("1");
    const next = currentDayNum >= 6 ? 1 : currentDayNum + 1;
    setActiveDay(String(next));
  };

  return (
    <div className="space-y-4">
      {/* Верхняя панель: выбор класса и статистика */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/70 bg-card/60 p-3.5 backdrop-blur-md">
        <div className="flex flex-wrap items-center gap-2.5">
          <Select value={effectiveSelected ?? undefined} onValueChange={handleSelectClass}>
            <SelectTrigger className="w-[150px] bg-background font-bold text-sm rounded-xl">
              <SelectValue placeholder="Класс" />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              {(classes.data?.classes ?? []).map((c) => (
                <SelectItem key={c} value={c} className="font-semibold">
                  {c} класс
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Badge variant="secondary" className="gap-1 font-semibold rounded-lg px-2.5 py-1">
            <Users className="h-3 w-3" />
            {classes.data?.count ?? 0} классов
          </Badge>
          {schedule.data ? (
            <Badge variant="outline" className="gap-1 border-primary/40 bg-primary/10 text-primary font-bold rounded-lg px-2.5 py-1">
              {schedule.data.totalLessons} уроков/нед
            </Badge>
          ) : null}
        </div>

        <p className="text-xs text-muted-foreground hidden sm:block">
          В школе <b>3 пары</b> в день (до 14:10). Спецкурсы — после 15:00.
        </p>
      </div>

      {/* Панель переключения дней и фильтра подгрупп */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-2xl border border-border/70 bg-card/60 p-2.5 backdrop-blur-md">
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-0.5">
          {[
            { id: "1", label: "Пн" },
            { id: "2", label: "Вт" },
            { id: "3", label: "Ср" },
            { id: "4", label: "Чт" },
            { id: "5", label: "Пт" },
            { id: "6", label: "Сб" },
            { id: "all", label: "Вся неделя" },
          ].map((d) => {
            const isToday = String(today) === d.id;
            const isActive = activeDay === d.id;
            return (
              <button
                key={d.id}
                onClick={() => setActiveDay(d.id)}
                className={`flex items-center gap-1 rounded-xl px-3 py-1.5 text-xs font-bold transition-all duration-150 ${
                  isActive
                    ? "bg-primary text-primary-foreground shadow-xs scale-102"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                }`}
              >
                <span>{d.label}</span>
                {isToday ? (
                  <span className={`h-1.5 w-1.5 rounded-full ${isActive ? "bg-white" : "bg-primary"}`} />
                ) : null}
              </button>
            );
          })}
        </div>

        {/* Фильтр подгрупп */}
        <div className="flex items-center gap-1 rounded-xl bg-secondary/40 p-1 border border-border/50 text-xs ml-auto">
          <span className="text-[11px] text-muted-foreground px-1.5 font-medium">Подгруппа:</span>
          <button
            onClick={() => setSubgroupFilter("all")}
            className={`rounded-lg px-2.5 py-1 font-semibold text-[11px] transition-all ${
              subgroupFilter === "all"
                ? "bg-background text-foreground shadow-xs border border-border/60"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Все
          </button>
          <button
            onClick={() => setSubgroupFilter("sub1")}
            className={`rounded-lg px-2.5 py-1 font-semibold text-[11px] transition-all ${
              subgroupFilter === "sub1"
                ? "bg-background text-foreground shadow-xs border border-border/60"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            1-я
          </button>
          <button
            onClick={() => setSubgroupFilter("sub2")}
            className={`rounded-lg px-2.5 py-1 font-semibold text-[11px] transition-all ${
              subgroupFilter === "sub2"
                ? "bg-background text-foreground shadow-xs border border-border/60"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            2-я
          </button>
        </div>
      </div>

      {/* Основной контент расписания */}
      {schedule.isLoading ? (
        <LoadingBlock lines={6} />
      ) : schedule.isError ? (
        <ErrorCard
          message={`Не удалось загрузить расписание класса ${effectiveSelected}`}
          onRetry={() => schedule.refetch()}
        />
      ) : schedule.data ? (
        <div>
          {/* Режим 1: Просмотр выбранного конкретного дня (компактно, чисто, без раздутия!) */}
          {activeDay !== "all" ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between px-1">
                <button
                  onClick={handlePrevDay}
                  className="flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-primary transition-colors cursor-pointer"
                >
                  <ChevronLeft className="h-4 w-4" />
                  <span>Предыдущий день</span>
                </button>
                <span className="text-xs font-bold text-muted-foreground">
                  День {currentDayNum} из 6
                </span>
                <button
                  onClick={handleNextDay}
                  className="flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-primary transition-colors cursor-pointer"
                >
                  <span>Следующий день</span>
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>

              <div className="max-w-2xl mx-auto">
                <DayScheduleCard
                  dayNum={currentDayNum}
                  dayData={dayScheduleMap[activeDay]}
                  isToday={currentDayNum === today}
                  subgroupFilter={subgroupFilter}
                />
              </div>
            </div>
          ) : (
            /* Режим 2: Вся неделя в адаптивной компактной сетке */
            <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {[1, 2, 3, 4, 5, 6].map((wd) => (
                <DayScheduleCard
                  key={wd}
                  dayNum={wd}
                  dayData={dayScheduleMap[String(wd)]}
                  isToday={wd === today}
                  subgroupFilter={subgroupFilter}
                />
              ))}
            </div>
          )}
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
        <TabsList className="h-auto w-full justify-start overflow-x-auto no-scrollbar sm:w-auto p-1 bg-secondary/50 rounded-xl">
          <TabsTrigger value="classes" className="gap-1.5 rounded-lg text-xs sm:text-sm font-bold">
            <CalendarDays className="h-4 w-4" />
            Расписание занятий
          </TabsTrigger>
          <TabsTrigger value="bells" className="gap-1.5 rounded-lg text-xs sm:text-sm font-bold">
            <BellRing className="h-4 w-4" />
            Расписание звонков (пары)
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

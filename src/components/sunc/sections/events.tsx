"use client";

/** Раздел «Мероприятия»: школьный календарь из Google-таблицы
 *  (общие события «ЕГЭ/ОГЭ и др.» + события по классам 8-1 … 11-12). */

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  ArrowUp, CalendarClock, ExternalLink, History, Megaphone, Search, Sparkles, Users,
} from "lucide-react";
import { useEvents } from "../api";
import { ErrorCard, LoadingBlock, SectionCard, StaleBadge, EmptyState } from "../shared";
import { fmtRu, nowNsk, parseRuDate, ruDayMonth } from "../types";
import type { EventDay } from "../types";

const MONTHS_NOM = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];

/** Событие дня, развёрнутый в одну строку (для фильтрации и рендера) */
interface FlatEvent {
  date: string;
  weekday: string;
  className: string | null; // null = общее
  text: string;
}

function flattenDay(day: EventDay): FlatEvent[] {
  const out: FlatEvent[] = [];
  for (const text of day.general) out.push({ date: day.date, weekday: day.weekday, className: null, text });
  for (const [className, texts] of Object.entries(day.byClass)) {
    for (const text of texts) out.push({ date: day.date, weekday: day.weekday, className, text });
  }
  return out;
}

/** Карточка одного события: значок + чип класса + текст */
function EventRow({ event, today, highlight }: { event: FlatEvent; today: string; highlight: boolean }) {
  const isToday = event.date === today;
  return (
    <li
      className={`flex items-start gap-2.5 rounded-xl border p-3 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm ${
        isToday
          ? "border-primary/40 bg-primary/5"
          : highlight
            ? "border-border/60 bg-secondary/30"
            : "border-border/50 bg-secondary/20 opacity-75"
      }`}
    >
      {event.className === null ? (
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400" title="Общее событие">
          <Megaphone className="h-3.5 w-3.5" />
        </span>
      ) : (
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-teal-500/15 text-teal-700 dark:text-teal-400" title={`Класс ${event.className}`}>
          <Users className="h-3.5 w-3.5" />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium leading-snug break-words">{event.text}</p>
        <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
          {event.className === null ? (
            <Badge variant="outline" className="h-4 border-amber-500/40 bg-amber-500/10 px-1.5 text-[10px] font-semibold text-amber-700 dark:text-amber-400">
              всем
            </Badge>
          ) : (
            <Badge variant="outline" className="h-4 border-teal-500/40 bg-teal-500/10 px-1.5 text-[10px] font-semibold text-teal-700 dark:text-teal-400">
              {event.className}
            </Badge>
          )}
          <span className="tabular-nums">
            {ruDayMonth(event.date)} · {event.weekday}
          </span>
          {isToday ? (
            <Badge className="h-4 bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">сегодня</Badge>
          ) : null}
        </p>
      </div>
    </li>
  );
}

/** Прикреплённая карточка «Ближайшее» — ближайший день с событиями */
function NextUpCard({ day, today, onOpenSheet }: { day: EventDay; today: string; onOpenSheet: () => void }) {
  const isToday = day.date === today;
  const events = flattenDay(day);
  return (
    <SectionCard contentClassName="relative overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-primary/10 blur-2xl" />
      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-5">
        <div className="flex shrink-0 items-center gap-3 sm:flex-col sm:gap-1 sm:rounded-2xl sm:border sm:border-border/70 sm:bg-secondary/40 sm:px-4 sm:py-3">
          <div className="text-3xl font-extrabold tabular-nums tracking-tight sm:text-4xl">
            {Number(day.date.slice(0, 2))}
          </div>
          <div className="text-xs font-semibold text-muted-foreground sm:text-center">
            {ruDayMonth(day.date).split(" ")[1]} · {day.weekday}
          </div>
        </div>
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-bold">
              {isToday ? "Мероприятия сегодня" : "Ближайшее мероприятие"}
            </p>
            <Badge variant="outline" className="border-primary/30 bg-primary/5 text-primary">
              через {Math.max(0, Math.round(((parseRuDate(day.date)?.getTime() ?? 0) - (parseRuDate(today)?.getTime() ?? 0)) / 86400000))} дн.
            </Badge>
          </div>
          <ul className="space-y-1.5">
            {events.slice(0, 3).map((e, i) => (
              <li key={i} className="flex items-start gap-2 text-[13px] leading-snug">
                <span className={`mt-0.5 shrink-0 ${e.className === null ? "text-amber-600 dark:text-amber-400" : "text-teal-700 dark:text-teal-400"}`}>
                  {e.className === null ? <Megaphone className="h-3.5 w-3.5" /> : <Users className="h-3.5 w-3.5" />}
                </span>
                <span className="min-w-0 break-words">
                  {e.className ? <span className="font-semibold text-teal-700 dark:text-teal-400">{e.className}: </span> : null}
                  {e.text}
                </span>
              </li>
            ))}
            {events.length > 3 ? (
              <li className="text-xs text-muted-foreground">и ещё {events.length - 3}…</li>
            ) : null}
          </ul>
        </div>
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={onOpenSheet}
        className="mt-3 h-8 gap-1.5 px-2 text-xs text-muted-foreground hover:text-primary"
      >
        <ExternalLink className="h-3.5 w-3.5" />
        Открыть таблицу-источник
      </Button>
    </SectionCard>
  );
}

export function EventsSection() {
  const events = useEvents();
  const [classFilter, setClassFilter] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [showPast, setShowPast] = useState(false);

  const today = fmtRu(nowNsk());
  const todayTs = parseRuDate(today)?.getTime() ?? 0;

  const flat = useMemo<FlatEvent[]>(() => {
    if (!events.data) return [];
    return events.data.days.flatMap(flattenDay);
  }, [events.data]);

  /** Отфильтрованные события: класс, поиск, прошедшие/будущие */
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return flat.filter((e) => {
      if (classFilter !== "all" && e.className !== null && e.className !== classFilter) return false;
      if (q && !e.text.toLowerCase().includes(q) && !ruDayMonth(e.date).toLowerCase().includes(q)) return false;
      const ts = parseRuDate(e.date)?.getTime() ?? 0;
      if (!showPast && ts < todayTs) return false;
      return true;
    });
  }, [flat, classFilter, query, showPast, todayTs]);

  /** Группировка по месяцам */
  const monthGroups = useMemo(() => {
    const groups: Array<{ key: string; label: string; events: FlatEvent[] }> = [];
    for (const e of filtered) {
      const m = e.date.slice(3);
      const key = m;
      const label = `${MONTHS_NOM[Number(e.date.slice(3, 5)) - 1]} ${e.date.slice(6)}`;
      const last = groups[groups.length - 1];
      if (last && last.key === key) last.events.push(e);
      else groups.push({ key, label, events: [e] });
    }
    return groups;
  }, [filtered]);

  const nextDay = events.data?.days.find((d) => {
    const ts = parseRuDate(d.date)?.getTime() ?? 0;
    return ts >= todayTs && (classFilter === "all" || d.byClass[classFilter] || d.general.length);
  });

  if (events.isLoading) {
    return (
      <div className="space-y-4">
        <SectionCard><LoadingBlock lines={4} /></SectionCard>
        <SectionCard><LoadingBlock lines={6} /></SectionCard>
      </div>
    );
  }

  if (events.isError || !events.data) {
    return (
      <SectionCard>
        <ErrorCard message="Календарь мероприятий временно недоступен" onRetry={() => events.refetch()} />
      </SectionCard>
    );
  }

  const upcomingCount = flat.filter((e) => (parseRuDate(e.date)?.getTime() ?? 0) >= todayTs).length;

  return (
    <div className="space-y-4">
      {/* Заголовок и фильтры */}
      <SectionCard
        title={events.data.title}
        icon={<CalendarClock className="h-4 w-4" />}
        action={<StaleBadge stale={events.data.stale} />}
      >
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Sparkles className="h-4 w-4 text-primary" />
            <span>
              <span className="font-bold text-foreground tabular-nums">{events.data.eventsTotal}</span> событий,{" "}
              <span className="font-bold text-foreground tabular-nums">{upcomingCount}</span> впереди
            </span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => window.open(events.data!.source, "_blank", "noopener,noreferrer")}
            className="h-8 gap-1.5 px-2 text-xs text-muted-foreground hover:text-primary"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Google-таблица
          </Button>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-[auto_1fr_auto] sm:items-center">
          <div className="space-y-1">
            <Label htmlFor="events-class" className="text-xs text-muted-foreground">Класс</Label>
            <Select value={classFilter} onValueChange={setClassFilter}>
              <SelectTrigger id="events-class" className="w-full sm:w-[170px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value="all">Все классы</SelectItem>
                {events.data.classes.map((c) => (
                  <SelectItem key={c} value={c}>{c} класс</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="events-search" className="sr-only">Поиск по мероприятиям</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="events-search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Поиск: ЕГЭ, пересдача, спецкурс…"
                className="pl-9"
              />
            </div>
          </div>
          <div className="flex items-center gap-2.5 sm:mt-4">
            <Switch id="events-past" checked={showPast} onCheckedChange={setShowPast} />
            <Label htmlFor="events-past" className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <History className="h-3.5 w-3.5" />
              Прошедшие
            </Label>
          </div>
        </div>
      </SectionCard>

      {/* Ближайшее */}
      {nextDay ? (
        <NextUpCard
          day={nextDay}
          today={today}
          onOpenSheet={() => window.open(events.data!.source, "_blank", "noopener,noreferrer")}
        />
      ) : null}

      {/* Лента по месяцам */}
      {monthGroups.length ? (
        <div className="space-y-4">
          {monthGroups.map((group) => (
            <SectionCard
              key={group.key}
              title={group.label}
              icon={<CalendarClock className="h-4 w-4" />}
              action={<Badge variant="outline" className="tabular-nums">{group.events.length}</Badge>}
            >
              <ul className="grid grid-cols-1 gap-2.5 lg:grid-cols-2">
                {group.events.map((e, i) => (
                  <EventRow key={`${e.date}-${e.className ?? "all"}-${i}`} event={e} today={today} highlight={!showPast || (parseRuDate(e.date)?.getTime() ?? 0) >= todayTs} />
                ))}
              </ul>
            </SectionCard>
          ))}
        </div>
      ) : (
        <SectionCard>
          <EmptyState
            text="По текущим фильтрам событий нет. Попробуйте другой класс, очистите поиск или включите прошедшие."
            icon={<CalendarClock className="h-8 w-8" />}
          />
        </SectionCard>
      )}

      <button
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        className="mx-auto flex h-10 items-center gap-1.5 rounded-xl border border-border/70 bg-secondary/40 px-4 text-xs font-semibold text-muted-foreground outline-none transition-all duration-200 hover:border-primary/40 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ArrowUp className="h-3.5 w-3.5" />
        Наверх
      </button>
    </div>
  );
}

"use client";

/** Общие мелкие компоненты разделов «СУНЦ Инфо» */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CloudOff, RefreshCw } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import type { Nutrition } from "./types";

/** Цветные пилюли БЖУ: белки — изумруд, жиры — янтарь, углеводы — тил */
export function MacroPills({ totals, size = "sm" }: { totals: Nutrition | null | undefined; size?: "sm" | "md" }) {
  const cls = size === "md" ? "text-xs px-2 py-0.5" : "text-[11px] px-1.5 py-0";
  return (
    <div className="flex flex-wrap items-center gap-1">
      <Badge variant="outline" className={`${cls} border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 font-semibold tabular-nums`}>
        Б {totals?.protein ?? "—"}
      </Badge>
      <Badge variant="outline" className={`${cls} border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400 font-semibold tabular-nums`}>
        Ж {totals?.fat ?? "—"}
      </Badge>
      <Badge variant="outline" className={`${cls} border-teal-500/30 bg-teal-500/10 text-teal-700 dark:text-teal-400 font-semibold tabular-nums`}>
        У {totals?.carbs ?? "—"}
      </Badge>
    </div>
  );
}

export function SectionCard({
  title,
  icon,
  action,
  children,
  className = "",
  contentClassName = "",
}: {
  title?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  return (
    <Card className={`border-border/70 shadow-sm ${className}`}>
      {title ? (
        <CardHeader className="pb-3 pt-4 px-4 sm:px-6">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-base font-bold tracking-tight">
              {icon && <span className="text-primary">{icon}</span>}
              {title}
            </CardTitle>
            {action}
          </div>
        </CardHeader>
      ) : null}
      <CardContent className={`px-4 sm:px-6 pb-4 sm:pb-6 ${title ? "pt-0" : "pt-4"} ${contentClassName}`}>
        {children}
      </CardContent>
    </Card>
  );
}

export function StaleBadge({ stale }: { stale?: boolean }) {
  if (!stale) return null;
  return (
    <Badge variant="outline" className="gap-1 border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400">
      <CloudOff className="h-3 w-3" />
      из кэша
    </Badge>
  );
}

export function ErrorCard({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
      <div className="flex items-start gap-2 text-sm text-destructive">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <span>{message}</span>
      </div>
      {onRetry ? (
        <Button size="sm" variant="outline" onClick={onRetry} className="gap-1.5">
          <RefreshCw className="h-3.5 w-3.5" />
          Повторить
        </Button>
      ) : null}
    </div>
  );
}

export function LoadingBlock({ lines = 3, className = "" }: { lines?: number; className?: string }) {
  return (
    <div className={`space-y-3 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className="h-5 w-full" style={{ width: `${88 - i * 12}%` }} />
      ))}
    </div>
  );
}

export function EmptyState({ text, icon }: { text: string; icon?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-8 text-center text-muted-foreground">
      {icon && <div className="opacity-60">{icon}</div>}
      <p className="text-sm max-w-sm">{text}</p>
    </div>
  );
}

/** Дата в формате «30 августа, воскресенье» */
export function humanDate(dateStr: string): string {
  const months = [
    "января", "февраля", "марта", "апреля", "мая", "июня",
    "июля", "августа", "сентября", "октября", "ноября", "декабря",
  ];
  const weekdays = ["воскресенье", "понедельник", "вторник", "среда", "четверг", "пятница", "суббота"];
  const m = dateStr.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!m) return dateStr;
  const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  return `${Number(m[1])} ${months[Number(m[2]) - 1]}, ${weekdays[d.getDay()]}`;
}

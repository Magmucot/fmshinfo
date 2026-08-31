"use client";

/** Раздел «Погода»: текущая + прогноз на 3 дня (Open-Meteo → wttr.in) */

import { Badge } from "@/components/ui/badge";
import { CloudSun, Droplets, Sunrise, Sunset, Thermometer, Umbrella, Wind } from "lucide-react";
import { useWeather } from "../api";
import { ErrorCard, LoadingBlock, SectionCard, StaleBadge } from "../shared";

export function WeatherSection() {
  const weather = useWeather();

  if (weather.isLoading) {
    return (
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <SectionCard className="lg:col-span-1">
          <LoadingBlock lines={4} />
        </SectionCard>
        <SectionCard className="lg:col-span-2">
          <LoadingBlock lines={4} />
        </SectionCard>
      </div>
    );
  }

  if (weather.isError || !weather.data) {
    return (
      <SectionCard>
        <ErrorCard
          message={(weather.error as Error)?.message ?? "Погода временно недоступна"}
          onRetry={() => weather.refetch()}
        />
      </SectionCard>
    );
  }

  const c = weather.data.current;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Текущая погода */}
        <SectionCard
          className="lg:col-span-1"
          title="Сейчас в Академгородке"
          icon={<CloudSun className="h-4 w-4" />}
          action={<StaleBadge stale={weather.data.stale} />}
        >
          <div className="flex items-center gap-5">
            <div className="text-7xl leading-none select-none" aria-hidden>
              {c.icon}
            </div>
            <div>
              <div className="text-5xl font-extrabold tracking-tight tabular-nums">
                {c.temperature ?? "—"}
                <span className="text-2xl font-bold text-muted-foreground">°C</span>
              </div>
              <p className="mt-1 text-sm font-medium">{c.description}</p>
              {c.apparent !== null ? (
                <p className="text-xs text-muted-foreground">Ощущается как {c.apparent}°</p>
              ) : null}
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-2.5">
            <div className="flex items-center gap-2.5 rounded-xl bg-secondary/50 p-3">
              <Thermometer className="h-4 w-4 text-primary shrink-0" />
              <div>
                <p className="text-[11px] text-muted-foreground">Влажность</p>
                <p className="text-sm font-bold tabular-nums">{c.humidity !== null ? `${c.humidity}%` : "—"}</p>
              </div>
            </div>
            <div className="flex items-center gap-2.5 rounded-xl bg-secondary/50 p-3">
              <Wind className="h-4 w-4 text-primary shrink-0" />
              <div>
                <p className="text-[11px] text-muted-foreground">Ветер</p>
                <p className="text-sm font-bold tabular-nums">
                  {c.windSpeed !== null ? `${c.windSpeed} м/с` : "—"}
                  {c.windDirection ? <span className="font-medium text-muted-foreground"> {c.windDirection}</span> : null}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2.5 rounded-xl bg-secondary/50 p-3">
              <Sunrise className="h-4 w-4 text-primary shrink-0" />
              <div>
                <p className="text-[11px] text-muted-foreground">Рассвет</p>
                <p className="text-sm font-bold tabular-nums">{c.sunrise ?? "—"}</p>
              </div>
            </div>
            <div className="flex items-center gap-2.5 rounded-xl bg-secondary/50 p-3">
              <Sunset className="h-4 w-4 text-primary shrink-0" />
              <div>
                <p className="text-[11px] text-muted-foreground">Закат</p>
                <p className="text-sm font-bold tabular-nums">{c.sunset ?? "—"}</p>
              </div>
            </div>
          </div>
        </SectionCard>

        {/* Прогноз */}
        <SectionCard className="lg:col-span-2" title="Прогноз на 3 дня">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {weather.data.forecast.map((day, i) => (
              <div
                key={i}
                className="flex flex-col items-center rounded-xl border border-border/60 bg-secondary/30 p-4 text-center transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-sm"
              >
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {day.day} · {day.date}
                </p>
                <div className="mt-2 text-5xl leading-none select-none" aria-hidden>
                  {day.icon}
                </div>
                <p className="mt-2 text-xs text-muted-foreground">{day.description}</p>
                <p className="mt-2 text-lg font-extrabold tabular-nums">
                  {day.tempMax ?? "—"}°
                  <span className="ml-1 text-sm font-semibold text-muted-foreground">
                    / {day.tempMin ?? "—"}°
                  </span>
                </p>
                {day.precipitationProbability !== null ? (
                  <Badge variant="outline" className="mt-2 gap-1 text-[11px]">
                    <Umbrella className="h-3 w-3" />
                    осадки {day.precipitationProbability}%
                  </Badge>
                ) : null}
              </div>
            ))}
          </div>
          <p className="mt-4 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Droplets className="h-3.5 w-3.5" />
            Источник: {weather.data.source} · координаты СУНЦ НГУ: 54.842° с.ш., 83.098° в.д. · обновление каждые 10 минут
          </p>
        </SectionCard>
      </div>
    </div>
  );
}

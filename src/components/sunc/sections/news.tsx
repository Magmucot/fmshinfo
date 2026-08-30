"use client";

/** Раздел «Новости»: лента sesc.nsu.ru/media/news */

import { Badge } from "@/components/ui/badge";
import { ExternalLink, Newspaper } from "lucide-react";
import { useNews } from "../api";
import { ErrorCard, LoadingBlock, SectionCard, StaleBadge, EmptyState } from "../shared";

export function NewsSection() {
  const news = useNews(12);

  return (
    <SectionCard
      title="Новости СУНЦ НГУ"
      icon={<Newspaper className="h-4 w-4" />}
      action={<StaleBadge stale={news.data?.stale} />}
    >
      {news.isLoading ? (
        <LoadingBlock lines={6} />
      ) : news.isError || !news.data ? (
        <ErrorCard message="Новости временно недоступны" onRetry={() => news.refetch()} />
      ) : news.data.items.length ? (
        <div className="max-h-[560px] space-y-2.5 overflow-y-auto custom-scroll pr-1">
          {news.data.items.map((item) => (
            <a
              key={item.id}
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-start justify-between gap-3 rounded-xl border border-border/60 bg-secondary/30 p-3.5 transition-all hover:border-primary/40 hover:bg-accent hover:shadow-sm"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold leading-snug transition-colors group-hover:text-primary">
                  {item.title}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {item.date ? (
                    <Badge variant="outline" className="text-[11px] tabular-nums">{item.date}</Badge>
                  ) : null}
                  {item.rubric ? <Badge variant="secondary" className="text-[11px]">{item.rubric}</Badge> : null}
                </div>
              </div>
              <ExternalLink className="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
            </a>
          ))}
        </div>
      ) : (
        <EmptyState text="Новостей не найдено" icon={<Newspaper className="h-8 w-8" />} />
      )}
      <p className="mt-3 text-xs text-muted-foreground">
        Источник:{" "}
        <a
          href="https://sesc.nsu.ru/media/news/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary hover:underline"
        >
          sesc.nsu.ru → Новости
        </a>
      </p>
    </SectionCard>
  );
}

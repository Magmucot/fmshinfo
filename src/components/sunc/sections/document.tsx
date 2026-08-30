"use client";

/** Раздел «Документ»: полный аналитический документ (docs/sunc-info-analysis.md) */

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { FileText } from "lucide-react";
import { useDocument } from "../api";
import { ErrorCard, LoadingBlock, SectionCard } from "../shared";

export function DocumentSection() {
  const doc = useDocument();

  return (
    <SectionCard
      title="Аналитический документ: источники данных СУНЦ НГУ и НГУ"
      icon={<FileText className="h-4 w-4" />}
    >
      {doc.isLoading ? (
        <LoadingBlock lines={10} />
      ) : doc.isError || !doc.data ? (
        <ErrorCard message="Документ не найден" onRetry={() => doc.refetch()} />
      ) : (
        <>
          <p className="mb-4 rounded-xl border border-border/60 bg-secondary/40 px-3.5 py-2.5 text-xs leading-relaxed text-muted-foreground">
            Комплексный анализ официальных сайтов СУНЦ НГУ и НГУ: где публикуются меню столовой, расписание
            звонков и занятий, дежурства, ночные вожатые и погода; форматы данных, алгоритмы парсеров,
            модель данных, спецификация API и рекомендации для сайта и Telegram-бота. Файл:{" "}
            <code className="rounded bg-muted px-1 py-0.5">docs/sunc-info-analysis.md</code>
          </p>
          <div className="doc-prose max-h-[70vh] overflow-y-auto custom-scroll pr-2 text-sm">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{doc.data.markdown}</ReactMarkdown>
          </div>
        </>
      )}
    </SectionCard>
  );
}

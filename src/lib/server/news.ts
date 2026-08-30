/**
 * Парсер новостей sesc.nsu.ru/media/news (раздел 3.7 документа).
 *
 * Каталог (CMS Битрикс): ссылки /media/news/<рубрика>/<id>/,
 * заголовок — текст <a>, дата рядом в формате ДД.ММ.ГГГГ.
 */

import { NEWS_URL, SESC_BASE, fetchWithTimeout } from "./sources";

export interface NewsItem {
  id: string;
  title: string;
  url: string;
  date: string | null;
  rubric: string | null;
}

const RUBRICS: Record<string, string> = {
  obrazovanie: "Образование",
  atmosfera: "Атмосфера",
  nauka: "Наука",
  sport: "Спорт",
  media: "Медиа",
};

const LINK_RE = /<a[^>]+href=["'](\/media\/news\/([a-z-]+)\/(\d+)\/)["'][^>]*>([\s\S]*?)<\/a>/gi;
const DATE_RE = /(\d{2}\.\d{2}\.\d{4})/g;

function stripTags(fragment: string): string {
  return fragment
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export async function getNews(limit = 12): Promise<{ items: NewsItem[] }> {
  const response = await fetchWithTimeout(NEWS_URL, { timeoutMs: 20000 });
  if (!response.ok) throw new Error(`Страница новостей недоступна: HTTP ${response.status}`);
  const html = await response.text();

  // Даты встречаются в том же порядке, что и новости — собираем общий поток
  const dates: string[] = [];
  let dateMatch: RegExpExecArray | null;
  DATE_RE.lastIndex = 0;
  while ((dateMatch = DATE_RE.exec(html)) !== null) dates.push(dateMatch[1]);

  const items: NewsItem[] = [];
  const seen = new Set<string>();
  let linkIndex = 0;
  let match: RegExpExecArray | null;
  LINK_RE.lastIndex = 0;
  while ((match = LINK_RE.exec(html)) !== null) {
    const [, href, rubric, id, titleHtml] = match;
    const title = stripTags(titleHtml);
    if (!title || seen.has(id)) {
      continue;
    }
    seen.add(id);
    // дат в потоке может быть меньше, чем ссылок (дубли ссылок) — берём по индексу
    const date = dates[linkIndex] ?? dates[dates.length - 1] ?? null;
    items.push({
      id,
      title,
      url: SESC_BASE + href,
      date,
      rubric: RUBRICS[rubric] ?? rubric,
    });
    linkIndex++;
    if (items.length >= 25) break;
  }

  if (items.length === 0) throw new Error("Не удалось разобрать список новостей");

  // свежие сверху (по дате, затем по порядку на странице)
  items.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "") || b.id.localeCompare(a.id));
  return { items: items.slice(0, limit) };
}

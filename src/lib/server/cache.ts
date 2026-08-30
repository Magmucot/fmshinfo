/**
 * Простой TTL-кэш в памяти (раздел 6 документа docs/sunc-info-analysis.md).
 * При ошибке источника отдаём последний успешный результат с пометкой stale.
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const store = new Map<string, CacheEntry<unknown>>();
const staleStore = new Map<string, unknown>();

export function cacheGet<T>(key: string): T | null {
  const entry = store.get(key);
  if (entry && entry.expiresAt > Date.now()) return entry.value as T;
  return null;
}

export function cachePeekStale<T>(key: string): T | null {
  const fresh = cacheGet<T>(key);
  if (fresh !== null) return fresh;
  return (staleStore.get(key) as T) ?? null;
}

export function cachePut<T>(key: string, value: T, ttlMs: number): void {
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
  staleStore.set(key, value);
}

/** TTL-константы: меню/расписание 1 ч, погода 10 мин, новости 6 ч */
export const TTL = {
  menu: 60 * 60 * 1000,
  schedule: 60 * 60 * 1000,
  weather: 10 * 60 * 1000,
  news: 6 * 60 * 60 * 1000,
} as const;

/**
 * Кэшированный вызов источника: кэш → источник → stale-кэш при ошибке.
 * Возвращает { data, stale } либо выбрасывает ошибку, если данных нет вовсе.
 */
export async function cached<T>(
  key: string,
  ttlMs: number,
  fetcher: () => Promise<T>
): Promise<{ data: T; stale: boolean }> {
  const fresh = cacheGet<T>(key);
  if (fresh !== null) return { data: fresh, stale: false };

  try {
    const value = await fetcher();
    cachePut(key, value, ttlMs);
    return { data: value, stale: false };
  } catch (error) {
    const stale = cachePeekStale<T>(key);
    if (stale !== null) return { data: stale, stale: true };
    throw error;
  }
}

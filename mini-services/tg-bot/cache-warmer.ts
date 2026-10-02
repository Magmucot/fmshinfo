export interface CacheWarmerOptions {
  apiFetcher: <T>(path: string, ttlMs?: number) => Promise<T | null>;
  getActiveClasses: () => string[];
  logger?: {
    info: (...args: any[]) => void;
    warn: (...args: any[]) => void;
    error: (...args: any[]) => void;
    debug?: (...args: any[]) => void;
  };
  intervalMs?: number;
}

const DEFAULT_INTERVAL_MS = 30 * 60 * 1000; // 30 минут
const STAGGER_DELAY_MS = 150; // 150 мс задержка между запросами
const FALLBACK_CLASSES = ["10-1", "10-2", "11-1", "11-2"];

/** Проверка дневного интервала по Новосибирскому времени (07:00–20:00 NSK / UTC+7) */
export function isDaytimeNsk(date = new Date()): boolean {
  const nskHour = (date.getUTCHours() + 7) % 24;
  return nskHour >= 7 && nskHour < 20;
}

export class CacheWarmer {
  private intervalTimer?: ReturnType<typeof setInterval>;
  private initialTimer?: ReturnType<typeof setTimeout>;
  private isWarming = false;
  private readonly options: CacheWarmerOptions;
  private readonly intervalMs: number;

  constructor(options: CacheWarmerOptions) {
    this.options = options;
    this.intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
  }

  private get logger() {
    return this.options.logger ?? console;
  }

  start(): void {
    // Начальный прогрев через 3 секунды после запуска
    this.initialTimer = setTimeout(() => {
      void this.warmNow();
    }, 3000);
    this.initialTimer.unref();

    // Периодический прогрев каждые 30 минут
    this.intervalTimer = setInterval(() => {
      void this.warmNow();
    }, this.intervalMs);
    this.intervalTimer.unref();

    this.logger.info(
      "CACHE_WARMER",
      `Фоновый прогрев кэша запущен (интервал: ${Math.round(this.intervalMs / 60000)} мин, окно 07:00–20:00 NSK)`
    );
  }

  stop(): void {
    if (this.initialTimer) {
      clearTimeout(this.initialTimer);
      this.initialTimer = undefined;
    }
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = undefined;
    }
    this.logger.info("CACHE_WARMER", "Фоновый прогрев кэша остановлен");
  }

  async warmNow(): Promise<void> {
    if (this.isWarming) return;

    if (!isDaytimeNsk()) {
      const nskHour = (new Date().getUTCHours() + 7) % 24;
      this.logger.debug?.("CACHE_WARMER", `Ночной интервал (${nskHour}:00 NSK) — прогрев пропущен`);
      return;
    }

    this.isWarming = true;
    const startTime = Date.now();

    try {
      this.logger.info("CACHE_WARMER", "Старт цикла фонового прогрева кэша...");

      // 1. Прогрев столовой и звонков (TTL: 60 минут / 12 часов)
      await this.safeFetch("/api/menu", 60 * 60 * 1000);
      await this.safeFetch("/api/canteen/schedule", 60 * 60 * 1000);
      await this.safeFetch("/api/bells", 12 * 60 * 60 * 1000);

      // 2. Прогрев расписания для зарегистрированных активных классов
      let activeClasses = this.options.getActiveClasses();
      if (!activeClasses || activeClasses.length === 0) {
        activeClasses = FALLBACK_CLASSES;
      }
      const uniqueClasses = Array.from(new Set(activeClasses.filter(Boolean)));

      for (const cls of uniqueClasses) {
        await this.safeFetch(`/api/schedule?group=${encodeURIComponent(cls)}`, 60 * 60 * 1000);
        // Небольшая задержка между запросами для равномерного распределения нагрузки
        await new Promise((resolve) => setTimeout(resolve, STAGGER_DELAY_MS));
      }

      const dur = Date.now() - startTime;
      this.logger.info(
        "CACHE_WARMER",
        `Цикл прогрева успешно завершён за ${dur}мс (${uniqueClasses.length} классов)`
      );
    } catch (err) {
      this.logger.warn("CACHE_WARMER", "Ошибка цикла фонового прогрева", err);
    } finally {
      this.isWarming = false;
    }
  }

  private async safeFetch(path: string, ttlMs: number): Promise<void> {
    try {
      await this.options.apiFetcher(path, ttlMs);
    } catch (err) {
      this.logger.warn("CACHE_WARMER", `Не удалось прогреть ${path}`, err);
    }
  }
}

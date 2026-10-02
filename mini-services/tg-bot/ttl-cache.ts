export interface BoundedTTLOptions {
  maxEntries?: number;
  ttlMs?: number;
  defaultTtlMs?: number;
  sweepIntervalMs?: number;
}

interface CacheEntry<V> {
  value: V;
  expiresAt: number;
}

export class BoundedTTLMap<K, V> {
  private readonly map = new Map<K, CacheEntry<V>>();
  readonly maxEntries: number;
  readonly ttlMs: number;
  private sweepTimer?: ReturnType<typeof setInterval>;

  constructor(maxEntries: number, ttlMs?: number);
  constructor(options: BoundedTTLOptions);
  constructor(maxEntriesOrOptions: number | BoundedTTLOptions, ttlMs?: number) {
    if (typeof maxEntriesOrOptions === "number") {
      this.maxEntries = maxEntriesOrOptions;
      this.ttlMs = ttlMs ?? 5 * 60 * 1000;
    } else {
      this.maxEntries = maxEntriesOrOptions.maxEntries ?? 1000;
      this.ttlMs = maxEntriesOrOptions.ttlMs ?? maxEntriesOrOptions.defaultTtlMs ?? 5 * 60 * 1000;
    }

    const sweepInterval =
      typeof maxEntriesOrOptions === "object" && maxEntriesOrOptions.sweepIntervalMs !== undefined
        ? maxEntriesOrOptions.sweepIntervalMs
        : 60 * 1000;

    if (sweepInterval > 0) {
      this.sweepTimer = setInterval(() => {
        this.sweep();
      }, sweepInterval);
      this.sweepTimer.unref();
    }
  }

  get(key: K): V | undefined {
    const entry = this.map.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.map.delete(key);
      return undefined;
    }
    // Обновляем позицию для сохранения порядка LRU
    this.map.delete(key);
    this.map.set(key, entry);
    return entry.value;
  }

  set(key: K, value: V, customTtlMs?: number): this {
    const expiresAt = Date.now() + (customTtlMs !== undefined ? customTtlMs : this.ttlMs);
    if (this.map.has(key)) {
      this.map.delete(key);
    } else if (this.map.size >= this.maxEntries) {
      // Вытеснение наименее недавно использованной записи (первый элемент итератора Map)
      const oldestKey = this.map.keys().next().value;
      if (oldestKey !== undefined) {
        this.map.delete(oldestKey);
      }
    }
    this.map.set(key, { value, expiresAt });
    return this;
  }

  has(key: K): boolean {
    const entry = this.map.get(key);
    if (!entry) return false;
    if (Date.now() > entry.expiresAt) {
      this.map.delete(key);
      return false;
    }
    return true;
  }

  delete(key: K): boolean {
    return this.map.delete(key);
  }

  clear(): void {
    this.map.clear();
  }

  get size(): number {
    this.sweep();
    return this.map.size;
  }

  sweep(): void {
    const now = Date.now();
    for (const [key, entry] of this.map.entries()) {
      if (now > entry.expiresAt) {
        this.map.delete(key);
      }
    }
  }

  destroy(): void {
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer);
      this.sweepTimer = undefined;
    }
    this.clear();
  }

  // Поддержка итерации
  keys(): IterableIterator<K> {
    this.sweep();
    return this.map.keys();
  }

  values(): V[] {
    this.sweep();
    return Array.from(this.map.values()).map((e) => e.value);
  }

  entries(): [K, V][] {
    this.sweep();
    return Array.from(this.map.entries()).map(([k, e]) => [k, e.value]);
  }

  [Symbol.iterator](): IterableIterator<[K, CacheEntry<V>]> {
    this.sweep();
    return this.map[Symbol.iterator]();
  }
}

export class BoundedTTLSet<T> {
  private readonly map: BoundedTTLMap<T, boolean>;

  constructor(maxEntries: number, ttlMs?: number);
  constructor(options: BoundedTTLOptions);
  constructor(maxEntriesOrOptions: number | BoundedTTLOptions, ttlMs?: number) {
    if (typeof maxEntriesOrOptions === "number") {
      this.map = new BoundedTTLMap<T, boolean>(maxEntriesOrOptions, ttlMs);
    } else {
      this.map = new BoundedTTLMap<T, boolean>(maxEntriesOrOptions);
    }
  }

  add(value: T, customTtlMs?: number): this {
    this.map.set(value, true, customTtlMs);
    return this;
  }

  has(value: T): boolean {
    return this.map.has(value);
  }

  delete(value: T): boolean {
    return this.map.delete(value);
  }

  clear(): void {
    this.map.clear();
  }

  get size(): number {
    return this.map.size;
  }

  sweep(): void {
    this.map.sweep();
  }

  destroy(): void {
    this.map.destroy();
  }
}

// Псевдонимы для обратной совместимости со спецификацией адаптера
export const TtlMap = BoundedTTLMap;
export const TtlSet = BoundedTTLSet;

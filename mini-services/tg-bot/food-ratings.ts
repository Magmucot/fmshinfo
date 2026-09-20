export interface FoodRatingSummary {
  average: number;
  votes: number;
}

export interface FoodRatingEntry {
  dishName: string;
  scores: Record<string, number>;
  updatedAt: string;
}

export interface FoodRatingsData {
  version: 1;
  entries: Record<string, FoodRatingEntry>;
}

export interface FoodRatingTarget {
  date: string;
  mealType: string;
  dishName: string;
}

function normalizePart(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("ru-RU")
    .replace(/\s+/g, " ")
    .trim();
}

export function foodRatingKey(target: FoodRatingTarget): string {
  return [target.date.trim(), normalizePart(target.mealType), normalizePart(target.dishName)].join("|");
}

function isScore(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 5;
}

function cloneEntry(entry: FoodRatingEntry): FoodRatingEntry {
  return { dishName: entry.dishName, scores: { ...entry.scores }, updatedAt: entry.updatedAt };
}

/**
 * Хранилище оценок без персональных данных в выдаче.
 * Идентификатор Telegram нужен только как ключ, чтобы один пользователь мог
 * поставить одну оценку конкретному блюду и позднее её изменить.
 */
export class FoodRatingBook {
  private readonly entries = new Map<string, FoodRatingEntry>();

  constructor(data?: unknown) {
    if (data) this.load(data);
  }

  vote(target: FoodRatingTarget, userId: number, score: number, now = new Date()): FoodRatingSummary {
    if (!Number.isSafeInteger(userId) || userId <= 0) throw new Error("Некорректный пользователь");
    if (!isScore(score)) throw new Error("Оценка должна быть от 1 до 5");

    const key = foodRatingKey(target);
    const existing = this.entries.get(key) ?? {
      dishName: target.dishName.trim(),
      scores: {},
      updatedAt: now.toISOString(),
    };
    existing.scores[String(userId)] = score;
    existing.updatedAt = now.toISOString();
    this.entries.set(key, existing);
    return this.summary(target) ?? { average: score, votes: 1 };
  }

  summary(target: FoodRatingTarget): FoodRatingSummary | null {
    const entry = this.entries.get(foodRatingKey(target));
    if (!entry) return null;
    const scores = Object.values(entry.scores).filter(isScore);
    if (!scores.length) return null;
    const average = Math.round((scores.reduce((sum, score) => sum + score, 0) / scores.length) * 10) / 10;
    return { average, votes: scores.length };
  }

  toJSON(): FoodRatingsData {
    return {
      version: 1,
      entries: Object.fromEntries(
        [...this.entries.entries()].map(([key, entry]) => [key, cloneEntry(entry)])
      ),
    };
  }

  private load(value: unknown): void {
    if (!value || typeof value !== "object") return;
    const entries = (value as { entries?: unknown }).entries;
    if (!entries || typeof entries !== "object" || Array.isArray(entries)) return;

    for (const [key, rawEntry] of Object.entries(entries)) {
      if (!rawEntry || typeof rawEntry !== "object") continue;
      const { dishName, scores, updatedAt } = rawEntry as Partial<FoodRatingEntry>;
      if (typeof dishName !== "string" || !dishName.trim() || !scores || typeof scores !== "object" || Array.isArray(scores)) continue;

      const validScores: Record<string, number> = {};
      for (const [userId, score] of Object.entries(scores)) {
        if (/^[1-9]\d*$/.test(userId) && isScore(score)) validScores[userId] = score;
      }
      if (!Object.keys(validScores).length) continue;
      this.entries.set(key, {
        dishName: dishName.trim(),
        scores: validScores,
        updatedAt: typeof updatedAt === "string" ? updatedAt : new Date(0).toISOString(),
      });
    }
  }
}

function pluralVotes(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod100 >= 11 && mod100 <= 19) return "оценок";
  if (mod10 === 1) return "оценка";
  if (mod10 >= 2 && mod10 <= 4) return "оценки";
  return "оценок";
}

export function formatFoodRating(summary: FoodRatingSummary | null): string {
  if (!summary) return "";
  return `⭐ ${summary.average.toFixed(1)} (${summary.votes} ${pluralVotes(summary.votes)})`;
}

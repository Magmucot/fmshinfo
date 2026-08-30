/** Утилиты анализа блюд: аллергены, вегетарианское, высокобелковые */

import type { Dish } from "./types";

export interface AllergenDef {
  id: string;
  label: string;
  /** слова-маркеры в названии и составе (нижний регистр) */
  markers: string[];
}

/** Популярные аллергены школьного меню (по названию + составу блюда) */
export const ALLERGENS: AllergenDef[] = [
  {
    id: "milk",
    label: "молоко",
    markers: [
      "молок", "масло сливочное", "сыр", "творог", "сметан", "сливк", "кефир",
      "йогурт", "мороженое", "пломбир", "сгущен", "маргарин",
    ],
  },
  {
    id: "gluten",
    label: "глютен",
    markers: [
      "пшеничн", "мука пшеничн", "макарон", "вермишель", "хлеб", "булка", "батон",
      "сушка", "печенье", "пряник", "вареник", "пельмен", "лапша", "бисквит", "крупа манная", "манн",
    ],
  },
  {
    id: "egg",
    label: "яйца",
    markers: ["яйц", "омлет", "яичниц", "меланж", "майонез"],
  },
  {
    id: "fish",
    label: "рыба",
    markers: ["рыб", "горбуш", "минта", "треск", "селед", "кета", "скумбри", "мойв", "наваг", "камбал", "кетовая"],
  },
  {
    id: "nuts",
    label: "орехи",
    markers: ["орех", "миндал", "арахис", "фисташк", "кешью", "грецк", "кунжут", "халв"],
  },
];

const MEAT_MARKERS = [
  "мяс", "говядин", "свинин", "баранин", "телятин", "кури", "куриц", "бройлер", "индейк",
  "индюк", "утк", "гус", "котлет", "тефтел", "биточк", "шницель", "колбас", "сосиск",
  "сардельк", "ветчин", "бекон", "фарш", "печен", "язык", "сердц", "пупк", "филе курин",
  "курина", "цыпл", "буженин", "карбонад", " рулет мясн", "буженина", "кролик", "перепел",
];

const FISH_MARKERS = ALLERGENS.find((a) => a.id === "fish")!.markers;

export interface DishFlags {
  vegetarian: boolean;
  vegan: boolean;
  highProtein: boolean;
  allergens: string[]; // id аллергенов
}

/** Определяет свойства блюда по названию и составу */
export function analyzeDish(dish: Dish): DishFlags {
  const text = `${dish.name} ${dish.ingredients ?? ""}`.toLowerCase();

  const allergens = ALLERGENS.filter((a) => a.markers.some((m) => text.includes(m))).map((a) => a.id);
  const hasMeat = MEAT_MARKERS.some((m) => text.includes(m));
  const hasFish = FISH_MARKERS.some((m) => text.includes(m));
  const hasMilk = allergens.includes("milk");
  const hasEgg = allergens.includes("egg");
  const hasHoney = text.includes("мед") || text.includes("мёд");

  return {
    vegetarian: !hasMeat && !hasFish,
    vegan: !hasMeat && !hasFish && !hasMilk && !hasEgg && !hasHoney,
    highProtein: typeof dish.protein === "number" && dish.protein >= 12,
    allergens,
  };
}

export type DishFilterId = "vegetarian" | "highProtein" | "no-milk" | "no-gluten" | "no-egg" | "no-fish" | "no-nuts";

export interface DishFilterDef {
  id: DishFilterId;
  label: string;
  /** предикат: dish + флаги → проходит ли фильтр */
  match: (dish: Dish, flags: DishFlags) => boolean;
}

export const DISH_FILTERS: DishFilterDef[] = [
  { id: "vegetarian", label: "Вегетарианское", match: (_d, f) => f.vegetarian },
  { id: "highProtein", label: "Высокобелковые", match: (_d, f) => f.highProtein },
  {
    id: "no-milk",
    label: "Без молока",
    match: (_d, f) => !f.allergens.includes("milk"),
  },
  {
    id: "no-gluten",
    label: "Без глютена",
    match: (_d, f) => !f.allergens.includes("gluten"),
  },
  {
    id: "no-egg",
    label: "Без яиц",
    match: (_d, f) => !f.allergens.includes("egg"),
  },
  {
    id: "no-fish",
    label: "Без рыбы",
    match: (_d, f) => !f.allergens.includes("fish"),
  },
  {
    id: "no-nuts",
    label: "Без орехов",
    match: (_d, f) => !f.allergens.includes("nuts"),
  },
];

/** Поиск блюда: все слова запроса должны встречаться в названии или составе */
export function dishMatchesQuery(dish: Dish, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = `${dish.name} ${dish.ingredients ?? ""}`.toLowerCase();
  return q.split(/\s+/).filter(Boolean).every((word) => haystack.includes(word));
}

/** Подсветка совпадений поиска: возвращает части строки */
export function splitHighlight(text: string, query: string): Array<{ text: string; hit: boolean }> {
  const q = query.trim().toLowerCase();
  if (!q) return [{ text, hit: false }];
  const words = [...new Set(q.split(/\s+/).filter((w) => w.length > 0))];
  if (!words.length) return [{ text, hit: false }];

  const lower = text.toLowerCase();
  const ranges: Array<[number, number]> = [];
  for (const word of words) {
    let idx = lower.indexOf(word);
    while (idx !== -1) {
      ranges.push([idx, idx + word.length]);
      idx = lower.indexOf(word, idx + word.length);
    }
  }
  if (!ranges.length) return [{ text, hit: false }];
  ranges.sort((a, b) => a[0] - b[0]);

  const merged: Array<[number, number]> = [];
  for (const range of ranges) {
    const last = merged[merged.length - 1];
    if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1]);
    else merged.push([...range] as [number, number]);
  }

  const parts: Array<{ text: string; hit: boolean }> = [];
  let cursor = 0;
  for (const [start, end] of merged) {
    if (start > cursor) parts.push({ text: text.slice(cursor, start), hit: false });
    parts.push({ text: text.slice(start, end), hit: true });
    cursor = end;
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor), hit: false });
  return parts;
}

/** Текстовое меню дня для «Поделиться» */
export function menuToShareText(date: string, meals: Array<{ type: string; dishes: Dish[] }>, dayKcal: number | null): string {
  const lines = [`🍽 Меню столовой СУНЦ НГУ на ${date}:`, ""];
  for (const meal of meals) {
    lines.push(`▸ ${meal.type}:`);
    for (const dish of meal.dishes) {
      lines.push(`  • ${dish.name}${dish.weight ? ` (${dish.weight} г)` : ""}`);
    }
    lines.push("");
  }
  if (dayKcal) lines.push(`Всего за день: ${dayKcal} ккал`);
  lines.push("— СУНЦ Инфо");
  return lines.join("\n");
}

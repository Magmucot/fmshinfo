/**
 * Парсер меню столовой СУНЦ НГУ (раздел 3.1 документа).
 *
 * Схема: sesc.nsu.ru/sveden/catering (HTML-каталог, CMS Битрикс)
 *   → ссылки /upload/iblock/<hash>/menu_ДД.ММ.ГГ.pdf (хэш меняется ежедневно!)
 *   → скачивание PDF → pdftotext -layout → разбор секций приёмов пищи.
 *
 * Особенности вёрстки PDF (проверено на реальных файлах):
 *  — КБЖУ блюда может занимать 2 строки: «Ккал-…, Белки-…, Жиры-…» строкой
 *    ВЫШЕ блюда, «Углеводы-…» — в строке блюда;
 *  — 4-значные значения пишутся с пробелом: «Ккал-2 866»;
 *  — ингредиенты — отдельные строки, начинаются со строчной буквы ИЛИ
 *    с заглавной, но содержат запятые («Кета, Лук репчатый, …»);
 *  — после секции «Итого за <приём> Ккал-…, Белки-…, Жиры-…, Углеводы-…»;
 *  — в конце — итоги за день без подписи (просто строки КБЖУ).
 */

import { spawn, execFile } from "child_process";
import { promisify } from "util";
import { CATERING_URL, SESC_BASE, fetchWithTimeout } from "./sources";
import { cached, TTL } from "./cache";

const execFileAsync = promisify(execFile);

export interface Dish {
  weight: number | null;
  name: string;
  kcal: number | null;
  protein: number | null;
  fat: number | null;
  carbs: number | null;
  ingredients: string | null;
}

export interface MealSection {
  type: string;
  dishes: Dish[];
  totals: { kcal: number | null; protein: number | null; fat: number | null; carbs: number | null };
}

export interface MenuData {
  date: string;
  requestedDate: string;
  substituted: boolean;
  message: string | null;
  pdfUrl: string;
  availableDates: string[];
  meals: MealSection[];
  dayTotals: { kcal: number | null; protein: number | null; fat: number | null; carbs: number | null };
}

const SECTION_NAMES = ["Завтрак", "Второй завтрак", "Обед", "Полдник", "Ужин", "Второй ужин"] as const;
const SECTION_ALIASES: Record<string, string> = Object.fromEntries(
  SECTION_NAMES.map((n) => [n.toLowerCase(), n])
);
// Сокращения из PDF (напр. «Итого за Вт.завтрак», секция «Вт. ужин»)
SECTION_ALIASES["2-й ужин"] = "Второй ужин";
SECTION_ALIASES["2 ужин"] = "Второй ужин";
SECTION_ALIASES["поздний ужин"] = "Второй ужин";
SECTION_ALIASES["втужин"] = "Второй ужин";
SECTION_ALIASES["вт ужин"] = "Второй ужин";
SECTION_ALIASES["втзавтрак"] = "Второй завтрак";
SECTION_ALIASES["вт завтрак"] = "Второй завтрак";
SECTION_ALIASES["2-й завтрак"] = "Второй завтрак";

/** Ссылки на PDF-меню: Битрикс генерирует и одинарные, и двойные кавычки href */
const HREF_RE = /href=["']([^"']*menu_(\d{2})\.(\d{2})\.(\d{2})\.pdf)["']/gi;

/** КБЖУ-токены: числа могут содержать пробел-разделитель («2 866») */
const KBJU_TOKEN_RE = /(Ккал|Белки|Жиры|Углеводы)\s*-\s*((?:\d[\d\s]*\d|\d)(?:[.,]\d+)?)/gi;

const NOISE_RE = /^(СУНЦ|Меню школы|энер|Выход|Наименование|витамины|микроэлементы|цен|белки|углеводы)/i;
// ВАЖНО: \b в JS не работает с кириллицей — не используем его после русских слов

export function todayNsk(): string {
  const now = new Date(Date.now() + 7 * 3600 * 1000); // Новосибирск = UTC+7
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(now.getUTCDate())}.${pad(now.getUTCMonth() + 1)}.${now.getUTCFullYear()}`;
}

export function normalizeDate(input: string): string {
  const trimmed = input.trim();
  // «ДД.ММ.ГГ» или «ДД.ММ.ГГГГ» → «ДД.ММ.ГГГГ»
  const m = trimmed.match(/^(\d{2})\.(\d{2})\.(\d{2})(\d{2})?$/);
  if (m) {
    return m[4] ? `${m[1]}.${m[2]}.${m[3]}${m[4]}` : `${m[1]}.${m[2]}.20${m[3]}`;
  }
  return trimmed;
}

export function parseDateRu(value: string): Date {
  const m = value.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!m) return new Date(NaN);
  return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
}

/** Каталог меню: {"ДД.ММ.ГГГГ": абсолютный URL PDF} */
export async function fetchCatalog(): Promise<Record<string, string>> {
  const { data } = await cached("menuCatalog", TTL.menu, async () => {
    const response = await fetchWithTimeout(CATERING_URL, { timeoutMs: 20000 });
    if (!response.ok) throw new Error(`Каталог питания недоступен: HTTP ${response.status}`);
    const html = await response.text();

    const catalog: Record<string, string> = {};
    let match: RegExpExecArray | null;
    HREF_RE.lastIndex = 0;
    while ((match = HREF_RE.exec(html)) !== null) {
      const url = match[1].startsWith("http") ? match[1] : SESC_BASE + match[1];
      catalog[`${match[2]}.${match[3]}.20${match[4]}`] = url;
    }
    if (Object.keys(catalog).length === 0) {
      throw new Error(`На странице ${CATERING_URL} не найдено ссылок на PDF-меню`);
    }
    return catalog;
  });
  return data;
}

/** Извлечь текст из PDF через системный pdftotext (stdin → stdout с сохранением колонок) */
export async function extractPdfText(pdfBytes: Uint8Array): Promise<string> {
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn("pdftotext", ["-layout", "-", "-"]);
    } catch (err) {
      return reject(err);
    }

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf-8");
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf-8");
    });

    child.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "ENOENT") {
        reject(
          new Error(
            "Системная утилита pdftotext не найдена в $PATH. Установите пакет poppler-utils (nix profile install nixpkgs#poppler-utils)."
          )
        );
      } else {
        reject(new Error(`Ошибка запуска pdftotext: ${err.message}`));
      }
    });

    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`pdftotext завершился с кодом ${code}: ${stderr.trim()}`));
      } else {
        resolve(stdout);
      }
    });

    child.stdin.write(pdfBytes);
    child.stdin.end();
  });
}

type Kbju = Pick<Dish, "kcal" | "protein" | "fat" | "carbs">;

function num(value: string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const cleaned = value.replace(/\s+/g, "").replace(",", ".");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Разобрать все КБЖУ-токены строки («Ккал-2 866, Белки-107, …») */
function parseKbju(text: string): Kbju {
  const result: Kbju = { kcal: null, protein: null, fat: null, carbs: null };
  KBJU_TOKEN_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = KBJU_TOKEN_RE.exec(text)) !== null) {
    const value = num(m[2]);
    if (m[1] === "Ккал" && result.kcal === null) result.kcal = value;
    if (m[1] === "Белки" && result.protein === null) result.protein = value;
    if (m[1] === "Жиры" && result.fat === null) result.fat = value;
    if (m[1] === "Углеводы" && result.carbs === null) result.carbs = value;
  }
  return result;
}

/** Строка состоит ТОЛЬКО из КБЖУ-токенов (и запятых/пробелов)? */
function isKbjuOnly(line: string): boolean {
  if (!/Ккал\s*-|Белки\s*-|Жиры\s*-|Углеводы\s*-/.test(line)) return false;
  const rest = line.replace(KBJU_TOKEN_RE, "").replace(/[,.\s]/g, "");
  return rest.length === 0;
}

function mergeKbju(target: Kbju, source: Kbju): void {
  target.kcal = target.kcal ?? source.kcal;
  target.protein = target.protein ?? source.protein;
  target.fat = target.fat ?? source.fat;
  target.carbs = target.carbs ?? source.carbs;
}

/** Строка похожа на ингредиенты: СТРОЧНАЯ буква в начале (без i-флага!) ИЛИ ≥1 запятой со строчными словами */
function isIngredients(line: string): boolean {
  if (isKbjuOnly(line)) return false;
  if (/^[а-яё]/.test(line) && line.length > 5) return true;
  const commas = (line.match(/,/g) ?? []).length;
  if (commas >= 1 && /[а-яё]/.test(line) && !/Ккал/i.test(line) && line.length > 8) return true;
  return false;
}

const LINE_TYPES = ["kbju", "ingredients", "dish", "section", "totals", "noise", "other"] as const;
type LineType = (typeof LINE_TYPES)[number];

interface ParsedLine {
  raw: string;
  text: string;
  type: LineType;
  weight: number | null;
  rest: string;
}

function classify(line: string): ParsedLine {
  const text = line.replace(/\s{2,}/g, "  ").trim();
  const trimmed = text.trim();

  if (!trimmed) return { raw: line, text: "", type: "other", weight: null, rest: "" };

  // Проверка КБЖУ-строк РАНЬШЕ noise: иначе «Углеводы-91» ловится
  // фильтром заголовков таблицы («углеводы (г)»)
  if (isKbjuOnly(trimmed)) {
    return { raw: line, text: trimmed, type: "kbju", weight: null, rest: trimmed };
  }

  if (NOISE_RE.test(trimmed) || /^\d{2}\.\d{2}\.\d{4}/.test(trimmed)) {
    return { raw: line, text: trimmed, type: "noise", weight: null, rest: "" };
  }

  const normalized = trimmed.replace(/[^\p{L}\p{N}\s-]/gu, "").trim().toLowerCase();
  const section = SECTION_ALIASES[normalized];
  if (section) return { raw: line, text: trimmed, type: "section", weight: null, rest: section };

  // ВАЖНО: без \b — в JS \b не поддерживает кириллицу
  if (/^Итого/i.test(trimmed)) {
    return { raw: line, text: trimmed, type: "totals", weight: null, rest: trimmed };
  }

  const dishMatch = trimmed.match(/^(\d{1,4})\s+(.+)$/);
  if (dishMatch) {
    return { raw: line, text: trimmed, type: "dish", weight: num(dishMatch[1]), rest: dishMatch[2].trim() };
  }

  if (isIngredients(trimmed)) {
    return { raw: line, text: trimmed, type: "ingredients", weight: null, rest: trimmed };
  }

  return { raw: line, text: trimmed, type: "other", weight: null, rest: trimmed };
}

/** Разбор текста PDF-меню в структуру приёмов пищи */
export function parseMenuText(text: string): { meals: MealSection[]; dayTotals: MealSection["totals"] } {
  const lines = text.split(/\r?\n/).map(classify).filter((l) => l.text.length > 0);

  const meals: MealSection[] = [];
  const emptyTotals = (): MealSection["totals"] => ({ kcal: null, protein: null, fat: null, carbs: null });

  let current: MealSection | null = null;
  let lastDish: Dish | null = null;
  let lastWasTotals = false;
  // КБЖУ-строки над блюдом (блок КБЖУ «разорван» вертикальным центрированием)
  let pendingPreKbju: Kbju | null = null;
  // «Голые» КБЖУ в конце документа = итоги за день
  const dayDirect: Kbju = { kcal: null, protein: null, fat: null, carbs: null };
  const daySum: Kbju = { kcal: null, protein: null, fat: null, carbs: null };

  const add = (kbju: Kbju, target: Kbju) => mergeKbju(target, kbju);
  const addNum = (target: Kbju, field: keyof Kbju, value: number | null) => {
    if (value !== null) {
      target[field] = ((target[field] as number | null) ?? 0) + value;
    }
  };

  const isDishAhead = (fromIdx: number): boolean => {
    for (let j = fromIdx; j < Math.min(fromIdx + 3, lines.length); j++) {
      if (lines[j].type === "dish") return true;
      if (lines[j].type === "section" || lines[j].type === "totals") return false;
    }
    return false;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    switch (line.type) {
      case "section": {
        current = { type: line.rest, dishes: [], totals: emptyTotals() };
        meals.push(current);
        lastDish = null;
        lastWasTotals = false;
        pendingPreKbju = null;
        break;
      }

      case "totals": {
        // «Итого за Ккал-4 129…» (без названия секции) — итоги за день
        const isDayTotal = /^Итого(\s+за)?\s*Ккал/i.test(line.text) || /^Итого\s+за\s+день/i.test(line.text);
        const kbju = parseKbju(line.text);
        // «Углеводы-…» может быть следующей строкой
        let j = i + 1;
        while (j < lines.length && lines[j].type === "kbju" && !isDishAhead(j)) {
          mergeKbju(kbju, parseKbju(lines[j].text));
          j++;
        }
        i = j - 1;
        if (isDayTotal) {
          mergeKbju(dayDirect, kbju);
        } else if (current) {
          mergeKbju(current.totals, kbju);
          addNum(daySum, "kcal", kbju.kcal);
          addNum(daySum, "protein", kbju.protein);
          addNum(daySum, "fat", kbju.fat);
          addNum(daySum, "carbs", kbju.carbs);
        }
        lastDish = null;
        lastWasTotals = true;
        pendingPreKbju = null;
        break;
      }

      case "kbju": {
        const kbju = parseKbju(line.text);
        if (isDishAhead(i + 1)) {
          // КБЖУ принадлежит следующему блюду (строка ВЫШЕ блюда)
          pendingPreKbju = pendingPreKbju ?? emptyTotals();
          mergeKbju(pendingPreKbju, kbju);
        } else if (lastDish && !lastWasTotals) {
          // продолжение КБЖУ предыдущего блюда («Углеводы-33»)
          mergeKbju(lastDish as Kbju, kbju);
        } else if (lastWasTotals || (!lastDish && !current)) {
          // итоги дня (в конце PDF — без подписи)
          mergeKbju(dayDirect, kbju);
        } else if (!lastDish && current) {
          // КБЖУ-хвост секции без блюда — прибавим к итогам секции
          mergeKbju(current.totals, kbju);
        }
        break;
      }

      case "dish": {
        if (!current) break;
        let rest = line.rest;
        const kbju: Kbju = emptyTotals();

        // встроенное КБЖУ: самый ранний токен в строке
        KBJU_TOKEN_RE.lastIndex = 0;
        let firstIdx = -1;
        let m: RegExpExecArray | null;
        while ((m = KBJU_TOKEN_RE.exec(rest)) !== null) {
          if (firstIdx === -1) firstIdx = m.index;
        }
        if (firstIdx > 0) {
          const kbjuPart = rest.slice(firstIdx);
          rest = rest.slice(0, firstIdx).trim();
          mergeKbju(kbju, parseKbju(kbjuPart));
        }

        // КБЖУ-строка ВЫШЕ блюда
        if (pendingPreKbju) {
          mergeKbju(kbju, pendingPreKbju);
          pendingPreKbju = null;
        }

        const dish: Dish = {
          weight: line.weight,
          name: rest.replace(/\s{2,}/g, " ").replace(/["«»]/g, "").trim(),
          kcal: kbju.kcal,
          protein: kbju.protein,
          fat: kbju.fat,
          carbs: kbju.carbs,
          ingredients: null,
        };

        // КБЖУ-строки ПОД блюдом («Углеводы-…»)
        let j = i + 1;
        while (j < lines.length && lines[j].type === "kbju" && !isDishAhead(j)) {
          mergeKbju(dish, parseKbju(lines[j].text));
          j++;
        }
        // ингредиенты
        let nameTail = "";
        while (j < lines.length && lines[j].type === "ingredients") {
          const ing = lines[j].text.trim();
          if (dish.ingredients) dish.ingredients += " " + ing;
          else dish.ingredients = ing;
          j++;
        }
        // перенос длинного названия (строка «other» без запятых, цифр и КБЖУ)
        while (j < lines.length && lines[j].type === "other" && lines[j].text.length < 60 && !/Ккал/i.test(lines[j].text) && !lines[j].text.includes(",")) {
          nameTail = (nameTail + " " + lines[j].text.trim()).trim();
          j++;
        }
        // строки с запятыми после блюда — тоже ингредиенты («Сахар, Кофейный напиток»)
        while (j < lines.length && lines[j].type === "other" && lines[j].text.includes(",") && /[а-яё]/.test(lines[j].text) && !/Ккал/i.test(lines[j].text)) {
          const ing = lines[j].text.trim();
          if (dish.ingredients) dish.ingredients += " " + ing;
          else dish.ingredients = ing;
          j++;
        }
        if (nameTail) dish.name = (dish.name + " " + nameTail).replace(/\s{2,}/g, " ").trim();

        i = j - 1;
        current.dishes.push(dish);
        lastDish = dish;
        lastWasTotals = false;
        break;
      }

      case "ingredients": {
        // ингредиенты без блюда (после totals) — пропускаем
        if (lastDish && !lastWasTotals) {
          const ing = line.text.trim();
          lastDish.ingredients = lastDish.ingredients ? lastDish.ingredients + " " + ing : ing;
        }
        break;
      }

      default:
        break;
    }
  }

  // фильтр мусорных «блюд» (пустые названия)
  for (const meal of meals) {
    meal.dishes = meal.dishes.filter((d) => d.name && d.name.length > 1);
  }

  const dayTotals: MealSection["totals"] =
    dayDirect.kcal !== null
      ? { ...emptyTotals(), ...dayDirect }
      : {
          kcal: daySum.kcal,
          protein: daySum.protein,
          fat: daySum.fat,
          carbs: daySum.carbs,
        };

  return { meals, dayTotals };
}

/** Полный конвейер: меню на дату (или ближайшее доступное) */
export async function getMenu(date?: string): Promise<MenuData> {
  const catalog = await fetchCatalog();
  const dates = Object.keys(catalog);
  const requested = date && date.trim() ? normalizeDate(date) : todayNsk();

  let target = requested;
  let substituted = false;
  if (!catalog[requested]) {
    const requestedDate = parseDateRu(requested);
    if (Number.isNaN(requestedDate.getTime())) {
      throw new Error("Некорректный формат даты (ожидается ДД.ММ.ГГГГ)");
    }
    const sorted = dates
      .map((d) => ({ d, diff: Math.abs(parseDateRu(d).getTime() - requestedDate.getTime()) }))
      .sort((a, b) => a.diff - b.diff);
    target = sorted[0]?.d ?? dates[0];
    substituted = true;
  }

  const pdfUrl = catalog[target];
  const response = await fetchWithTimeout(pdfUrl, { timeoutMs: 25000 });
  if (!response.ok) throw new Error(`PDF-меню недоступно: HTTP ${response.status}`);
  const pdfBytes = new Uint8Array(await response.arrayBuffer());
  const text = await extractPdfText(pdfBytes);
  const { meals, dayTotals } = parseMenuText(text);

  return {
    date: target,
    requestedDate: requested,
    substituted,
    message: substituted
      ? `Меню на ${requested} не опубликовано — показано ближайшее доступное (${target}).`
      : null,
    pdfUrl,
    availableDates: dates.sort((a, b) => parseDateRu(a).getTime() - parseDateRu(b).getTime()),
    meals,
    dayTotals,
  };
}

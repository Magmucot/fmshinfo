/**
 * Telegram-бот «СУНЦ Инфо» (mini-service, порт 3003)
 *
 * Данные берёт из API основного портала (http://localhost:3000/api/...):
 *   /menu, /bells, /schedule, /canteen/schedule, /weather, /news, /duty, /counselors, /info, /events
 *
 * Особенности:
 *  - Интерактивный выбор класса при старте (/start) с кнопками по параллелям.
 *  - Персистентное хранение классов в user_classes.json (не теряется при перезапуске).
 *  - Группировка школьного расписания по ПАРАМ (1-я, 2-я, 3-я пара, спецкурсы) вместо 6 разрозненных уроков.
 *  - Корректная обработка подгрупп: если урок только у 1-й подгруппы, не пишется как общий,
 *    а явно помечается подгруппа и свободное окно для остальных.
 *  - Премиальный дизайн сообщений в Telegram (карточки, иконки, моноширинные блоки).
 */

import { Bot, Context, InlineKeyboard, Keyboard } from "grammy";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { botLogger, getRecentBotLogs } from "./logger";

// Загрузка .env из корня проекта если не подхвачен Bun
function loadRootEnv() {
  const envPath = join(__dirname, "../../.env");
  if (existsSync(envPath)) {
    try {
      const content = readFileSync(envPath, "utf-8");
      for (const line of content.split("\n")) {
        const match = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)?\s*$/);
        if (match && match[1]) {
          const key = match[1];
          const val = (match[2] ?? "").replace(/^["']|["']$/g, "").trim();
          if (!process.env[key]) {
            process.env[key] = val;
          }
        }
      }
    } catch {}
  }
}
loadRootEnv();

const PORT = 3003;
const API = process.env.PORTAL_API ?? "http://localhost:3000";
const TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? "";
const ADMIN_KEY = process.env.ADMIN_KEY ?? "sunc-admin";

const USERS_FILE = join(__dirname, "users.json");
const USER_CLASSES_FILE = join(__dirname, "user_classes.json");
const ADMINS_FILE = join(__dirname, "admins.json");

/* -------------------- Система авторизации и администраторов ---------- */

// Владелец по умолчанию: 1573047506 (@Maagicus)
const defaultAdmins = new Set<number>([1573047506]);
if (process.env.ADMIN_TG_IDS) {
  for (const idStr of process.env.ADMIN_TG_IDS.split(",")) {
    const num = Number(idStr.trim());
    if (num && !isNaN(num)) defaultAdmins.add(num);
  }
}

export const verifiedAdminIds = new Set<number>(defaultAdmins);

function loadVerifiedAdmins() {
  try {
    if (existsSync(ADMINS_FILE)) {
      const data = JSON.parse(readFileSync(ADMINS_FILE, "utf-8"));
      if (Array.isArray(data)) {
        for (const id of data) {
          if (typeof id === "number") verifiedAdminIds.add(id);
        }
      }
    }
  } catch (e) {
    console.error("[tg-bot] Ошибка загрузки admins.json:", e);
  }
}
loadVerifiedAdmins();

function saveVerifiedAdmins() {
  try {
    writeFileSync(ADMINS_FILE, JSON.stringify(Array.from(verifiedAdminIds), null, 2), "utf-8");
  } catch (e) {
    console.error("[tg-bot] Ошибка сохранения admins.json:", e);
  }
}

export function isAdmin(userId?: number | null): boolean {
  if (!userId) return false;
  return verifiedAdminIds.has(userId);
}

/* -------------------- Защита от DDoS и спама (Anti-Flood) ----------- */

interface RateLimitEntry {
  timestamps: number[];
  cooldownUntil: number;
  warned: boolean;
  violationsCount: number;
}

const rateLimitMap = new Map<number, RateLimitEntry>();

export function checkRateLimit(
  userId: number,
  username?: string | null
): { allowed: boolean; waitSec: number; shouldWarn: boolean } {
  // Администраторы не ограничиваются
  if (isAdmin(userId)) {
    return { allowed: true, waitSec: 0, shouldWarn: false };
  }

  const now = Date.now();
  let entry = rateLimitMap.get(userId);
  if (!entry) {
    entry = { timestamps: [now], cooldownUntil: 0, warned: false, violationsCount: 0 };
    rateLimitMap.set(userId, entry);
    return { allowed: true, waitSec: 0, shouldWarn: false };
  }

  // Если пользователь находится в режиме временной блокировки (cooldown)
  if (now < entry.cooldownUntil) {
    const waitSec = Math.ceil((entry.cooldownUntil - now) / 1000);
    const shouldWarn = !entry.warned;
    if (shouldWarn) entry.warned = true;
    return { allowed: false, waitSec, shouldWarn };
  }

  // Сброс флага предупреждения после выхода из кулдауна
  entry.warned = false;

  // Очищаем отметки старше 10 секунд
  entry.timestamps = entry.timestamps.filter((t) => now - t < 10_000);

  const lastTime = entry.timestamps[entry.timestamps.length - 1] ?? 0;
  const interval = now - lastTime;
  const recentIn2s = entry.timestamps.filter((t) => now - t < 2000).length;

  // Лимиты:
  // 1. Интервал между запросами не менее 350мс
  // 2. Всплеск: не более 3 запросов за 2 секунды
  // 3. Окно: не более 10 запросов за 10 секунд
  const isTooFast = interval < 350;
  const isBurstLimit = recentIn2s >= 3;
  const isWindowLimit = entry.timestamps.length >= 10;

  if (isTooFast || isBurstLimit || isWindowLimit) {
    entry.violationsCount += 1;
    const cooldownMs =
      entry.violationsCount === 1 ? 15_000 : entry.violationsCount === 2 ? 45_000 : 120_000;
    entry.cooldownUntil = now + cooldownMs;
    entry.warned = true;
    const waitSec = Math.ceil(cooldownMs / 1000);

    botLogger.warn(
      "SECURITY",
      `Anti-flood triggered for user ${userId} (@${username ?? "unknown"}): interval=${interval}ms, burst=${recentIn2s}/2s, total=${entry.timestamps.length}/10s. Ban for ${waitSec}s (violation #${entry.violationsCount})`
    );

    return { allowed: false, waitSec, shouldWarn: true };
  }

  entry.timestamps.push(now);
  return { allowed: true, waitSec: 0, shouldWarn: false };
}

export function applyPenaltyCooldown(userId: number, cooldownMs = 30_000) {
  const now = Date.now();
  const entry = rateLimitMap.get(userId) ?? {
    timestamps: [],
    cooldownUntil: 0,
    warned: false,
    violationsCount: 0,
  };
  entry.violationsCount += 1;
  entry.cooldownUntil = Math.max(entry.cooldownUntil, now + cooldownMs);
  entry.warned = true;
  rateLimitMap.set(userId, entry);
}

/* -------------------- Модель и профили пользователей ---------------- */

export interface BotUserRecord {
  id: number;
  username?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  className?: string | null;
  languageCode?: string | null;
  isPremium?: boolean;
  actionsCount: number;
  lastAction?: string | null;
  firstSeenAt: string;
  lastActiveAt: string;
}

const userProfiles = new Map<number, BotUserRecord>();
const userClassMap = new Map<number, string>();

/** Загрузка пользователей: объединяет старый user_classes.json и расширенный users.json */
function loadAllUsers() {
  try {
    // 1. Сначала загружаем legacy-файл user_classes.json
    if (existsSync(USER_CLASSES_FILE)) {
      const classData = JSON.parse(readFileSync(USER_CLASSES_FILE, "utf-8"));
      for (const [k, v] of Object.entries(classData)) {
        if (v && typeof v === "string") {
          const numId = Number(k);
          userClassMap.set(numId, v);
          userProfiles.set(numId, {
            id: numId,
            className: v,
            actionsCount: 1,
            lastAction: "init_load",
            firstSeenAt: new Date().toISOString(),
            lastActiveAt: new Date().toISOString(),
          });
        }
      }
    }

    // 2. Дополняем и актуализируем из users.json
    if (existsSync(USERS_FILE)) {
      const usersData = JSON.parse(readFileSync(USERS_FILE, "utf-8"));
      for (const u of Object.values(usersData) as BotUserRecord[]) {
        if (u?.id) {
          userProfiles.set(u.id, u);
          if (u.className) {
            userClassMap.set(u.id, u.className);
          }
        }
      }
    }
  } catch (e) {
    console.error("[tg-bot] Ошибка загрузки пользователей:", e);
  }
}

loadAllUsers();

/** Сохранение пользователей на диск (в users.json и user_classes.json) */
function saveUsersToDisk() {
  try {
    const usersObj: Record<string, BotUserRecord> = {};
    const classesObj: Record<string, string> = {};

    for (const [k, v] of userProfiles.entries()) {
      usersObj[String(k)] = v;
      if (v.className) classesObj[String(k)] = v.className;
    }
    writeFileSync(USERS_FILE, JSON.stringify(usersObj, null, 2), "utf-8");
    writeFileSync(USER_CLASSES_FILE, JSON.stringify(classesObj, null, 2), "utf-8");
  } catch (e) {
    console.error("[tg-bot] Ошибка сохранения users.json:", e);
  }
}

let saveUsersTimeout: ReturnType<typeof setTimeout> | null = null;
function debouncedSaveUsers() {
  if (saveUsersTimeout) return;
  saveUsersTimeout = setTimeout(() => {
    saveUsersToDisk();
    saveUsersTimeout = null;
  }, 2500);
}

// Защита от избыточных вызовов к Next.js API
const lastApiSyncMap = new Map<number, number>();

/**
 * Отслеживание активности пользователя (ID, юзернейм «юза», имя, класс, действие)
 * и асинхронная синхронизация с базой данных портала.
 */
function trackUserInteraction(ctx: Context, action: string, newClass?: string) {
  const from = ctx.from;
  if (!from) return;

  const id = from.id;
  const username = from.username ? from.username.replace(/^@/, "").trim() : null;
  const firstName = from.first_name ?? null;
  const lastName = from.last_name ?? null;
  const languageCode = from.language_code ?? null;
  const isPremium = Boolean(from.is_premium);

  const existing = userProfiles.get(id);
  const nowStr = new Date().toISOString();
  const cls = newClass ?? existing?.className ?? userClassMap.get(id) ?? null;

  if (cls) {
    userClassMap.set(id, cls);
  }

  const updatedRecord: BotUserRecord = {
    id,
    username: username ?? existing?.username ?? null,
    firstName: firstName ?? existing?.firstName ?? null,
    lastName: lastName ?? existing?.lastName ?? null,
    className: cls,
    languageCode: languageCode ?? existing?.languageCode ?? null,
    isPremium: isPremium ?? existing?.isPremium ?? false,
    actionsCount: (existing?.actionsCount ?? 0) + 1,
    lastAction: action,
    firstSeenAt: existing?.firstSeenAt ?? nowStr,
    lastActiveAt: nowStr,
  };

  userProfiles.set(id, updatedRecord);
  debouncedSaveUsers();

  // Логирование действия в audit.log и bot.log
  botLogger.command(id, username, action, cls);

  // Синхронизация с Next.js не чаще 1 раза в 30 секунд на пользователя,
  // либо немедленно при явной смене класса
  const nowTime = Date.now();
  const lastSync = lastApiSyncMap.get(id) ?? 0;
  if (newClass || nowTime - lastSync > 30_000) {
    lastApiSyncMap.set(id, nowTime);
    fetch(`${API}/api/users/telegram`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: String(id),
        username,
        firstName,
        lastName,
        className: cls,
        languageCode,
        isPremium,
        action,
      }),
    }).catch((err) => {
      botLogger.debug("API_SYNC", `Sync failed for user ${id}: ${(err as Error).message}`);
    });
  }
}

function saveUserClass(userId: number, className: string, ctx?: Context) {
  const oldClass = userClassMap.get(userId);
  userClassMap.set(userId, className);
  botLogger.setclass(userId, ctx?.from?.username ?? null, oldClass, className);

  if (ctx) {
    trackUserInteraction(ctx, "setclass", className);
  } else {
    const existing = userProfiles.get(userId);
    const nowStr = new Date().toISOString();
    userProfiles.set(userId, {
      id: userId,
      className,
      actionsCount: (existing?.actionsCount ?? 0) + 1,
      lastAction: "setclass",
      firstSeenAt: existing?.firstSeenAt ?? nowStr,
      lastActiveAt: nowStr,
    });
    saveUsersToDisk();
  }
}

/* ----------------------------- Типы API ----------------------------- */

interface Dish {
  name: string;
  weight: number | null;
  kcal: number | null;
}
interface MealSection {
  type: string;
  dishes: Dish[];
  totals: { kcal: number | null; protein: number | null; fat: number | null; carbs: number | null };
}
interface MenuResponse {
  ok: boolean;
  date: string;
  meals: MealSection[];
  dayTotals: { kcal: number | null; protein: number | null; fat: number | null; carbs: number | null };
  pdfUrl: string;
  availableDates: string[];
  error?: string;
}
interface BellsResponse {
  ok: boolean;
  bells: Array<{ begin: string; end: string; pair: number | null; pairName: string | null }>;
}
interface ScheduleLesson {
  begin: string;
  end: string;
  lesson: string;
  teacher: string | null;
  classroom: string | null;
  type?: number | null;
  typeName: string | null;
  category?: string | null;
  classes?: string[];
  subgroup?: string | null;
  rawSubgroup?: string | null;
  pair?: number | null;
  pairName?: string | null;
}
interface ScheduleResponse {
  ok: boolean;
  group: string | null;
  teacher: string | null;
  classroom: string | null;
  days: Record<string, ScheduleLesson[]>;
}
interface WeatherResponse {
  ok: boolean;
  current: {
    temperature: number | null;
    apparent: number | null;
    humidity: number | null;
    windSpeed: number | null;
    windDirection: string | null;
    description: string;
    icon: string;
    sunrise: string | null;
    sunset: string | null;
  };
  forecast: Array<{ day: string; date: string; icon: string; description: string; tempMax: number | null; tempMin: number | null }>;
}
interface NewsResponse {
  ok: boolean;
  items: Array<{ id: string; title: string; url: string; date: string | null; rubric: string | null }>;
}
interface DutyResponse {
  ok: boolean;
  count: number;
  items: Array<{ id: number; date: string; dutyType: string; className: string | null; responsible: string | null; timeInterval: string | null }>;
}
interface CounselorsResponse {
  ok: boolean;
  count: number;
  items: Array<{ id: number; date: string; dormitory: string; counselorName: string; phone: string | null; floor: string | null }>;
}
interface InfoResponse {
  ok: boolean;
  school: { name: string; address: string; site: string; email: string };
  contacts: Array<{ title: string; phone: string | null; email: string | null; note: string | null }>;
}
interface EventsResponse {
  ok: boolean;
  title: string;
  source: string;
  classes: string[];
  days: Array<{
    date: string;
    weekday: string;
    general: string[];
    byClass: Record<string, string[]>;
    items?: Array<{
      id: string;
      text: string;
      category: string;
      categoryName: string;
      targetClasses: string[];
      isGeneral: boolean;
    }>;
  }>;
  eventsTotal: number;
  error?: string;
}
interface CanteenScheduleResponse {
  ok: boolean;
  shifts: Record<string, { shift: number; name: string; classes: string[]; description: string }>;
  selectedClass?: string;
  classSchedule?: {
    shift: number;
    className: string;
    isWeekend: boolean;
    meals: Array<{ meal: string; time: string; duty: string; late?: string; note?: string; order?: number }>;
    footnote: string;
  };
  weekdayMeals?: Array<{
    meal: string;
    order: number;
    duty: string;
    shift1: string;
    shift2: string;
    shift3: string;
    late: string;
    note?: string;
  }>;
  currentStatus: {
    isWeekend: boolean;
    activeMeal: { meal: string; time: string; duty: string; late?: string } | null;
    nextMealName: string | null;
    nextMealTime: string | null;
    description: string;
  };
  footnote: string;
}

interface StatsResponse {
  ok: boolean;
  isAdmin: boolean;
  bot: {
    totalUsers: number;
    activeToday: number;
    activeWeek: number;
    withClassCount: number;
    byClass: Record<string, number>;
    topClasses: Array<{ className: string; count: number }>;
    byGrade: Record<string, number>;
    recentUsers?: Array<{
      id: string;
      username: string | null;
      firstName: string | null;
      className: string | null;
      actionsCount: number;
      lastAction: string | null;
      lastActiveAt: string;
    }>;
  };
  web: {
    totalVisitors: number;
  };
}

/* ----------------------------- Утилиты ------------------------------ */

// Кэш ответов API портала (защита от частых повторных запросов)
const apiCache = new Map<string, { data: unknown; expiresAt: number }>();

async function api<T>(path: string, ttlMs = 30_000): Promise<T | null> {
  const now = Date.now();
  const cached = apiCache.get(path);
  if (cached && cached.expiresAt > now) {
    return cached.data as T;
  }

  const start = Date.now();
  try {
    const res = await fetch(`${API}${path}`, {
      signal: AbortSignal.timeout(60_000),
      headers: { Accept: "application/json" },
    });
    const dur = Date.now() - start;
    if (!res.ok) {
      botLogger.warn("API", `GET ${path} returned HTTP ${res.status} (${dur}ms)`);
      return null;
    }
    botLogger.api(path, res.status, dur);
    const json = (await res.json()) as T;
    // Кэшируем только публичные данные без ключей администратора
    if (!path.includes("adminKey")) {
      apiCache.set(path, { data: json, expiresAt: now + ttlMs });
    }
    return json;
  } catch (err) {
    const dur = Date.now() - start;
    botLogger.error("API", `GET ${path} failed (${dur}ms)`, err);
    return null;
  }
}

const WEEKDAYS = ["Воскресенье", "Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота"];

function esc(s: string | null | undefined): string {
  if (!s) return "";
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function nowNsk(): Date {
  const now = new Date();
  return new Date(now.getTime() + 7 * 3600 * 1000);
}

function fmtRu(d: Date): string {
  const day = String(d.getUTCDate()).padStart(2, "0");
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${day}.${month}.${d.getUTCFullYear()}`;
}

/**
 * Вычисляет реальную дату для дня недели:
 * Например: "сегодня, 04.09", "завтра, 05.09", "03.09"
 */
function getWeekdayDateLabel(targetWd: number, isTomorrow = false): string {
  const nsk = nowNsk();
  const currentWd = nsk.getUTCDay(); // 0=Вс, 1=Пн..6=Сб

  let dayDiff = targetWd - currentWd;
  if (isTomorrow) {
    dayDiff = 1;
  } else if (currentWd === 0) {
    // Воскресенье: наступающая неделя Пн(1)..Сб(6)
    dayDiff = targetWd === 0 ? 0 : targetWd;
  } else if (currentWd === 6 && targetWd >= 1 && targetWd <= 5) {
    // Суббота: клик на дни Пн..Пт относится к следующей неделе
    dayDiff = 7 - currentWd + targetWd;
  }

  const targetDate = new Date(nsk.getTime() + dayDiff * 86_400_000);
  const day = String(targetDate.getUTCDate()).padStart(2, "0");
  const month = String(targetDate.getUTCMonth() + 1).padStart(2, "0");
  const dateStr = `${day}.${month}`;

  if (dayDiff === 0) {
    return `сегодня, ${dateStr}`;
  }
  if (dayDiff === 1) {
    return `завтра, ${dateStr}`;
  }
  return dateStr;
}

/* --------------------------- Клавиатуры ----------------------------- */

/** Клавиатура интерактивного выбора класса по параллелям */
export function getClassSelectionKeyboard(): InlineKeyboard {
  const kb = new InlineKeyboard();
  // 8-9 классы
  kb.text("8-1", "setclass:8-1")
    .text("9-1", "setclass:9-1")
    .text("9-2", "setclass:9-2")
    .text("9-3", "setclass:9-3").row();
  // 10 классы
  kb.text("10-1", "setclass:10-1")
    .text("10-2", "setclass:10-2")
    .text("10-3", "setclass:10-3").row();
  kb.text("10-4", "setclass:10-4")
    .text("10-5", "setclass:10-5")
    .text("10-6", "setclass:10-6").row();
  kb.text("10-7", "setclass:10-7")
    .text("10-8", "setclass:10-8")
    .text("10-9", "setclass:10-9").row();
  // 11 классы
  kb.text("11-1", "setclass:11-1")
    .text("11-2", "setclass:11-2")
    .text("11-3", "setclass:11-3")
    .text("11-4", "setclass:11-4").row();
  kb.text("11-5", "setclass:11-5")
    .text("11-6", "setclass:11-6")
    .text("11-7", "setclass:11-7")
    .text("11-8", "setclass:11-8").row();
  kb.text("11-9", "setclass:11-9")
    .text("11-10", "setclass:11-10")
    .text("11-11", "setclass:11-11")
    .text("11-12", "setclass:11-12");
  return kb;
}

/** Главная Reply-клавиатура для быстрого доступа */
export function getMainReplyKeyboard(userClass?: string): Keyboard {
  const classLabel = userClass ? `🏫 Класс: ${userClass}` : "🏫 Выбрать класс";
  return new Keyboard()
    .text("📅 Расписание").text("🍱 Столовая").text("⚡ Сейчас").row()
    .text("🍽 Меню").text("🔔 Звонки").text("📌 События").row()
    .text("🌤 Погода").text(classLabel)
    .resized();
}

/* ----------------------- Форматирование текста ----------------------- */

/** Меню столовой → современный карточный вид */
export async function menuText(date?: string): Promise<{ text: string; keyboard?: InlineKeyboard }> {
  const data = await api<MenuResponse>(`/api/menu${date ? `?date=${encodeURIComponent(date)}` : ""}`);
  if (!data) return { text: "⚠️ Меню временно недоступно. Попробуйте позже." };
  if (!data.meals.length) return { text: `📋 На <b>${esc(data.date)}</b> меню ещё не опубликовано.` };

  const lines: string[] = [
    `🍽 <b>Меню столовой СУНЦ НГУ</b>`,
    `📅 Дата: <code>${esc(data.date)}</code>`,
    "──────────────────────────",
  ];

  const mealIcons: Record<string, string> = {
    "завтрак": "🍳",
    "второй завтрак": "🥐",
    "обед": "🍲",
    "полдник": "🍎",
    "ужин": "🍗",
    "второй ужин": "🥛",
  };

  for (const meal of data.meals) {
    const icon = mealIcons[meal.type.toLowerCase()] ?? "🍴";
    const cal = meal.totals?.kcal ? ` · <b>${meal.totals.kcal} ккал</b>` : "";
    lines.push(`\n${icon} <b>${esc(meal.type)}</b>${cal}`);
    for (const dish of meal.dishes) {
      const weight = dish.weight ? ` <i>(${dish.weight} г)</i>` : "";
      const kcal = dish.kcal ? ` — <code>${dish.kcal} ккал</code>` : "";
      lines.push(`  • ${esc(dish.name)}${weight}${kcal}`);
    }
  }

  const t = data.dayTotals;
  if (t?.kcal) {
    lines.push("\n──────────────────────────");
    lines.push(`🔥 <b>Итого за день: ${t.kcal} ккал</b>`);
    lines.push(`📊 Б: <code>${t.protein ?? "—"}г</code> · Ж: <code>${t.fat ?? "—"}г</code> · У: <code>${t.carbs ?? "—"}г</code>`);
  }
  if (data.pdfUrl) {
    lines.push(`\n📄 <a href="${esc(data.pdfUrl)}">Официальный PDF-документ меню</a>`);
  }

  const keyboard = new InlineKeyboard();
  if (data.availableDates && data.availableDates.length > 1) {
    const idx = data.availableDates.indexOf(data.date);
    if (idx > 0) {
      keyboard.text("◀ " + data.availableDates[idx - 1], `menu:${data.availableDates[idx - 1]}`);
    }
    keyboard.text("🍱 График смен", "canteen:info");
    if (idx >= 0 && idx < data.availableDates.length - 1) {
      keyboard.text(data.availableDates[idx + 1] + " ▶", `menu:${data.availableDates[idx + 1]}`);
    }
  }

  return { text: lines.join("\n"), keyboard };
}

/** Расписание звонков → группировка по парам */
export async function bellsText(): Promise<string> {
  const data = await api<BellsResponse>("/api/bells");
  if (!data) return "⚠️ Расписание звонков недоступно.";

  const lines = [
    "🔔 <b>Расписание звонков СУНЦ НГУ (ФМШ)</b>",
    "В школе учебные занятия идут <b>3 парами</b>:",
    "──────────────────────────",
    "1️⃣ <b>1-я пара:</b> <code>08:30 – 10:10</code>",
    "   ├ 1-й урок: <code>08:30 – 09:15</code> (перемена 10 мин)",
    "   └ 2-й урок: <code>09:25 – 10:10</code>",
    "   <i>Перемена: 10:10 – 10:20 (10 мин)</i>\n",
    "2️⃣ <b>2-я пара:</b> <code>10:20 – 12:00</code>",
    "   ├ 3-й урок: <code>10:20 – 11:05</code> (перемена 10 мин)",
    "   └ 4-й урок: <code>11:15 – 12:00</code>",
    "   <i>Обеденный перерыв: 12:00 – 12:30 (30 мин)</i>\n",
    "3️⃣ <b>3-я пара:</b> <code>12:30 – 14:10</code>",
    "   ├ 5-й урок: <code>12:30 – 13:15</code> (перемена 10 мин)",
    "   └ 6-й урок: <code>13:25 – 14:10</code>\n",
    "──────────────────────────",
    "⚡ <b>Вторая половина дня:</b>",
    "• <code>14:10 – 16:00</code> — большой обед и отдых",
    "• <code>15:00 – 16:00</code> — факультативы и консультации",
    "• <code>16:00 – 17:30</code> — спецкурсы и ОБЗР (доп. занятия)",
    "• <code>18:00 – 19:30</code> — вечерние спецкурсы",
    "• <code>20:30 – 22:00</code> — самоподготовка (интернат)",
    "\n🍱 Подробный график питания по сменам: /canteen",
  ];

  return lines.join("\n");
}

/** Расписание столовой и смен питания (из фото rasp.jpg) */
export async function canteenText(className?: string): Promise<{ text: string; keyboard?: InlineKeyboard }> {
  const data = await api<CanteenScheduleResponse>(
    `/api/canteen/schedule${className ? `?class=${encodeURIComponent(className)}` : ""}`
  );
  if (!data) return { text: "⚠️ График столовой временно недоступен." };

  const lines: string[] = ["🍱 <b>График питания столовой СУНЦ НГУ</b>"];
  const status = data.currentStatus;

  lines.push(`⚡ <b>Сейчас:</b> ${esc(status.description)}`);
  if (status.nextMealName) {
    lines.push(`⏰ Следующий приём: <b>${esc(status.nextMealName)}</b> (<code>${status.nextMealTime}</code>)`);
  }
  lines.push("──────────────────────────");

  if (data.classSchedule) {
    const cs = data.classSchedule;
    lines.push(`👤 Твой класс: <b>${esc(cs.className)}</b> (🟢 <b>${cs.shift}-я смена</b>)`);
    lines.push(`📌 <i>${esc(data.shifts[cs.shift]?.description ?? "")}</i>\n`);
    lines.push(cs.isWeekend ? "<b>Режим выходного / праздничного дня:</b>" : "<b>Расписание твоей смены:</b>");

    for (const m of cs.meals) {
      const lateStr = m.late ? `, опозд. ${esc(m.late)}` : "";
      lines.push(`• <b>${esc(m.meal)}:</b> <code>${esc(m.time)}</code>`);
      lines.push(`  └ дежурные: <code>${esc(m.duty)}</code>${lateStr}`);
    }
  } else {
    lines.push("<b>Смены питания в столовой (будни):</b>");
    lines.push("• <b>1-я смена</b> <i>(8-1, 11-1…11-9)</i>: Обед <code>14:15–14:30</code> · Ужин <code>19:30–19:40</code>");
    lines.push("• <b>2-я смена</b> <i>(10-1…10-9)</i>: Обед <code>14:30–14:45</code> · Ужин <code>19:40–19:50</code>");
    lines.push("• <b>3-я смена</b> <i>(9-1…9-3, 11-10)</i>: Обед <code>14:45–15:00</code> · Ужин <code>19:50–20:00</code>\n");

    lines.push("<b>Общие приёмы пищи:</b>");
    lines.push("• Завтрак: <code>07:35 – 08:10</code> (деж. 07:20)");
    lines.push("• 2-й завтрак: <code>12:00 – 12:25</code> (деж. 11:50)");
    lines.push("• Полдник: <code>17:30 – 17:55</code> (деж. 17:20)");
    lines.push("• 2-й ужин: <code>22:00 – 22:10</code> (деж. 21:50)\n");

    lines.push("<b>В выходные дни:</b>");
    lines.push("• Завтрак <code>08:35–09:10</code> · Обед <code>14:00–14:45</code> · Полдник <code>17:30–17:55</code> · Ужин <code>19:30–20:00</code>");
    lines.push("• <i>2-го завтрака и 2-го ужина в выходные нет</i>");
  }

  lines.push(`\n⭐ <i>${esc(data.footnote ?? "Самые точные часы — у дежурного администратора")}</i>`);

  const keyboard = new InlineKeyboard()
    .text("1-я смена (8, 11 кл)", "canteen:shift:1")
    .text("2-я смена (10 кл)", "canteen:shift:2").row()
    .text("3-я смена (9 кл)", "canteen:shift:3")
    .text("Все смены", "canteen:shift:all");

  return { text: lines.join("\n"), keyboard };
}

/**
 * Расписание класса:
 * - Группировка по ПАРАМ (1 пара 08:30–10:10, 2 пара 10:20–12:00, 3 пара 12:30–14:10, спецкурсы).
 * - ПОЛНОЕ устранение бага с подгруппами: если урок только у одной подгруппы,
 *   он никогда не пишется как общий, а явно помечает окно для остальных!
 */
export async function scheduleText(
  group: string,
  targetWeekday?: number,
  tomorrow = false
): Promise<{ text: string; keyboard?: InlineKeyboard }> {
  const data = await api<ScheduleResponse>(`/api/schedule?group=${encodeURIComponent(group)}`);
  if (!data) return { text: `⚠️ Расписание класса <b>${esc(group)}</b> недоступно.` };

  const nsk = nowNsk();
  let wd = targetWeekday ?? nsk.getUTCDay(); // 0=Вс..6=Сб
  if (tomorrow && targetWeekday === undefined) wd = (wd + 1) % 7;

  const dateLabel = getWeekdayDateLabel(wd, tomorrow);

  if (wd === 0) {
    const keyboard = new InlineKeyboard()
      .text("Пн", `sched:${group}:1`).text("Вт", `sched:${group}:2`).text("Ср", `sched:${group}:3`)
      .text("Чт", `sched:${group}:4`).text("Пт", `sched:${group}:5`).text("Сб", `sched:${group}:6`);
    return {
      text: `☀️ <b>${WEEKDAYS[wd]} (${dateLabel})</b> — занятий у класса <b>${esc(group)}</b> нет (выходной).\nВыберите учебный день:`,
      keyboard,
    };
  }

  const lessons = data.days[String(wd)] ?? [];

  if (!lessons.length) {
    const keyboard = new InlineKeyboard()
      .text("Пн", `sched:${group}:1`).text("Вт", `sched:${group}:2`).text("Ср", `sched:${group}:3`)
      .text("Чт", `sched:${group}:4`).text("Пт", `sched:${group}:5`).text("Сб", `sched:${group}:6`);
    return {
      text: `📭 На <b>${WEEKDAYS[wd]} (${dateLabel})</b> занятий у <b>${esc(group)}</b> нет.`,
      keyboard,
    };
  }

  const lines: string[] = [
    `📅 <b>Расписание: ${esc(group)}</b> · ${WEEKDAYS[wd]} (${dateLabel})`,
    "──────────────────────────",
  ];

  // 3 основные пары в СУНЦ НГУ (по 2 урока на пару)
  const pairsConfig = [
    {
      num: 1,
      title: "1-я пара",
      time: "08:30–10:10",
      slot1: { num: 1, begin: "08:30", end: "09:15" },
      slot2: { num: 2, begin: "09:25", end: "10:10" },
    },
    {
      num: 2,
      title: "2-я пара",
      time: "10:20–12:00",
      slot1: { num: 3, begin: "10:20", end: "11:05" },
      slot2: { num: 4, begin: "11:15", end: "12:00" },
    },
    {
      num: 3,
      title: "3-я пара",
      time: "12:30–14:10",
      slot1: { num: 5, begin: "12:30", end: "13:15" },
      slot2: { num: 6, begin: "13:25", end: "14:10" },
    },
  ];

  const pairNumbersIcons: Record<number, string> = { 1: "1️⃣", 2: "2️⃣", 3: "3️⃣" };

  // Функция форматирования списка уроков
  const formatLessonsList = (items: ScheduleLesson[], indent = "   "): string[] => {
    const out: string[] = [];
    if (!items.length) return out;

    // Группировка иностранного языка по подгруппам (3-я, 4-я, 5-я, 6-я)
    const isAllLang = items.length >= 2 && items.every((l) => l.lesson.toLowerCase().includes("язык"));
    if (isAllLang) {
      out.push(`${indent}🌐 <b>Иностранный язык (по группам):</b>`);
      items.forEach((l, idx) => {
        const isLast = idx === items.length - 1;
        const prefix = isLast ? "└" : "├";
        const sub = l.subgroup ? `<b>${esc(l.subgroup)}:</b> ` : "";
        const room = l.classroom ? ` (ауд. <code>${esc(l.classroom)}</code>)` : "";
        const teacher = l.teacher ? ` — ${esc(l.teacher)}` : "";
        out.push(`${indent}  ${prefix} ${sub}${esc(l.lesson)}${room}${teacher}`);
      });
      return out;
    }

    if (items.length === 1) {
      const l = items[0];
      const typeTag = l.typeName ? ` <i>[${esc(l.typeName)}]</i>` : "";
      const room = l.classroom ? ` · ауд. <code>${esc(l.classroom)}</code>` : "";
      const teacher = l.teacher ? ` — ${esc(l.teacher)}` : "";

      if (l.subgroup) {
        out.push(`${indent}👥 <b>${esc(l.subgroup)}:</b> ${esc(l.lesson)}${typeTag}${room}${teacher}`);
        out.push(`${indent}└ 💤 <i>Остальные подгруппы: окно (урока нет)</i>`);
      } else {
        out.push(`${indent}📚 <b>${esc(l.lesson)}</b>${typeTag}${room}${teacher} <i>(весь класс)</i>`);
      }
    } else {
      items.forEach((l, idx) => {
        const isLast = idx === items.length - 1;
        const prefix = isLast ? "└" : "├";
        const subName = l.subgroup ?? `${idx + 1}-я подгруппа`;
        const typeTag = l.typeName ? ` <i>[${esc(l.typeName)}]</i>` : "";
        const room = l.classroom ? ` (ауд. <code>${esc(l.classroom)}</code>)` : "";
        const teacher = l.teacher ? ` — ${esc(l.teacher)}` : "";
        out.push(`${indent}${prefix} 👥 <b>${esc(subName)}:</b> ${esc(l.lesson)}${typeTag}${room}${teacher}`);
      });
    }
    return out;
  };

  for (const pc of pairsConfig) {
    const s1 = lessons.filter((l) => l.begin === pc.slot1.begin);
    const s2 = lessons.filter((l) => l.begin === pc.slot2.begin);

    // Случай 1: Оба полупарка пустые -> окно на всю пару
    if (!s1.length && !s2.length) {
      lines.push(`\n${pairNumbersIcons[pc.num]} <b>${pc.title}</b> (<code>${pc.time}</code>)`);
      lines.push("   💤 <i>Свободное окно (уроков нет · 90 мин)</i>");
      continue;
    }

    // Сигнатура урока для строгого сравнения полупарков
    const sig = (list: ScheduleLesson[]) =>
      list
        .map((l) => `${l.lesson}|${l.teacher ?? ""}|${l.classroom ?? ""}|${l.subgroup ?? ""}|${l.typeName ?? ""}`)
        .sort()
        .join(";;");

    const isFullPair = s1.length > 0 && s2.length > 0 && sig(s1) === sig(s2);

    if (isFullPair) {
      // СЛУЧАЙ 2: ЕДИНАЯ ПОЛНОЦЕННАЯ ПАРА (90 минут)
      lines.push(`\n${pairNumbersIcons[pc.num]} <b>${pc.title} · [Пара · 90 мин]</b> (<code>${pc.time}</code>)`);
      lines.push(...formatLessonsList(s1, "   "));
    } else {
      // СЛУЧАЙ 3: РАЗДЕЛЬНЫЕ УРОКИ ПО 45 МИНУТ
      lines.push(`\n${pairNumbersIcons[pc.num]} <b>${pc.title}</b> (<code>${pc.time}</code>) — раздельные уроки:`);

      // 1-й полупарок (урок)
      if (s1.length > 0) {
        lines.push(`   ⏱ <b>${pc.slot1.num}-й урок [Урок · 45 мин]:</b> <code>${pc.slot1.begin}–${pc.slot1.end}</code>`);
        lines.push(...formatLessonsList(s1, "      "));
      } else {
        lines.push(`   ⏱ <b>${pc.slot1.num}-й урок:</b> <code>${pc.slot1.begin}–${pc.slot1.end}</code> — 💤 <i>Окно (45 мин)</i>`);
      }

      // 2-й полупарок (урок)
      if (s2.length > 0) {
        lines.push(`   ⏱ <b>${pc.slot2.num}-й урок [Урок · 45 мин]:</b> <code>${pc.slot2.begin}–${pc.slot2.end}</code>`);
        lines.push(...formatLessonsList(s2, "      "));
      } else {
        lines.push(`   ⏱ <b>${pc.slot2.num}-й урок:</b> <code>${pc.slot2.begin}–${pc.slot2.end}</code> — 💤 <i>Окно (45 мин)</i>`);
      }
    }
  }

  // Спецкурсы и факультативы после 14:10
  const allMainSlots = pairsConfig.flatMap((pc) => [pc.slot1.begin, pc.slot2.begin]);
  const afternoonLessons = lessons.filter((l) => !allMainSlots.includes(l.begin));

  if (afternoonLessons.length > 0) {
    lines.push("\n⚡ <b>Спецкурсы и факультативы:</b>");
    for (const l of afternoonLessons) {
      const typeTag = l.typeName ? ` <i>[${esc(l.typeName)}]</i>` : "";
      const room = l.classroom ? ` · ауд. <code>${esc(l.classroom)}</code>` : "";
      const teacher = l.teacher ? ` — ${esc(l.teacher)}` : "";
      const sub = l.subgroup ? ` (👥 ${esc(l.subgroup)})` : "";
      lines.push(`   • <code>${l.begin}–${l.end}</code> ${esc(l.lesson)}${typeTag}${sub}${room}${teacher}`);
    }
  }

  lines.push("\n──────────────────────────");
  lines.push("💡 Выберите день недели:");

  const keyboard = new InlineKeyboard()
    .text("Пн", `sched:${group}:1`).text("Вт", `sched:${group}:2`).text("Ср", `sched:${group}:3`)
    .text("Чт", `sched:${group}:4`).text("Пт", `sched:${group}:5`).text("Сб", `sched:${group}:6`).row()
    .text("🍱 Столовая класса", `canteen:class:${group}`)
    .text("⚙️ Сменить класс", "pickclass");

  return { text: lines.join("\n"), keyboard };
}

/** Поиск расписания преподавателя или аудитории */
export async function findScheduleText(query: string): Promise<string> {
  const q = query.trim();
  if (!q) return "⚠️ Укажите фамилию преподавателя или номер аудитории (например: <code>/find Горшков</code> или <code>/find 2_10</code>).";

  const isClassroom = /^\d+_\d+$/.test(q) || /^\d+\.\d+$/.test(q);
  const param = isClassroom ? `classroom=${encodeURIComponent(q.replace(".", "_"))}` : `teacher=${encodeURIComponent(q)}`;
  const data = await api<ScheduleResponse>(`/api/schedule?${param}`);

  if (!data || Object.keys(data.days).length === 0) {
    return `📭 Расписание по запросу «<b>${esc(q)}</b>» не найдено.`;
  }

  const nsk = nowNsk();
  const wd = nsk.getUTCDay();
  const titleTarget = data.teacher ?? data.classroom ?? q;
  const lines = [
    `🔍 <b>Расписание: ${esc(titleTarget)}</b>`,
    "──────────────────────────",
  ];

  for (let d = 1; d <= 6; d++) {
    const list = data.days[String(d)] ?? [];
    if (!list.length) continue;
    const isToday = d === wd;
    lines.push(`\n📅 <b>${WEEKDAYS[d]}${isToday ? " (сегодня)" : ""}:</b>`);
    for (const l of list) {
      const typeTag = l.typeName ? ` <i>[${esc(l.typeName)}]</i>` : "";
      const room = l.classroom ? ` · ауд. <code>${esc(l.classroom)}</code>` : "";
      const classes = l.classes && l.classes.length ? ` · 👥 ${esc(l.classes.join(", "))}` : "";
      const sub = l.subgroup ? ` (${esc(l.subgroup)})` : "";
      lines.push(`  • <code>${l.begin}–${l.end}</code> ${esc(l.lesson)}${typeTag}${sub}${classes}${room}`);
    }
  }

  return lines.join("\n");
}

/** «Сейчас в школе» (текущая пара, столовая, погода, дежурство) */
export async function nowText(userClass?: string): Promise<string> {
  const [bellsData, canteenData, weatherData, dutyData] = await Promise.all([
    api<BellsResponse>("/api/bells"),
    api<CanteenScheduleResponse>(`/api/canteen/schedule${userClass ? `?class=${encodeURIComponent(userClass)}` : ""}`),
    api<WeatherResponse>("/api/weather"),
    api<DutyResponse>(`/api/duty?date=${encodeURIComponent(fmtRu(nowNsk()))}`),
  ]);

  const now = nowNsk();
  const hours = String(now.getUTCHours()).padStart(2, "0");
  const mins = String(now.getUTCMinutes()).padStart(2, "0");

  const lines = [
    `⚡ <b>Сейчас в СУНЦ НГУ</b> (время: <code>${hours}:${mins}</code>)`,
    "──────────────────────────",
  ];

  const minutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

  // 1. Уроки / Звонки
  if (bellsData) {
    const bells = bellsData.bells;
    const current = bells.find((b) => minutes >= toMin(b.begin) && minutes < toMin(b.end));
    const next = bells.find((b) => toMin(b.begin) > minutes);
    if (current) {
      const remain = toMin(current.end) - minutes;
      const pairName = current.pairName ? ` (${current.pairName})` : "";
      lines.push(`🔔 <b>Урок:</b> Идёт занятие <code>${current.begin}–${current.end}</code>${pairName}`);
      lines.push(`   └ До звонка осталось <b>${remain} мин</b>`);
    } else if (next) {
      const until = toMin(next.begin) - minutes;
      lines.push(`🔔 <b>Перемена:</b> Следующий звонок в <code>${next.begin}</code> (через <b>${until} мин</b>)`);
    } else if (now.getUTCDay() === 0) {
      lines.push("🔔 <b>Выходной:</b> Занятий сегодня нет");
    } else {
      lines.push("🔔 <b>Уроки:</b> Основной учебный день завершён");
    }
  }

  // 2. Столовая
  if (canteenData) {
    lines.push(`\n🍱 <b>Столовая:</b> ${esc(canteenData.currentStatus.description)}`);
    if (userClass && canteenData.classSchedule) {
      lines.push(`   └ Твой класс <b>${esc(userClass)}</b> — <b>${canteenData.classSchedule.shift}-я смена</b>`);
    }
  }

  // 3. Погода
  if (weatherData) {
    const c = weatherData.current;
    lines.push(`\n🌤 <b>Погода:</b> ${c.icon} <b>${c.temperature ?? "—"}°C</b> (ощущается как ${c.apparent ?? "—"}°), ${esc(c.description)}`);
  }

  // 4. Дежурства
  if (dutyData && dutyData.count > 0) {
    const d = dutyData.items[0];
    lines.push(`\n🧹 <b>Дежурный класс:</b> <b>${esc(d.className ?? "—")}</b> (${esc(d.dutyType)})`);
  }

  lines.push("\n──────────────────────────");
  lines.push("💡 Нажмите /schedule для расписания или /menu для меню дня");
  return lines.join("\n");
}

/** Погода → HTML */
export async function weatherText(): Promise<string> {
  const data = await api<WeatherResponse>("/api/weather");
  if (!data) return "⚠️ Погода временно недоступна.";
  const c = data.current;
  const lines = [
    `${c.icon} <b>Погода в Академгородке (СУНЦ НГУ)</b>`,
    "──────────────────────────",
    `🌡 Температура: <b>${c.temperature ?? "—"}°C</b>${c.apparent !== null ? ` (ощущается как <b>${c.apparent}°</b>)` : ""}`,
    `🌤 Состояние: ${esc(c.description)}`,
  ];
  if (c.humidity !== null) lines.push(`💧 Влажность: <code>${c.humidity}%</code>`);
  if (c.windSpeed !== null) lines.push(`🌬 Ветер: <code>${c.windSpeed} м/с</code>${c.windDirection ? ` (${c.windDirection})` : ""}`);
  if (c.sunrise) lines.push(`🌅 Рассвет: <code>${c.sunrise}</code> · 🌇 Закат: <code>${c.sunset}</code>`);

  if (data.forecast.length) {
    lines.push("\n📅 <b>Прогноз на ближайшие дни:</b>");
    for (const f of data.forecast.slice(0, 3)) {
      lines.push(`  ${f.icon} <b>${esc(f.day)}:</b> <code>${f.tempMin ?? "—"}…${f.tempMax ?? "—"}°C</code>, ${esc(f.description)}`);
    }
  }
  return lines.join("\n");
}

/** Мероприятия → HTML */
export async function eventsText(classFilter?: string): Promise<string> {
  const data = await api<EventsResponse>("/api/events");
  if (!data) return "⚠️ Мероприятия временно недоступны.";
  if (!data.days.length) return "📌 Ближайших мероприятий в календаре школы не запланировано.";

  const lines = [
    `📌 <b>Мероприятия СУНЦ НГУ</b>${classFilter ? ` (класс <b>${esc(classFilter)}</b>)` : ""}`,
    "──────────────────────────",
  ];

  let shown = 0;
  for (const day of data.days) {
    let items = day.general;
    if (classFilter && day.byClass[classFilter]) {
      items = [...items, ...day.byClass[classFilter]];
    }
    if (!items.length) continue;

    lines.push(`\n📅 <b>${esc(day.date)} (${esc(day.weekday)}):</b>`);
    for (const item of items) {
      lines.push(`  • ${esc(item)}`);
      shown += 1;
    }
    if (shown >= 15) break;
  }

  lines.push("\n──────────────────────────");
  lines.push(`📊 Источник: <a href="${esc(data.source)}">Google-таблица школы</a>`);
  return lines.join("\n");
}

/** Дежурства → HTML */
export async function dutyText(): Promise<string> {
  const data = await api<DutyResponse>("/api/duty");
  if (!data || !data.items.length) return "🧹 Данные о дежурствах на сегодня пока не внесены.";

  const lines = ["🧹 <b>График дежурств СУНЦ НГУ</b>\n"];
  for (const item of data.items.slice(0, 6)) {
    lines.push(`• <b>${esc(item.className ?? "Класс")}</b> — ${esc(item.dutyType)} (<code>${esc(item.date)}</code>)`);
    if (item.responsible) lines.push(`  Ответственный: ${esc(item.responsible)}`);
  }
  return lines.join("\n");
}

/** Вожатые → HTML */
export async function counselorsText(): Promise<string> {
  const data = await api<CounselorsResponse>("/api/counselors");
  if (!data || !data.items.length) return "🌙 График ночных вожатых пока не внесён.";

  const lines = ["🌙 <b>Ночные вожатые в общежитиях СУНЦ</b>\n"];
  for (const c of data.items) {
    const phone = c.phone ? ` · 📞 ${esc(c.phone)}` : "";
    const floor = c.floor ? ` (${esc(c.floor)})` : "";
    lines.push(`• <b>${esc(c.dormitory)}</b>${floor}: ${esc(c.counselorName)}${phone}`);
  }
  return lines.join("\n");
}

/** Контакты школы */
export async function infoText(): Promise<string> {
  const data = await api<InfoResponse>("/api/info");
  if (!data) return "ℹ️ Справочная информация временно недоступна.";
  const lines = [
    `🏫 <b>${esc(data.school.name)}</b>`,
    `📍 ${esc(data.school.address)}`,
    `🌐 <a href="${esc(data.school.site)}">${esc(data.school.site)}</a>\n`,
    "<b>Контакты служб:</b>",
  ];
  for (const c of data.contacts.slice(0, 7)) {
    const p = c.phone ? ` 📞 <code>${esc(c.phone)}</code>` : "";
    const note = c.note ? ` <i>(${esc(c.note)})</i>` : "";
    lines.push(`• <b>${esc(c.title)}:</b>${p}${note}`);
  }
  return lines.join("\n");
}

/* ------------------------------ Бот --------------------------------- */

function main() {
  const bot = new Bot(TOKEN || "000:placeholder");

  // 1. Глобальная защита от флуда и DDoS (Anti-Flood)
  bot.use(async (ctx, next) => {
    const userId = ctx.from?.id;
    const username = ctx.from?.username ?? null;

    if (userId) {
      const rate = checkRateLimit(userId, username);
      if (!rate.allowed) {
        if (ctx.callbackQuery) {
          await ctx
            .answerCallbackQuery({
              text: `⏳ Защита от спама: подождите ${rate.waitSec} сек.`,
              show_alert: true,
            })
            .catch(() => {});
        } else if (rate.shouldWarn) {
          await ctx
            .reply(
              `⏳ <b>Слишком много запросов!</b>\n` +
                `Включена защита от флуда и спама. Пожалуйста, подождите <b>${rate.waitSec} сек.</b> перед отправкой новых команд.`,
              { parse_mode: "HTML" }
            )
            .catch(() => {});
        }
        // Немедленно блокируем дальнейшую обработку: никакого доступа к API и диску!
        return;
      }
    }

    const start = Date.now();
    let action = "interaction";
    if (ctx.from) {
      if (ctx.message?.text?.startsWith("/")) {
        action = ctx.message.text.split(" ")[0] ?? "/cmd";
      } else if (ctx.callbackQuery?.data) {
        action = `cb:${ctx.callbackQuery.data}`;
      } else if (ctx.message?.text) {
        action = `text:${ctx.message.text.slice(0, 25)}`;
      }
      trackUserInteraction(ctx, action);
    }
    try {
      await next();
      const dur = Date.now() - start;
      if (ctx.from && ctx.message?.text?.startsWith("/")) {
        botLogger.debug("DISPATCH", `${action} handled in ${dur}ms`);
      }
    } catch (err) {
      const dur = Date.now() - start;
      botLogger.error("DISPATCH", `Error processing ${action} (${dur}ms)`, err);
      throw err;
    }
  });

  // Команда /start
  bot.command("start", async (ctx) => {
    const userId = ctx.from?.id;
    const savedClass = userId ? userClassMap.get(userId) : undefined;

    if (savedClass) {
      const welcome = [
        "👋 <b>Привет, ФМШонок! С возвращением!</b> 🌲",
        `Твой сохранённый класс: 🟢 <b>${esc(savedClass)}</b>`,
        "──────────────────────────",
        "Используй кнопки внизу или команды:",
        "📅 /schedule — расписание занятий по парам",
        "🍱 /canteen — твоя смена питания в столовой",
        "⚡ /now — что сейчас идёт в школе",
        "🍽 /menu — меню столовой на сегодня",
        "🔔 /bells — звонки",
        "⚙️ /setclass — сменить класс",
        "📊 /stats — статистика школы",
      ].join("\n");

      await ctx.reply(welcome, {
        parse_mode: "HTML",
        reply_markup: getMainReplyKeyboard(savedClass),
      });
    } else {
      const firstGreeting = [
        "👋 <b>Привет, ФМШонок! Это бот «СУНЦ Инфо»</b> 🌲",
        "",
        "Я твой персональный ассистент по СУНЦ НГУ: расписание уроков по парам, смены питания в столовой, звонки, погода и новости.",
        "",
        "👇 <b>ВЫБЕРИ СВОЙ КЛАСС</b>, чтобы я настроил всё под тебя:",
      ].join("\n");

      await ctx.reply(firstGreeting, {
        parse_mode: "HTML",
        reply_markup: getClassSelectionKeyboard(),
      });
    }
  });

  // Авторизация администратора бота (/auth <пароль> или /login <пароль>)
  bot.command(["auth", "login"], async (ctx) => {
    const userId = ctx.from?.id;
    const username = ctx.from?.username ?? "unknown";
    if (!userId) return;

    // Сразу удаляем сообщение пользователя с паролем для безопасности
    try {
      await ctx.deleteMessage();
    } catch {}

    const key = ctx.match?.trim();
    if (!key) {
      return ctx.reply(
        "🔑 <b>Авторизация администратора:</b>\n" +
          "Используйте: <code>/auth &lt;пароль_администратора&gt;</code>\n\n" +
          "<i>(Сообщение с паролем удаляется автоматически для защиты от компрометации)</i>",
        { parse_mode: "HTML" }
      );
    }

    if (key === ADMIN_KEY) {
      verifiedAdminIds.add(userId);
      saveVerifiedAdmins();
      botLogger.audit("AUTH_SUCCESS", `User ${userId} (@${username}) successfully authenticated as admin`);
      return ctx.reply(
        "🛡️ <b>Успешная авторизация!</b>\n" +
          "Вам присвоены права администратора бота.\n\n" +
          "Доступные привилегии:\n" +
          "• 📋 <code>/logs [N]</code> — просмотр системного журнала\n" +
          "• 📊 <code>/stats</code> — статистика с активностью учеников\n" +
          "• 🔒 <code>/unauth</code> — завершить сессию админа",
        { parse_mode: "HTML" }
      );
    } else {
      botLogger.warn("SECURITY", `Failed /auth attempt from user ${userId} (@${username}) with invalid key`);
      applyPenaltyCooldown(userId, 45_000);
      return ctx.reply(
        "⛔ <b>Неверный ключ доступа.</b>\nПопытка зафиксирована в журнале безопасности. Включена временная задержка 45 сек.",
        { parse_mode: "HTML" }
      );
    }
  });

  // Завершение сессии администратора
  bot.command("unauth", async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;
    if (userId === 1573047506) {
      return ctx.reply("ℹ️ Главный владелец бота не может быть деавторизован.");
    }
    if (verifiedAdminIds.has(userId)) {
      verifiedAdminIds.delete(userId);
      saveVerifiedAdmins();
      botLogger.audit("AUTH_REVOKE", `User ${userId} revoked admin privileges`);
      return ctx.reply("🔒 Режим администратора отключён. Вы вернулись в режим обычного пользователя.");
    }
    return ctx.reply("Вы не авторизованы как администратор.");
  });

  // Служебная команда /admin или /sudo
  bot.command(["admin", "sudo"], async (ctx) => {
    const userId = ctx.from?.id;
    if (!isAdmin(userId)) {
      return ctx.reply(
        "🔒 <b>Панель администратора защищена.</b>\nДля входа используйте команду: <code>/auth &lt;ключ_доступа&gt;</code>",
        { parse_mode: "HTML" }
      );
    }
    return ctx.reply(
      "🛡️ <b>Панель администратора «СУНЦ Инфо»</b>\n" +
        "──────────────────────────\n" +
        "• 📋 <code>/logs 30</code> — просмотр системного журнала\n" +
        "• 📊 <code>/stats</code> — статистика с активностью учеников\n" +
        "• 🔒 <code>/unauth</code> — завершить сессию администратора",
      { parse_mode: "HTML" }
    );
  });

  // Статистика пользователей и классов (ОЧИЩЕНА ОТ ЛИЧНОЙ ИНФОРМАЦИИ ДЛЯ ОБЫЧНЫХ ПОЛЬЗОВАТЕЛЕЙ)
  bot.command(["stats", "users"], async (ctx) => {
    await ctx.replyWithChatAction("typing");
    const userId = ctx.from?.id;
    const userIsAdmin = isAdmin(userId);

    // Обычные пользователи получают безопасную агрегированную сводку без личных данных
    const statsPath = userIsAdmin
      ? `/api/users/stats?adminKey=${encodeURIComponent(ADMIN_KEY)}`
      : "/api/users/stats";

    const stats = await api<StatsResponse>(statsPath);

    if (!stats || !stats.bot) {
      const total = userProfiles.size;
      const byClass: Record<string, number> = {};
      for (const u of userProfiles.values()) {
        if (u.className) byClass[u.className] = (byClass[u.className] ?? 0) + 1;
      }
      const lines = [
        "📊 <b>Статистика пользователей «СУНЦ Инфо»</b>",
        "──────────────────────────",
        `👥 Всего пользователей бота: <b>${total}</b>`,
        "",
        "🏫 <b>Классы:</b>",
        ...Object.entries(byClass).map(([c, n]) => `• <b>${c}</b>: ${n} уч.`),
      ];
      return ctx.reply(lines.join("\n"), { parse_mode: "HTML" });
    }

    const b = stats.bot;
    const lines = [
      "📊 <b>Статистика «СУНЦ Инфо»</b>",
      "──────────────────────────",
      `👥 <b>Всего пользователей бота:</b> <code>${b.totalUsers}</code>`,
      `⚡ <b>Активных сегодня:</b> <code>${b.activeToday}</code>`,
      `📅 <b>Активных за неделю:</b> <code>${b.activeWeek}</code>`,
      `🏫 <b>С выбранным классом:</b> <code>${b.withClassCount}</code>`,
      "",
      "🏆 <b>Топ классов в боте:</b>",
    ];

    if (b.topClasses && b.topClasses.length > 0) {
      b.topClasses.slice(0, 8).forEach((item, idx) => {
        const medal = idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : "•";
        lines.push(`${medal} <b>${item.className}</b> — <code>${item.count}</code> уч.`);
      });
    } else {
      lines.push("<i>Пока нет данных</i>");
    }

    lines.push("\n🎓 <b>По параллелям:</b>");
    lines.push(`• 11-е классы: <b>${b.byGrade["11"] ?? 0}</b>`);
    lines.push(`• 10-е классы: <b>${b.byGrade["10"] ?? 0}</b>`);
    lines.push(`• 9-е классы: <b>${b.byGrade["9"] ?? 0}</b>`);
    lines.push(`• 8-е классы: <b>${b.byGrade["8"] ?? 0}</b>`);

    // ЛИЧНАЯ ИНФОРМАЦИЯ (ID, юзернеймы, действия) видна ИСКЛЮЧИТЕЛЬНО верифицированным администраторам!
    if (userIsAdmin && b.recentUsers && b.recentUsers.length > 0) {
      lines.push("\n🛡️ <b>Недавняя активность (только для администраторов):</b>");
      for (const u of b.recentUsers.slice(0, 8)) {
        const uLabel = u.username ? `@${esc(u.username)}` : (u.firstName ? esc(u.firstName) : `ID: ${u.id}`);
        const cLabel = u.className ? ` [<b>${esc(u.className)}</b>]` : "";
        const actLabel = u.lastAction ? ` · <i>${esc(u.lastAction)}</i>` : "";
        lines.push(`• <code>${u.id}</code> ${uLabel}${cLabel}${actLabel}`);
      }
    }

    await ctx.reply(lines.join("\n"), { parse_mode: "HTML" });
  });

  // Журнал недавних событий (логи) — ДОСТУПНО ТОЛЬКО АДМИНИСТРАТОРАМ!
  bot.command("logs", async (ctx) => {
    const userId = ctx.from?.id;
    const username = ctx.from?.username ?? "unknown";

    if (!isAdmin(userId)) {
      botLogger.warn("SECURITY", `Blocked unauthorized /logs attempt by user ${userId} (@${username})`);
      return ctx.reply(
        "⛔ <b>Доступ ограничен.</b>\nЭта команда предназначена только для верифицированных администраторов.",
        { parse_mode: "HTML" }
      );
    }

    const countArg = parseInt(ctx.match?.trim() || "20", 10);
    const limit = isNaN(countArg) ? 20 : Math.min(Math.max(countArg, 5), 50);
    const lines = getRecentBotLogs(limit);
    const codeBlock = lines.join("\n");
    const formatted = [
      `📋 <b>Журнал событий бота (последние ${lines.length} строк):</b>`,
      "──────────────────────────",
      `<pre><code>${esc(codeBlock)}</code></pre>`,
    ].join("\n");

    await ctx.reply(formatted, { parse_mode: "HTML" });
  });

  bot.command("help", async (ctx) => {
    const userId = ctx.from?.id;
    const savedClass = userId ? userClassMap.get(userId) : undefined;
    const userIsAdmin = isAdmin(userId);

    const lines = [
      "ℹ️ <b>Команды бота «СУНЦ Инфо»:</b>",
      "──────────────────────────",
      "📅 /schedule — расписание занятий по парам",
      "⏰ /tomorrow — расписание на завтра",
      "🍱 /canteen — смена и график питания столовой",
      "🍽 /menu — меню столовой на сегодня",
      "⚡ /now — что прямо сейчас идёт в школе",
      "🔔 /bells — расписание звонков (3 пары + спецкурсы)",
      "🔍 /find &lt;учитель|ауд&gt; — поиск расписания",
      "📌 /events — мероприятия из календаря школы",
      "🌤 /weather — погода в Академгородке",
      "🧹 /duty — дежурства классов",
      "🌙 /counselors — ночные вожатые",
      "🏫 /setclass — сменить свой класс",
      "📊 /stats — статистика школы",
    ];

    if (userIsAdmin) {
      lines.push(
        "",
        "🛡️ <b>Команды администратора:</b>",
        "📋 /logs [N] — системный журнал (logs/bot.log)",
        "🔒 /unauth — выйти из режима админа"
      );
    }

    lines.push(
      "",
      savedClass ? `👤 Твой текущий класс: <b>${esc(savedClass)}</b>` : "⚠️ Класс пока не выбран. Нажмите /setclass"
    );

    await ctx.reply(lines.join("\n"), {
      parse_mode: "HTML",
      reply_markup: getMainReplyKeyboard(savedClass),
    });
  });

  bot.command("setclass", async (ctx) => {
    const arg = ctx.match?.trim();
    if (arg && /^\d{1,2}-\d{1,2}$/.test(arg)) {
      const userId = ctx.from?.id;
      if (userId) saveUserClass(userId, arg, ctx);
      return ctx.reply(`🎉 <b>Класс успешно сохранён: ${esc(arg)}!</b>\nТеперь расписание и график питания будут показываться для этого класса.`, {
        parse_mode: "HTML",
        reply_markup: getMainReplyKeyboard(arg),
      });
    }

    await ctx.reply("👇 <b>Выберите ваш класс из списка ниже:</b>", {
      parse_mode: "HTML",
      reply_markup: getClassSelectionKeyboard(),
    });
  });

  bot.command("myclass", async (ctx) => {
    const userId = ctx.from?.id;
    const saved = userId ? userClassMap.get(userId) : undefined;
    if (saved) {
      await ctx.reply(`👤 Ваш сохранённый класс: <b>${esc(saved)}</b>.\nЧтобы изменить, нажмите кнопку ниже:`, {
        parse_mode: "HTML",
        reply_markup: new InlineKeyboard().text("⚙️ Сменить класс", "pickclass"),
      });
    } else {
      await ctx.reply("👤 Класс ещё не выбран. Выберите класс ниже:", {
        parse_mode: "HTML",
        reply_markup: getClassSelectionKeyboard(),
      });
    }
  });

  bot.command("canteen", async (ctx) => {
    const userId = ctx.from?.id;
    const savedClass = userId ? userClassMap.get(userId) : undefined;
    const arg = ctx.match?.trim() || savedClass;

    if (!arg) {
      return ctx.reply("🍱 <b>Сначала выберите свой класс:</b>", {
        parse_mode: "HTML",
        reply_markup: getClassSelectionKeyboard(),
      });
    }

    await ctx.replyWithChatAction("typing");
    const res = await canteenText(arg);
    await ctx.reply(res.text, {
      parse_mode: "HTML",
      reply_markup: res.keyboard,
    });
  });

  bot.command("now", async (ctx) => {
    const userId = ctx.from?.id;
    const savedClass = userId ? userClassMap.get(userId) : undefined;
    await ctx.replyWithChatAction("typing");
    await ctx.reply(await nowText(savedClass), { parse_mode: "HTML" });
  });

  bot.command("find", async (ctx) => {
    const arg = ctx.match?.trim();
    if (!arg) {
      return ctx.reply("🔍 Введите фамилию преподавателя или номер аудитории:\nНапример: <code>/find Горшков</code> или <code>/find 2_10</code>", {
        parse_mode: "HTML",
      });
    }
    await ctx.replyWithChatAction("typing");
    await ctx.reply(await findScheduleText(arg), { parse_mode: "HTML" });
  });

  bot.command("menu", async (ctx) => {
    const arg = ctx.match?.trim();
    const date = /^\d{2}\.\d{2}\.\d{4}$/.test(arg ?? "") ? arg : undefined;
    await ctx.replyWithChatAction("typing");
    const res = await menuText(date);
    await ctx.reply(res.text, {
      parse_mode: "HTML",
      disable_web_page_preview: true,
      reply_markup: res.keyboard,
    });
  });

  bot.command("bells", async (ctx) => {
    await ctx.reply(await bellsText(), { parse_mode: "HTML" });
  });

  bot.command("schedule", async (ctx) => {
    const userId = ctx.from?.id;
    const savedClass = userId ? userClassMap.get(userId) : undefined;
    const group = ctx.match?.trim() || savedClass;

    if (!group) {
      return ctx.reply("📅 <b>Выберите ваш класс для просмотра расписания:</b>", {
        parse_mode: "HTML",
        reply_markup: getClassSelectionKeyboard(),
      });
    }

    await ctx.replyWithChatAction("typing");
    const res = await scheduleText(group);
    await ctx.reply(res.text, {
      parse_mode: "HTML",
      reply_markup: res.keyboard,
    });
  });

  bot.command("tomorrow", async (ctx) => {
    const userId = ctx.from?.id;
    const savedClass = userId ? userClassMap.get(userId) : undefined;
    const group = ctx.match?.trim() || savedClass;

    if (!group) {
      return ctx.reply("⏰ <b>Выберите ваш класс для просмотра расписания на завтра:</b>", {
        parse_mode: "HTML",
        reply_markup: getClassSelectionKeyboard(),
      });
    }

    const res = await scheduleText(group, undefined, true);
    await ctx.reply(res.text, {
      parse_mode: "HTML",
      reply_markup: res.keyboard,
    });
  });

  bot.command("events", async (ctx) => {
    const userId = ctx.from?.id;
    const savedClass = userId ? userClassMap.get(userId) : undefined;
    const arg = ctx.match?.trim() || savedClass;
    const classFilter = arg && /^\d{1,2}-\d{1,2}$/.test(arg) ? arg : undefined;
    await ctx.replyWithChatAction("typing");
    await ctx.reply(await eventsText(classFilter), { parse_mode: "HTML", disable_web_page_preview: true });
  });

  bot.command("weather", async (ctx) => {
    await ctx.reply(await weatherText(), { parse_mode: "HTML" });
  });

  bot.command("duty", async (ctx) => {
    await ctx.reply(await dutyText(), { parse_mode: "HTML" });
  });

  bot.command("counselors", async (ctx) => {
    await ctx.reply(await counselorsText(), { parse_mode: "HTML" });
  });

  bot.command("info", async (ctx) => {
    await ctx.reply(await infoText(), { parse_mode: "HTML" });
  });

  // Callback query: сохранение выбранного класса
  bot.callbackQuery(/^setclass:(.+)$/, async (ctx) => {
    const className = ctx.match[1];
    const userId = ctx.from?.id;
    if (userId) {
      saveUserClass(userId, className, ctx);
    }
    await ctx.answerCallbackQuery(`Класс ${className} сохранён! 🎉`);

    const cData = await api<CanteenScheduleResponse>(`/api/canteen/schedule?class=${encodeURIComponent(className)}`);
    const shift = cData?.classSchedule?.shift;
    const shiftText = shift ? `Твоя смена питания: 🟢 <b>${shift}-я смена</b>\n` : "";

    const confirmed = [
      `🎉 <b>Класс успешно сохранён: ${esc(className)}</b>`,
      shiftText,
      "Что хочешь посмотреть?",
    ].join("\n");

    const kb = new InlineKeyboard()
      .text("📅 Расписание на сегодня", `sched:${className}:today`).row()
      .text("🍱 Моя смена в столовой", `canteen:class:${className}`).row()
      .text("⚡ Что сейчас идёт?", "now:action");

    await ctx.editMessageText(confirmed, {
      parse_mode: "HTML",
      reply_markup: kb,
    });

    // Отправляем подсказку с обновленной клавиатурой
    await ctx.reply("Клавиатура быстрого доступа обновлена под твой класс:", {
      reply_markup: getMainReplyKeyboard(className),
    });
  });

  // Callback query: запрос меню смены столовой
  bot.callbackQuery(/^canteen:class:(.+)$/, async (ctx) => {
    const className = ctx.match[1];
    await ctx.answerCallbackQuery();
    const res = await canteenText(className);
    await ctx.editMessageText(res.text, { parse_mode: "HTML", reply_markup: res.keyboard });
  });

  // Callback query: переключение смен столовой
  bot.callbackQuery(/^canteen:shift:(.+)$/, async (ctx) => {
    const shiftArg = ctx.match[1];
    await ctx.answerCallbackQuery();
    if (shiftArg === "all") {
      const res = await canteenText();
      await ctx.editMessageText(res.text, { parse_mode: "HTML", reply_markup: res.keyboard });
    } else {
      const dummyClassByShift: Record<string, string> = { "1": "11-1", "2": "10-1", "3": "9-1" };
      const res = await canteenText(dummyClassByShift[shiftArg] ?? "10-1");
      await ctx.editMessageText(res.text, { parse_mode: "HTML", reply_markup: res.keyboard });
    }
  });

  // Callback query: интерактивный выбор класса
  bot.callbackQuery("pickclass", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText("👇 <b>Выберите ваш класс из списка:</b>", {
      parse_mode: "HTML",
      reply_markup: getClassSelectionKeyboard(),
    });
  });

  // Callback query: сейчас в школе
  bot.callbackQuery("now:action", async (ctx) => {
    const userId = ctx.from?.id;
    const savedClass = userId ? userClassMap.get(userId) : undefined;
    await ctx.answerCallbackQuery();
    await ctx.reply(await nowText(savedClass), { parse_mode: "HTML" });
  });

  // Callback query: переключение дней расписания
  bot.callbackQuery(/^sched:(.+):(.+)$/, async (ctx) => {
    const group = ctx.match[1];
    const dayArg = ctx.match[2];
    await ctx.answerCallbackQuery();

    const wd = dayArg === "today" ? nowNsk().getUTCDay() : Number(dayArg);
    const res = await scheduleText(group, wd === 0 ? 1 : wd);
    await ctx.editMessageText(res.text, { parse_mode: "HTML", reply_markup: res.keyboard });
  });

  // Callback query: переключение дат меню
  bot.callbackQuery(/^menu:(.+)$/, async (ctx) => {
    const date = ctx.match[1];
    await ctx.answerCallbackQuery();
    if (date === "info") {
      const res = await canteenText();
      return ctx.reply(res.text, { parse_mode: "HTML", reply_markup: res.keyboard });
    }
    const res = await menuText(date);
    await ctx.editMessageText(res.text, { parse_mode: "HTML", disable_web_page_preview: true, reply_markup: res.keyboard });
  });

  // Обработка текстовых кнопок из Reply-клавиатуры
  bot.on("message:text", async (ctx) => {
    const text = ctx.message.text.trim();
    const userId = ctx.from?.id;
    const savedClass = userId ? userClassMap.get(userId) : undefined;

    if (text === "🍽 Меню") {
      await ctx.replyWithChatAction("typing");
      const res = await menuText();
      return ctx.reply(res.text, { parse_mode: "HTML", disable_web_page_preview: true, reply_markup: res.keyboard });
    }

    if (text === "📅 Расписание") {
      if (!savedClass) {
        return ctx.reply("📅 <b>Выберите ваш класс для просмотра расписания:</b>", {
          parse_mode: "HTML",
          reply_markup: getClassSelectionKeyboard(),
        });
      }
      await ctx.replyWithChatAction("typing");
      const res = await scheduleText(savedClass);
      return ctx.reply(res.text, { parse_mode: "HTML", reply_markup: res.keyboard });
    }

    if (text === "🍱 Столовая") {
      if (!savedClass) {
        return ctx.reply("🍱 <b>Выберите ваш класс, чтобы узнать смену питания:</b>", {
          parse_mode: "HTML",
          reply_markup: getClassSelectionKeyboard(),
        });
      }
      await ctx.replyWithChatAction("typing");
      const res = await canteenText(savedClass);
      return ctx.reply(res.text, { parse_mode: "HTML", reply_markup: res.keyboard });
    }

    if (text === "⚡ Сейчас") {
      await ctx.replyWithChatAction("typing");
      return ctx.reply(await nowText(savedClass), { parse_mode: "HTML" });
    }

    if (text === "🔔 Звонки") {
      return ctx.reply(await bellsText(), { parse_mode: "HTML" });
    }

    if (text === "📌 События" || text === "📌 Мероприятия") {
      await ctx.replyWithChatAction("typing");
      return ctx.reply(await eventsText(savedClass), { parse_mode: "HTML", disable_web_page_preview: true });
    }

    if (text === "🌤 Погода") {
      return ctx.reply(await weatherText(), { parse_mode: "HTML" });
    }

    if (text === "🏫 Выбрать класс" || text.startsWith("🏫 Класс:")) {
      return ctx.reply("👇 <b>Выберите ваш класс из списка:</b>", {
        parse_mode: "HTML",
        reply_markup: getClassSelectionKeyboard(),
      });
    }
  });

  if (TOKEN) {
    bot
      .init()
      .then(() => {
        bot.api.setMyCommands([
          { command: "start", description: "🚀 Запуск и выбор класса" },
          { command: "now", description: "⚡ Что сейчас идёт в школе" },
          { command: "schedule", description: "📅 Расписание занятий по парам" },
          { command: "canteen", description: "🍱 График питания в столовой" },
          { command: "menu", description: "🍽 Меню столовой на сегодня" },
          { command: "tomorrow", description: "⏰ Расписание на завтра" },
          { command: "setclass", description: "👤 Выбрать или сменить класс" },
          { command: "find", description: "🔍 Поиск учителя или аудитории" },
          { command: "bells", description: "🔔 Расписание звонков" },
          { command: "events", description: "📌 Мероприятия школы" },
          { command: "weather", description: "🌤 Погода в Академгородке" },
          { command: "duty", description: "🧹 График дежурств" },
          { command: "counselors", description: "🌙 Ночные вожатые" },
          { command: "stats", description: "📊 Статистика школы" },
          { command: "help", description: "❓ Справка по командам" },
        ]).catch(() => {});
        bot.start();
        botLogger.info("STARTUP", `Telegram бот запущен (long polling), API: ${API}, профилей в памяти: ${userProfiles.size}`);
        console.log(`[tg-bot] Бот запущен (long polling), API портала: ${API}`);
      })
      .catch((err) => {
        botLogger.error("STARTUP", `Не удалось запустить бота: ${err?.message ?? err}`);
        console.error("[tg-bot] Не удалось запустить бота:", err?.message ?? err);
      });
  } else {
    botLogger.warn("STARTUP", "TELEGRAM_BOT_TOKEN не задан — работаем в спящем режиме");
    console.warn("[tg-bot] TELEGRAM_BOT_TOKEN не задан — работаем в спящем режиме.");
  }
}

/* ------------------------ Health-сервер ----------------------------- */

if (import.meta.main) {
  botLogger.info("SERVICE", `Инициализация микросервиса tg-bot на порту ${PORT}`);
  Bun.serve({
    port: PORT,
    fetch(req) {
      const url = new URL(req.url);
      if (url.pathname === "/health") {
        botLogger.debug("HEALTH", `Health check ping от ${req.headers.get("user-agent") || "unknown"}`);
        return Response.json({
          ok: true,
          service: "sunc-info-tg-bot",
          port: PORT,
          api: API,
          bot: TOKEN ? "running" : "sleeping (no TELEGRAM_BOT_TOKEN)",
          time: new Date().toISOString(),
          totalUsersCount: userProfiles.size,
          savedClassesCount: userClassMap.size,
          features: [
            "interactive_class_picker_on_start",
            "persistent_user_classes_and_profiles",
            "user_tracking_id_username_matching",
            "pairs_grouped_schedule (3 pairs)",
            "accurate_subgroup_and_window_detection",
            "canteen_shifts (rasp.jpg)",
            "now_status",
            "search_teacher_classroom",
            "users_and_classes_stats",
          ],
        });
      }
      return new Response("Not found", { status: 404 });
    },
  });

  botLogger.info("SERVICE", `Health-сервер запущен: http://localhost:${PORT}/health`);
  console.log(`[tg-bot] Health-сервер: http://localhost:${PORT}/health`);
  main();
}

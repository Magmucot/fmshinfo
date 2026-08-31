/**
 * Telegram-бот «СУНЦ Инфо» (mini-service, порт 3003)
 *
 * Данные берёт из API основного портала (http://localhost:3000/api/...):
 *   /menu, /bells, /schedule, /weather, /news, /duty, /counselors, /info
 *
 * Запуск с токеном:   TELEGRAM_BOT_TOKEN=123:ABC bun run dev
 * Токен получаете у @BotFather (см. README.md).
 * Без токена сервис стартует в «спящем» режиме: health-сервер работает,
 * бот не подключается (удобно для разработки без Telegram).
 */

import { Bot } from "grammy";

const PORT = 3003;
const API = process.env.PORTAL_API ?? "http://localhost:3000";
const TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? "";

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
  typeName: string | null;
}
interface ScheduleResponse {
  ok: boolean;
  group: string | null;
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

/* --------------------------- HTTP-клиент ---------------------------- */

async function api<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${API}${path}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(60_000),
    });
    const data = (await res.json()) as T & { ok?: boolean; error?: string };
    if (!res.ok || data.ok === false) return null;
    return data;
  } catch {
    return null;
  }
}

/* ------------------------- Форматирование --------------------------- */

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Текущая дата/время в Новосибирске (UTC+7) в виде Date, «сдвинутого» на UTC-методы */
function nowNsk(): Date {
  return new Date(Date.now() + 7 * 3600 * 1000);
}

function fmtRu(d: Date): string {
  return `${String(d.getUTCDate()).padStart(2, "0")}.${String(d.getUTCMonth() + 1).padStart(2, "0")}.${d.getUTCFullYear()}`;
}

const WEEKDAYS = ["Воскресенье", "Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота"];

/** Меню столовой → HTML-текст */
export async function menuText(date?: string): Promise<string> {
  const data = await api<MenuResponse>(`/api/menu${date ? `?date=${encodeURIComponent(date)}` : ""}`);
  if (!data) return "⚠️ Меню временно недоступно. Попробуйте позже.";
  if (!data.meals.length) return `📋 На ${esc(data.date)} меню ещё не опубликовано.`;

  const lines: string[] = [`🍽 <b>Меню столовой на ${esc(data.date)}</b>\n`];
  for (const meal of data.meals) {
    lines.push(`<b>${esc(meal.type)}</b> (${meal.totals?.kcal ?? "—"} ккал):`);
    for (const dish of meal.dishes) {
      lines.push(`  • ${esc(dish.name)}${dish.weight ? ` — ${dish.weight} г` : ""}${dish.kcal ? ` (${dish.kcal} ккал)` : ""}`);
    }
    lines.push("");
  }
  const t = data.dayTotals;
  if (t?.kcal) {
    lines.push(`🔥 Итого за день: <b>${t.kcal} ккал</b>`);
    lines.push(`   Б ${t.protein ?? "—"} · Ж ${t.fat ?? "—"} · У ${t.carbs ?? "—"} г`);
  }
  if (data.pdfUrl) lines.push(`\n📄 <a href="${esc(data.pdfUrl)}">Оригинал (PDF)</a>`);
  return lines.join("\n");
}

/** Звонки → HTML */
export async function bellsText(): Promise<string> {
  const data = await api<BellsResponse>("/api/bells");
  if (!data) return "⚠️ Расписание звонков недоступно.";
  const byPair = new Map<string, typeof data.bells>();
  for (const b of data.bells) {
    const key = b.pairName ?? "Дополнительно";
    if (!byPair.has(key)) byPair.set(key, []);
    byPair.get(key)!.push(b);
  }
  const lines = ["🔔 <b>Расписание звонков</b>\n"];
  for (const [pair, bells] of byPair) {
    lines.push(`<b>${esc(pair)}:</b> ${bells.map((b) => `${b.begin}–${b.end}`).join(", ")}`);
  }
  lines.push("\n🍱 Обеденный перерыв: 14:10–16:00 (факультативы 15:00–16:00)");
  return lines.join("\n");
}

/** Расписание класса на сегодня/завтра с учётом групп (параллельные уроки) */
export async function scheduleText(group: string, tomorrow = false): Promise<string> {
  const data = await api<ScheduleResponse>(`/api/schedule?group=${encodeURIComponent(group)}`);
  if (!data) return `⚠️ Расписание класса ${esc(group)} недоступно.`;

  const nsk = nowNsk();
  let wd = nsk.getUTCDay(); // 0=Вс..6=Сб
  if (tomorrow) wd = (wd + 1) % 7;
  if (wd === 0) return `☀️ ${tomorrow ? "Завтра" : "Сегодня"} воскресенье — занятий нет.`;

  const lessons = data.days[String(wd)] ?? [];
  if (!lessons.length) return `📭 На ${tomorrow ? "завтра" : "сегодня"} (${WEEKDAYS[wd].toLowerCase()}) занятий у ${esc(group)} нет.`;

  // Группировка по времени: одинаковое время = параллельные группы
  const slots = new Map<string, ScheduleLesson[]>();
  for (const l of lessons) {
    const key = `${l.begin}-${l.end}`;
    if (!slots.has(key)) slots.set(key, []);
    slots.get(key)!.push(l);
  }

  const title = tomorrow ? "завтра" : "сегодня";
  const lines = [`📅 <b>${esc(group)} — ${WEEKDAYS[wd]} (${title})</b>\n`];
  let num = 0;
  for (const [key, ls] of slots) {
    num += 1;
    const [begin, end] = key.split("-");
    const time = `<code>${begin}–${end}</code>`;
    if (ls.length === 1) {
      const l = ls[0];
      lines.push(`${num}. ${time} ${esc(l.lesson)}${l.classroom ? ` (${esc(l.classroom)})` : ""}${l.teacher ? ` — ${esc(l.teacher)}` : ""}`);
    } else {
      lines.push(`${num}. ${time} <b>класс делится на ${ls.length} группы:</b>`);
      ls.forEach((l, i) => {
        lines.push(
          `    ${i + 1}) ${esc(l.lesson)}${l.classroom ? ` (${esc(l.classroom)})` : ""}${l.teacher ? ` — ${esc(l.teacher)}` : ""}`
        );
      });
    }
  }
  lines.push(`\n📊 Уроков по сетке: ${slots.size} (занятий: ${lessons.length})`);
  return lines.join("\n");
}

/** Погода → HTML */
export async function weatherText(): Promise<string> {
  const data = await api<WeatherResponse>("/api/weather");
  if (!data) return "⚠️ Погода временно недоступна.";
  const c = data.current;
  const lines = [
    `${c.icon} <b>Погода в Академгородке</b>\n`,
    `🌡 Температура: <b>${c.temperature ?? "—"}°C</b>${c.apparent !== null ? ` (ощущается ${c.apparent}°)` : ""}`,
    `🌤 ${esc(c.description)}`,
  ];
  if (c.humidity !== null) lines.push(`💧 Влажность: ${c.humidity}%`);
  if (c.windSpeed !== null) lines.push(`🌬 Ветер: ${c.windSpeed} м/с${c.windDirection ? ` (${c.windDirection})` : ""}`);
  if (c.sunrise) lines.push(`🌅 Рассвет: ${c.sunrise} · 🌇 Закат: ${c.sunset}`);
  if (data.forecast.length) {
    lines.push("\n<b>Прогноз:</b>");
    for (const f of data.forecast.slice(0, 3)) {
      lines.push(`  ${f.icon} ${esc(f.day)}: ${f.tempMin ?? "—"}…${f.tempMax ?? "—"}°C, ${esc(f.description)}`);
    }
  }
  return lines.join("\n");
}

/** Новости → HTML */
export async function newsText(): Promise<string> {
  const data = await api<NewsResponse>("/api/news?limit=6");
  if (!data || !data.items.length) return "⚠️ Новости временно недоступны.";
  const lines = ["📰 <b>Новости СУНЦ НГУ</b>\n"];
  for (const item of data.items) {
    lines.push(`• <a href="${esc(item.url)}">${esc(item.title)}</a>`);
    if (item.date) lines.push(`   ${esc(item.date)}${item.rubric ? ` · ${esc(item.rubric)}` : ""}`);
  }
  return lines.join("\n");
}

/** Дежурства → HTML */
export async function dutyText(): Promise<string> {
  const date = fmtRu(nowNsk());
  const data = await api<DutyResponse>(`/api/duty?date=${encodeURIComponent(date)}`);
  if (!data) return "⚠️ График дежурств недоступен.";
  if (!data.count) return `🧹 На ${date} дежурств нет.`;
  const lines = [`🧹 <b>Дежурства на ${date}</b>\n`];
  for (const d of data.items) {
    lines.push(`• <b>${esc(d.className ?? "—")}</b> — ${esc(d.dutyType)}${d.timeInterval ? ` (${esc(d.timeInterval)})` : ""}${d.responsible ? ` · ${esc(d.responsible)}` : ""}`);
  }
  return lines.join("\n");
}

/** Ночные вожатые → HTML */
export async function counselorsText(): Promise<string> {
  const date = fmtRu(nowNsk());
  const data = await api<CounselorsResponse>(`/api/counselors?date=${encodeURIComponent(date)}`);
  if (!data) return "⚠️ График вожатых недоступен.";
  if (!data.count) return `🌙 На ${date} график ночных вожатых не внесён.`;
  const lines = [`🌙 <b>Ночные вожатые на ${date}</b>\n`];
  for (const c of data.items) {
    lines.push(`• <b>${esc(c.counselorName)}</b> — ${esc(c.dormitory)}${c.floor ? `, ${esc(c.floor)}` : ""}${c.phone ? ` · ${esc(c.phone)}` : ""}`);
  }
  return lines.join("\n");
}

/** Справочник → HTML */
export async function infoText(): Promise<string> {
  const data = await api<InfoResponse>("/api/info");
  if (!data) return "⚠️ Справочник недоступен.";
  const lines = [
    "🏫 <b>СУНЦ НГУ (ФМШ)</b>\n",
    `📍 ${esc(data.school.address)}`,
    `🌐 ${esc(data.school.site)}`,
    `✉️ ${esc(data.school.email)}\n`,
    "<b>Контакты:</b>",
  ];
  for (const c of data.contacts.slice(0, 6)) {
    lines.push(`• ${esc(c.title)}: ${c.phone ? `<code>${esc(c.phone)}</code>` : ""}${c.email ? ` ${esc(c.email)}` : ""}`);
  }
  return lines.join("\n");
}

/* ------------------------------ Бот --------------------------------- */

const WELCOME = [
  "👋 <b>Привет! Это «СУНЦ Инфо» — бот ученика СУНЦ НГУ (ФМШ)</b>\n",
  "Всё самое нужное из школы в одном месте:\n",
  "🍽 /menu — меню столовой (сегодня)",
  "🍽 /menu 01.09.2026 — меню на дату",
  "🔔 /bells — расписание звонков",
  "📅 /schedule — расписание твоего класса на сегодня (с группами!)",
  "📅 /schedule 10-2 — расписание другого класса",
  "⏰ /tomorrow — расписание на завтра",
  "🌤 /weather — погода в Академгородке",
  "📰 /news — новости школы",
  "🧹 /duty — дежурства сегодня",
  "🌙 /counselors — ночные вожатые",
  "🏫 /info — контакты школы\n",
  "Данные: sesc.nsu.ru, table-sesc.nsu.ru, Open-Meteo. Бот неофициальный ♥",
].join("\n");

function main() {
  const bot = new Bot(TOKEN || "000:placeholder");

  bot.command("start", async (ctx) => ctx.reply(WELCOME, { parse_mode: "HTML", disable_web_page_preview: true }));
  bot.command("help", async (ctx) => ctx.reply(WELCOME, { parse_mode: "HTML", disable_web_page_preview: true }));

  bot.command("menu", async (ctx) => {
    const arg = ctx.match?.trim();
    const date = /^\d{2}\.\d{2}\.\d{4}$/.test(arg ?? "") ? arg : undefined;
    await ctx.replyWithChatAction("typing");
    await ctx.reply(await menuText(date), { parse_mode: "HTML", disable_web_page_preview: true });
  });

  bot.command("bells", async (ctx) => {
    await ctx.reply(await bellsText(), { parse_mode: "HTML" });
  });

  bot.command("schedule", async (ctx) => {
    const group = ctx.match?.trim() || "10-1";
    await ctx.replyWithChatAction("typing");
    await ctx.reply(await scheduleText(group), { parse_mode: "HTML" });
  });

  bot.command("tomorrow", async (ctx) => {
    const group = ctx.match?.trim() || "10-1";
    await ctx.reply(await scheduleText(group, true), { parse_mode: "HTML" });
  });

  bot.command("weather", async (ctx) => {
    await ctx.reply(await weatherText(), { parse_mode: "HTML" });
  });

  bot.command("news", async (ctx) => {
    await ctx.reply(await newsText(), { parse_mode: "HTML", disable_web_page_preview: true });
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

  bot.callbackQuery(/^menu:/, async (ctx) => {
    const date = ctx.callbackQuery.data.slice(5);
    await ctx.answerCallbackQuery();
    await ctx.replyWithChatAction("typing");
    await ctx.reply(await menuText(date), { parse_mode: "HTML", disable_web_page_preview: true });
  });

  if (TOKEN) {
    bot
      .init()
      .then(() => {
        bot.api.setMyCommands([
          { command: "menu", description: "🍽 Меню столовой" },
          { command: "schedule", description: "📅 Расписание класса" },
          { command: "tomorrow", description: "⏰ Расписание на завтра" },
          { command: "bells", description: "🔔 Звонки" },
          { command: "weather", description: "🌤 Погода" },
          { command: "news", description: "📰 Новости" },
          { command: "duty", description: "🧹 Дежурства" },
          { command: "counselors", description: "🌙 Ночные вожатые" },
          { command: "info", description: "🏫 Контакты" },
        ]).catch(() => {});
        bot.start();
        console.log(`[tg-bot] Бот запущен (long polling), API портала: ${API}`);
      })
      .catch((err) => {
        console.error("[tg-bot] Не удалось запустить бота:", err?.message ?? err);
      });
  } else {
    console.warn("[tg-bot] TELEGRAM_BOT_TOKEN не задан — работаем в спящем режиме (health-сервер активен).");
    console.warn("[tg-bot] Получите токен у @BotFather и перезапустите: TELEGRAM_BOT_TOKEN=... bun run dev");
  }
}

/* ------------------------ Health-сервер ----------------------------- */

if (import.meta.main) {
Bun.serve({
  port: PORT,
  fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === "/health") {
      return Response.json({
        ok: true,
        service: "sunc-info-tg-bot",
        port: PORT,
        api: API,
        bot: TOKEN ? "running" : "sleeping (no TELEGRAM_BOT_TOKEN)",
        time: new Date().toISOString(),
      });
    }
    return new Response("Not found", { status: 404 });
  },
});

console.log(`[tg-bot] Health-сервер: http://localhost:${PORT}/health`);
main();
}

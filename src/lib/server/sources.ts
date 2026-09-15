/**
 * Константы источников данных (docs/sunc-info-analysis.md).
 */

export const SESC_BASE = "https://sesc.nsu.ru";
export const CATERING_URL = `${SESC_BASE}/sveden/catering`;
export const NEWS_URL = `${SESC_BASE}/media/news/`;

export const TABLE_SESC_BASE = "https://table-sesc.nsu.ru";

export const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

/** Координаты СУНЦ НГУ (Академгородок, ул. Пирогова) */
export const SESC_COORDS = { lat: 54.842, lon: 83.098 } as const;

export async function fetchWithTimeout(
  url: string,
  init: RequestInit & { timeoutMs?: number; retries?: number } = {}
): Promise<Response> {
  const { timeoutMs = 20000, retries = 2, ...rest } = init;

  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        ...rest,
        signal: controller.signal,
        headers: {
          "User-Agent": USER_AGENT,
          "Accept-Language": "ru-RU,ru;q=0.9",
          ...(rest.headers ?? {}),
        },
        cache: "no-store",
      });
      // 5xx — тоже повод повторить (Битрикс иногда отдаёт 502)
      if (response.status >= 500 && attempt < retries) {
        lastError = new Error(`HTTP ${response.status}`);
        await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
        continue;
      }
      return response;
    } catch (error) {
      lastError = error;
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
        continue;
      }
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError instanceof Error ? lastError : new Error("fetch failed");
}

/**
 * Статическое расписание звонков (резервный источник — академический календарь).
 * В API table-sesc нет пары 21:20–22:00, а в статической таблице нет 15:00–16:00.
 */
export const STATIC_BELLS: Array<{ begin: string; end: string; pair: number; pairName: string }> = [
  { begin: "08:30", end: "09:15", pair: 1, pairName: "Первая пара" },
  { begin: "09:25", end: "10:10", pair: 1, pairName: "Первая пара" },
  { begin: "10:20", end: "11:05", pair: 2, pairName: "Вторая пара" },
  { begin: "11:15", end: "12:00", pair: 2, pairName: "Вторая пара" },
  { begin: "12:30", end: "13:15", pair: 3, pairName: "Третья пара" },
  { begin: "13:25", end: "14:10", pair: 3, pairName: "Третья пара" },
  { begin: "15:00", end: "16:00", pair: 0, pairName: "Факультативы" },
  { begin: "16:00", end: "16:40", pair: 4, pairName: "Четвёртая пара" },
  { begin: "16:50", end: "17:30", pair: 4, pairName: "Четвёртая пара" },
  { begin: "18:00", end: "18:40", pair: 5, pairName: "Пятая пара" },
  { begin: "18:50", end: "19:30", pair: 5, pairName: "Пятая пара" },
  { begin: "20:30", end: "21:10", pair: 6, pairName: "Шестая пара" },
  { begin: "21:20", end: "22:00", pair: 6, pairName: "Шестая пара" },
];

/** Справочник полезной информации (разделы 2 и 3.8 анализа) */
export const SCHOOL_INFO = {
  school: {
    name: "СУНЦ НГУ — Специализированный учебно-научный центр НГУ (ФМШ)",
    address: "630090, г. Новосибирск, ул. Пирогова, здание 4 (Академгородок)",
    site: "https://sesc.nsu.ru",
    email: "sesc@nsu.ru",
  },
  contacts: [
    { title: "Приёмная комиссия", phone: "+7 (383) 373-96-65", email: null, note: "Вопросы поступления в ФМШ" },
    { title: "Общий телефон (приёмная)", phone: "+7 (383) 373-96-41", email: "sesc@nsu.ru", note: null },
    { title: "Пресс-служба (для СМИ)", phone: null, email: "press-sesc@nsu.ru", note: null },
    { title: "Столовая СУНЦ НГУ", phone: "+7 (383) 363-43-97", email: "t.silanteva@nsu.ru", note: "ул. Пирогова, 11/2" },
    { title: "Техподдержка расписания НГУ", phone: "+7 (383) 363-40-06", email: "support@nsu.ru", note: "Вопросы по table-sesc.nsu.ru" },
    { title: "Психолого-педагогическая служба", phone: "+7 (383) 363-41-52", email: null, note: "Каб. 106 и 111" },
  ],
  links: [
    { title: "Официальный сайт СУНЦ НГУ", url: "https://sesc.nsu.ru", note: "Новости, документы, поступление" },
    { title: "Организация питания (меню)", url: "https://sesc.nsu.ru/sveden/catering", note: "Ежедневные PDF-меню столовой" },
    { title: "Расписание занятий (ФМШ)", url: "https://table-sesc.nsu.ru", note: "Классы, преподаватели, аудитории" },
    { title: "Календарь мероприятий школы", url: "https://docs.google.com/spreadsheets/d/1t8CeC4UvOJrNgXI48fKju1q4iEXJ7bAF/edit?gid=718067972#gid=718067972", note: "Google-таблица: ЕГЭ/ОГЭ, события классов" },
    { title: "Академический календарь", url: "https://sesc.nsu.ru/education/academic-calendar", note: "Звонки, сессии, аттестации" },
    { title: "Официальная группа ВКонтакте", url: "https://vk.com/sescnsu", note: "Оперативные объявления" },
    { title: "Новости школы", url: "https://sesc.nsu.ru/media/news/", note: null },
    { title: "Часто задаваемые вопросы", url: "https://sesc.nsu.ru/faq", note: "Поступление, проживание, питание" },
    { title: "Проживание (интернат)", url: "https://sesc.nsu.ru/school/accommodation", note: "Общежития №1 и №2" },
    { title: "Сайт НГУ", url: "https://www.nsu.ru", note: null },
  ],
  adminSchedule:
    "Администрация: пн–чт 8:30–17:45, пт 8:30–16:30, обед 13:00–14:00. Вход в общежития с 20:00 до 8:00 — через 1-е общежитие.",
  notes: [
    "Питание обучающихся — шестиразовое: завтрак, обед, полдник, ужин, второй ужин.",
    "В общежитиях круглосуточное дежурство воспитателей с обходами; ночью вход через 1-е общежитие.",
    "График дежурств классов и ночных вожатых публикуется на стендах школы; в этот агрегатор его вносит администратор.",
    "Каждый месяц подводится текущая аттестация (месячный балл); по окончании семестра — сессия.",
  ],
} as const;

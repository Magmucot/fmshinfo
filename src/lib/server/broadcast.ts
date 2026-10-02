/**
 * Сервис рассылок Telegram-сообщений «СУНЦ Инфо».
 * Обеспечивает безопасную пакетную отправку с задержкой 35-50 мс,
 * сбор аудитории из базы данных (db.telegramUser) и users.json,
 * обработку блокировок бота и сохранение истории рассылок.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import crypto from "crypto";
import { db } from "../db";
import { portalLogger, formatNskTimestamp } from "./logger";
import { BroadcastPayload } from "./payloads";

export interface BroadcastRecipient {
  id: string;
  className?: string | null;
  username?: string | null;
  firstName?: string | null;
}

export interface BroadcastHistoryEntry {
  id: string;
  timestamp: string;
  timestampNsk: string;
  target: "all" | "class" | "user";
  targetClass?: string | null;
  targetUserId?: string | null;
  text: string;
  pinMessage: boolean;
  parseMode: string;
  sent: number;
  failed: number;
  blocked: number;
  total: number;
  status: "completed" | "partial" | "failed";
}

export interface BroadcastResult {
  ok: boolean;
  broadcastId: string;
  sent: number;
  failed: number;
  blocked: number;
  total: number;
  timestamp: string;
  status: "completed" | "partial" | "failed";
  error?: string;
}

export interface AudienceStats {
  totalUsers: number;
  withClassCount: number;
  byClass: Record<string, number>;
  byGrade: Record<string, number>;
  topClasses: Array<{ className: string; count: number }>;
}

const DATA_DIR = join(process.cwd(), "data");
const BROADCASTS_FILE = join(DATA_DIR, "broadcasts.json");
const BOT_DATA_DIR = join(process.cwd(), "mini-services/tg-bot");
const BOT_USERS_FILE = join(BOT_DATA_DIR, "users.json");
const BOT_CLASSES_FILE = join(BOT_DATA_DIR, "user_classes.json");

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
}

/** Получение токена Telegram-бота из env или файла конфигурации */
export function getTelegramBotToken(): string {
  if (process.env.TELEGRAM_BOT_TOKEN?.trim()) {
    return process.env.TELEGRAM_BOT_TOKEN.trim();
  }
  const botEnvPath = join(BOT_DATA_DIR, ".env");
  if (existsSync(botEnvPath)) {
    try {
      const content = readFileSync(botEnvPath, "utf-8");
      for (const line of content.split("\n")) {
        const match = line.match(/^\s*TELEGRAM_BOT_TOKEN\s*=\s*(.*)?\s*$/);
        if (match && match[1]) {
          const val = match[1].replace(/^["']|["']$/g, "").trim();
          if (val) return val;
        }
      }
    } catch {}
  }
  return "";
}

/** Чтение истории рассылок */
export function getBroadcastHistory(limit = 50): BroadcastHistoryEntry[] {
  try {
    let filePath = BROADCASTS_FILE;
    if (!existsSync(filePath)) {
      const fallback = join(BOT_DATA_DIR, "broadcasts.json");
      if (existsSync(fallback)) filePath = fallback;
      else return [];
    }
    const content = readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed)) {
      return parsed.slice(0, limit);
    }
  } catch (e) {
    portalLogger.error("BROADCAST", "Ошибка чтения истории рассылок", e);
  }
  return [];
}

/** Сохранение записи в историю рассылок */
export function saveBroadcastHistoryEntry(entry: BroadcastHistoryEntry): void {
  try {
    ensureDataDir();
    const current = getBroadcastHistory(100);
    current.unshift(entry);
    const trimmed = current.slice(0, 100);
    const jsonStr = JSON.stringify(trimmed, null, 2);

    writeFileSync(BROADCASTS_FILE, jsonStr, { encoding: "utf-8" });

    // Дублируем в папку бота для консистентности
    if (existsSync(BOT_DATA_DIR)) {
      try {
        writeFileSync(join(BOT_DATA_DIR, "broadcasts.json"), jsonStr, { encoding: "utf-8" });
      } catch {}
    }
  } catch (e) {
    portalLogger.error("BROADCAST", "Ошибка сохранения истории рассылок", e);
  }
}

/**
 * Получение объединённого списка пользователей из базы данных (Prisma)
 * и локальных файлов бота (users.json, user_classes.json) без дубликатов.
 */
export async function getAllKnownUsers(): Promise<Map<string, BroadcastRecipient>> {
  const usersMap = new Map<string, BroadcastRecipient>();

  // 1. Из базы данных Prisma
  try {
    const dbUsers = await db.telegramUser.findMany({
      select: {
        id: true,
        className: true,
        username: true,
        firstName: true,
      },
    });
    for (const u of dbUsers) {
      if (u.id && /^\d+$/.test(u.id)) {
        usersMap.set(u.id, {
          id: u.id,
          className: u.className ?? null,
          username: u.username ?? null,
          firstName: u.firstName ?? null,
        });
      }
    }
  } catch (e) {
    portalLogger.warn("BROADCAST", `Ошибка запроса db.telegramUser: ${(e as Error).message}`);
  }

  // 2. Из mini-services/tg-bot/users.json
  try {
    if (existsSync(BOT_USERS_FILE)) {
      const content = readFileSync(BOT_USERS_FILE, "utf-8");
      const botUsers = JSON.parse(content);
      for (const [k, u] of Object.entries<any>(botUsers)) {
        const strId = String(u?.id || k);
        if (/^\d+$/.test(strId)) {
          const existing = usersMap.get(strId);
          usersMap.set(strId, {
            id: strId,
            className: u?.className || existing?.className || null,
            username: u?.username || existing?.username || null,
            firstName: u?.firstName || existing?.firstName || null,
          });
        }
      }
    }
  } catch {}

  // 3. Из mini-services/tg-bot/user_classes.json (legacy)
  try {
    if (existsSync(BOT_CLASSES_FILE)) {
      const content = readFileSync(BOT_CLASSES_FILE, "utf-8");
      const classesData = JSON.parse(content);
      for (const [k, v] of Object.entries<any>(classesData)) {
        const strId = String(k);
        if (/^\d+$/.test(strId) && typeof v === "string") {
          const existing = usersMap.get(strId);
          if (existing) {
            if (!existing.className) existing.className = v;
          } else {
            usersMap.set(strId, {
              id: strId,
              className: v,
            });
          }
        }
      }
    }
  } catch {}

  return usersMap;
}

/**
 * Получение статистики доступной аудитории
 */
export async function getBroadcastAudienceStats(): Promise<AudienceStats> {
  const usersMap = await getAllKnownUsers();
  const byClass: Record<string, number> = {};
  const byGrade: Record<string, number> = { "8": 0, "9": 0, "10": 0, "11": 0 };
  let withClassCount = 0;

  for (const user of usersMap.values()) {
    if (user.className) {
      withClassCount++;
      byClass[user.className] = (byClass[user.className] ?? 0) + 1;
      const grade = user.className.split("-")[0];
      if (grade && byGrade[grade] !== undefined) {
        byGrade[grade] = (byGrade[grade] ?? 0) + 1;
      }
    }
  }

  const topClasses = Object.entries(byClass)
    .map(([className, count]) => ({ className, count }))
    .sort((a, b) => b.count - a.count);

  return {
    totalUsers: usersMap.size,
    withClassCount,
    byClass,
    byGrade,
    topClasses,
  };
}

/**
 * Выбор целевой аудитории для конкретной рассылки
 */
export async function getTargetRecipients(
  target: "all" | "class" | "user",
  targetClass?: string | null,
  targetUserId?: string | null
): Promise<BroadcastRecipient[]> {
  const allUsers = await getAllKnownUsers();

  if (target === "user") {
    if (!targetUserId) return [];
    const cleanId = String(targetUserId).trim();
    const existing = allUsers.get(cleanId);
    if (existing) return [existing];
    // Если пользователя нет в кэше, но ID валидный Telegram ID - добавляем
    if (/^\d+$/.test(cleanId)) {
      return [{ id: cleanId }];
    }
    return [];
  }

  if (target === "class") {
    if (!targetClass) return [];
    const cleanClass = targetClass.trim();
    const result: BroadcastRecipient[] = [];
    for (const u of allUsers.values()) {
      if (u.className === cleanClass) {
        result.push(u);
      }
    }
    return result;
  }

  // target === "all"
  return Array.from(allUsers.values());
}

export type TelegramSenderFn = (
  chatId: string,
  text: string,
  parseMode: string,
  pin: boolean
) => Promise<{ ok: boolean; blocked?: boolean; messageId?: number; error?: string }>;

/** Отправка одного сообщения через Telegram Bot API */
async function defaultSendTelegramMessage(
  token: string,
  chatId: string,
  text: string,
  parseMode: string,
  pin: boolean
): Promise<{ ok: boolean; blocked?: boolean; messageId?: number; error?: string }> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: parseMode,
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(10000),
    });

    const data: any = await res.json().catch(() => ({}));

    if (!res.ok || !data.ok) {
      const errDesc = String(data?.description || `HTTP ${res.status}`);
      const isBlocked =
        res.status === 403 ||
        /bot was blocked|user is deactivated|chat not found|bot can't initiate/i.test(errDesc);
      return { ok: false, blocked: isBlocked, error: errDesc };
    }

    const messageId = data.result?.message_id;

    if (pin && messageId) {
      try {
        await fetch(`https://api.telegram.org/bot${token}/pinChatMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            message_id: messageId,
            disable_notification: true,
          }),
          signal: AbortSignal.timeout(5000),
        });
      } catch (pinErr) {
        // Ошибка закрепления не отменяет успешную отправку
        portalLogger.warn("BROADCAST", `Не удалось закрепить сообщение у ${chatId}: ${(pinErr as Error).message}`);
      }
    }

    return { ok: true, messageId };
  } catch (err) {
    return { ok: false, blocked: false, error: (err as Error).message };
  }
}

/**
 * Исполнение рассылки с пакетной отправкой (35-50 мс задержка).
 */
export async function executeBroadcast(
  payload: BroadcastPayload,
  options?: {
    senderFn?: TelegramSenderFn;
    delayMs?: number;
  }
): Promise<BroadcastResult> {
  const broadcastId = crypto.randomUUID();
  const now = new Date();
  const timestamp = now.toISOString();
  const timestampNsk = formatNskTimestamp(now);

  const recipients = await getTargetRecipients(
    payload.target,
    payload.targetClass,
    payload.targetUserId
  );

  const total = recipients.length;
  const parseMode = payload.parseMode ?? "HTML";
  const pinMessage = Boolean(payload.pinMessage);
  const delayMs = Math.max(35, options?.delayMs ?? 40);

  if (total === 0) {
    const emptyResult: BroadcastResult = {
      ok: true,
      broadcastId,
      sent: 0,
      failed: 0,
      blocked: 0,
      total: 0,
      timestamp,
      status: "completed",
    };
    saveBroadcastHistoryEntry({
      id: broadcastId,
      timestamp,
      timestampNsk,
      target: payload.target,
      targetClass: payload.targetClass,
      targetUserId: payload.targetUserId,
      text: payload.text,
      pinMessage,
      parseMode,
      sent: 0,
      failed: 0,
      blocked: 0,
      total: 0,
      status: "completed",
    });
    return emptyResult;
  }

  const token = getTelegramBotToken();
  const senderFn = options?.senderFn ?? (async (chatId, text, pMode, pin) => {
    if (!token) {
      return { ok: false, blocked: false, error: "TELEGRAM_BOT_TOKEN не настроен" };
    }
    return defaultSendTelegramMessage(token, chatId, text, pMode, pin);
  });

  portalLogger.audit(
    "BROADCAST_START",
    `Broadcast ${broadcastId} started: target=${payload.target} (class=${payload.targetClass ?? "none"}, user=${payload.targetUserId ?? "none"}), recipients=${total}, pin=${pinMessage}`
  );

  let sent = 0;
  let failed = 0;
  let blocked = 0;

  for (let i = 0; i < recipients.length; i++) {
    const user = recipients[i];
    try {
      const sendRes = await senderFn(user.id, payload.text, parseMode, pinMessage);
      if (sendRes.ok) {
        sent++;
      } else {
        failed++;
        if (sendRes.blocked) {
          blocked++;
          portalLogger.warn(
            "BROADCAST",
            `User ${user.id} (@${user.username || "no_user"}) blocked the bot or chat unavailable`
          );
        } else {
          portalLogger.warn(
            "BROADCAST",
            `Send to ${user.id} failed: ${sendRes.error || "Unknown error"}`
          );
        }
      }
    } catch (e) {
      failed++;
      portalLogger.error("BROADCAST", `Exception sending to ${user.id}`, e);
    }

    // Задержка между отправками для соблюдения Telegram Rate Limits
    if (i < recipients.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  const status: "completed" | "partial" | "failed" =
    sent === total ? "completed" : sent > 0 ? "partial" : "failed";

  const result: BroadcastResult = {
    ok: true,
    broadcastId,
    sent,
    failed,
    blocked,
    total,
    timestamp,
    status,
  };

  saveBroadcastHistoryEntry({
    id: broadcastId,
    timestamp,
    timestampNsk,
    target: payload.target,
    targetClass: payload.targetClass,
    targetUserId: payload.targetUserId,
    text: payload.text,
    pinMessage,
    parseMode,
    sent,
    failed,
    blocked,
    total,
    status,
  });

  portalLogger.audit(
    "BROADCAST_END",
    `Broadcast ${broadcastId} finished: sent=${sent}, failed=${failed} (blocked=${blocked}), total=${total}, status=${status}`
  );

  return result;
}

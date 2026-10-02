import { appendFileSync, existsSync, mkdirSync } from "fs";
import { promises as fs } from "fs";
import { join } from "path";

// Логи пишутся в центральную папку проекта /logs/bot.log
const LOGS_DIR = process.env.BOT_LOG_DIR ?? join(__dirname, "../../logs");
const BOT_LOG_FILE = join(LOGS_DIR, "bot.log");
const AUDIT_LOG_FILE = join(LOGS_DIR, "audit.log");
const MAX_LOG_SIZE_BYTES = 10 * 1024 * 1024; // 10 МБ
const BUFFER_FLUSH_INTERVAL_MS = 1000; // 1 секунда
const BUFFER_MAX_BYTES = 16 * 1024; // 16 КБ
const ROTATION_CHECK_INTERVAL_MS = 10 * 60 * 1000; // 10 минут

export type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR" | "AUDIT";

let logsDirReady = false;

async function ensureLogsDirAsync() {
  if (logsDirReady) return;
  try {
    await fs.mkdir(LOGS_DIR, { recursive: true });
    logsDirReady = true;
  } catch (e) {
    console.error("[tg-logger] Ошибка создания папки логов:", e);
  }
}

function ensureLogsDirSync() {
  if (logsDirReady) return;
  try {
    if (!existsSync(LOGS_DIR)) {
      mkdirSync(LOGS_DIR, { recursive: true });
    }
    logsDirReady = true;
  } catch (e) {
    console.error("[tg-logger] Ошибка синхронного создания папки логов:", e);
  }
}

/** Время по Новосибирску (UTC+7) */
export function formatNskTimestamp(date = new Date()): string {
  const nsk = new Date(date.getTime() + 7 * 3600 * 1000);
  const y = nsk.getUTCFullYear();
  const m = String(nsk.getUTCMonth() + 1).padStart(2, "0");
  const d = String(nsk.getUTCDate()).padStart(2, "0");
  const h = String(nsk.getUTCHours()).padStart(2, "0");
  const min = String(nsk.getUTCMinutes()).padStart(2, "0");
  const s = String(nsk.getUTCSeconds()).padStart(2, "0");
  const ms = String(nsk.getUTCMilliseconds()).padStart(3, "0");
  return `${y}-${m}-${d} ${h}:${min}:${s}.${ms} NSK`;
}

// In-memory буферы для логов
let botBuffer: string[] = [];
let auditBuffer: string[] = [];
let bufferedBytes = 0;
let isFlushing = false;
let flushPromise: Promise<void> | null = null;

async function rotateFileIfNeededAsync(filePath: string) {
  try {
    const stat = await fs.stat(filePath);
    if (stat.size >= MAX_LOG_SIZE_BYTES) {
      const backupPath1 = `${filePath}.1`;
      const backupPath2 = `${filePath}.2`;
      try {
        await fs.stat(backupPath1);
        await fs.rename(backupPath1, backupPath2);
      } catch {
        // backupPath1 doesn't exist yet, that's expected
      }
      await fs.rename(filePath, backupPath1);
    }
  } catch {
    // filePath doesn't exist yet or cannot be read, ignore
  }
}

async function checkRotationAsync() {
  // Перед ротацией дожидаемся завершения сброса буфера
  await flushBufferedLogs();
  await rotateFileIfNeededAsync(BOT_LOG_FILE);
  await rotateFileIfNeededAsync(AUDIT_LOG_FILE);
}

// Запуск фонового таймера ротации (раз в 10 минут)
const rotationTimer = setInterval(() => {
  void checkRotationAsync();
}, ROTATION_CHECK_INTERVAL_MS);
rotationTimer.unref();

async function flushBufferedLogs(): Promise<void> {
  while (isFlushing) {
    if (flushPromise) {
      await flushPromise;
    } else {
      break;
    }
  }

  if (botBuffer.length === 0 && auditBuffer.length === 0) {
    return;
  }

  isFlushing = true;
  const currentBotLines = botBuffer;
  const currentAuditLines = auditBuffer;
  botBuffer = [];
  auditBuffer = [];
  bufferedBytes = 0;

  flushPromise = (async () => {
    try {
      await ensureLogsDirAsync();
      const writes: Promise<void>[] = [];
      if (currentBotLines.length > 0) {
        writes.push(fs.appendFile(BOT_LOG_FILE, currentBotLines.join("\n") + "\n", "utf-8"));
      }
      if (currentAuditLines.length > 0) {
        writes.push(fs.appendFile(AUDIT_LOG_FILE, currentAuditLines.join("\n") + "\n", "utf-8"));
      }
      await Promise.all(writes);
    } catch (e) {
      console.error("[tg-logger] Ошибка асинхронной записи в файл:", e);
    } finally {
      isFlushing = false;
      flushPromise = null;
      if (bufferedBytes >= BUFFER_MAX_BYTES) {
        void flushBufferedLogs();
      }
    }
  })();

  await flushPromise;
}

// Запуск фонового таймера периодического сброса (раз в 1 секунду)
const flushTimer = setInterval(() => {
  if (botBuffer.length > 0 || auditBuffer.length > 0) {
    void flushBufferedLogs();
  }
}, BUFFER_FLUSH_INTERVAL_MS);
flushTimer.unref();

function emergencySyncFlush() {
  try {
    if (botBuffer.length > 0) {
      ensureLogsDirSync();
      appendFileSync(BOT_LOG_FILE, botBuffer.join("\n") + "\n", "utf-8");
      botBuffer = [];
    }
    if (auditBuffer.length > 0) {
      ensureLogsDirSync();
      appendFileSync(AUDIT_LOG_FILE, auditBuffer.join("\n") + "\n", "utf-8");
      auditBuffer = [];
    }
    bufferedBytes = 0;
  } catch {
    // Ignore errors during synchronous exit
  }
}

// Регистрация хуков завершения процесса
process.on("beforeExit", () => {
  void flushBufferedLogs();
});

process.on("exit", () => {
  emergencySyncFlush();
});

function bufferLine(targetFile: string, line: string) {
  const lineBytes = Buffer.byteLength(line, "utf-8") + 1;
  bufferedBytes += lineBytes;

  if (targetFile === BOT_LOG_FILE) {
    botBuffer.push(line);
  } else if (targetFile === AUDIT_LOG_FILE) {
    auditBuffer.push(line);
  }

  if (bufferedBytes >= BUFFER_MAX_BYTES) {
    void flushBufferedLogs();
  }
}

export class BotLogger {
  private log(level: LogLevel, category: string, message: string, meta?: unknown) {
    const timestamp = formatNskTimestamp();
    const metaStr =
      meta !== undefined
        ? typeof meta === "object"
          ? " " + JSON.stringify(meta)
          : " " + String(meta)
        : "";
    const logLine = `[${timestamp}] [${level}] [${category}] ${message}${metaStr}`;

    bufferLine(BOT_LOG_FILE, logLine);
    if (level === "AUDIT") {
      bufferLine(AUDIT_LOG_FILE, logLine);
    }

    const color =
      level === "ERROR"
        ? "\x1b[31m"
        : level === "WARN"
        ? "\x1b[33m"
        : level === "AUDIT"
        ? "\x1b[35m"
        : level === "DEBUG"
        ? "\x1b[90m"
        : "\x1b[32m";
    const reset = "\x1b[0m";

    console.log(`${color}[${timestamp}] [${level}] [${category}]${reset} ${message}${metaStr}`);
  }

  info(category: string, message: string, meta?: Record<string, unknown> | unknown) {
    this.log("INFO", category, message, meta);
  }

  warn(category: string, message: string, meta?: Record<string, unknown> | unknown) {
    this.log("WARN", category, message, meta);
  }

  error(category: string, message: string, error?: unknown, meta?: Record<string, unknown>) {
    const errObj =
      error instanceof Error ? { message: error.message, stack: error.stack } : error;
    const combinedMeta = meta ? { error: errObj, ...meta } : errObj;
    this.log("ERROR", category, message, combinedMeta);
  }

  debug(category: string, message: string, meta?: unknown) {
    this.log("DEBUG", category, message, meta);
  }

  audit(category: string, message: string, meta?: unknown): void;
  audit(action: string, actor: { id: number; username?: string }, details?: Record<string, unknown>): void;
  audit(actionOrCat: string, actorOrMsg: unknown, details?: unknown): void {
    if (typeof actorOrMsg === "string") {
      this.log("AUDIT", actionOrCat, actorOrMsg, details);
    } else {
      const actor = actorOrMsg as { id?: number; username?: string } | undefined;
      const actorStr = actor ? `User ${actor.id ?? "unknown"} (@${actor.username ?? "no_username"})` : "Unknown actor";
      this.log("AUDIT", actionOrCat, `${actorStr} -> ${actionOrCat}`, details);
    }
  }

  /** Аудит команды от пользователя */
  command(ctx: { from?: { id: number; username?: string }; message?: { text?: string } }, commandName: string): void;
  command(
    userId: number | string,
    username: string | null | undefined,
    cmd: string,
    className?: string | null,
    durationMs?: number
  ): void;
  command(
    ctxOrUserId: { from?: { id: number; username?: string }; message?: { text?: string } } | number | string,
    commandNameOrUsername?: string | null,
    cmd?: string,
    className?: string | null,
    durationMs?: number
  ): void {
    if (typeof ctxOrUserId === "object" && ctxOrUserId !== null) {
      const ctx = ctxOrUserId;
      const uId = ctx.from?.id ?? "unknown";
      const uName = ctx.from?.username ? `@${ctx.from.username}` : "no_username";
      const cmdName = commandNameOrUsername ?? ctx.message?.text ?? "unknown_cmd";
      this.audit("CMD", `User ${uId} (${uName}) -> ${cmdName}`);
    } else {
      const userId = ctxOrUserId;
      const username = commandNameOrUsername;
      const uStr = username ? `@${username}` : "no_username";
      const cStr = className ? `[${className}]` : "[no_class]";
      const durStr = durationMs !== undefined ? ` (${durationMs}ms)` : "";
      this.audit("CMD", `User ${userId} (${uStr}, ${cStr}) -> ${cmd ?? ""}${durStr}`);
    }
  }

  /** Аудит нажатия inline-кнопки */
  callback(ctx: { from?: { id: number; username?: string } }, callbackData: string): void;
  callback(
    userId: number | string,
    username: string | null | undefined,
    data: string,
    className?: string | null,
    durationMs?: number
  ): void;
  callback(
    ctxOrUserId: { from?: { id: number; username?: string } } | number | string,
    dataOrUsername?: string | null,
    data?: string,
    className?: string | null,
    durationMs?: number
  ): void {
    if (typeof ctxOrUserId === "object" && ctxOrUserId !== null) {
      const ctx = ctxOrUserId;
      const uId = ctx.from?.id ?? "unknown";
      const uName = ctx.from?.username ? `@${ctx.from.username}` : "no_username";
      this.audit("CALLBACK", `User ${uId} (${uName}) -> ${dataOrUsername ?? ""}`);
    } else {
      const userId = ctxOrUserId;
      const username = dataOrUsername;
      const uStr = username ? `@${username}` : "no_username";
      const cStr = className ? `[${className}]` : "[no_class]";
      const durStr = durationMs !== undefined ? ` (${durationMs}ms)` : "";
      this.audit("CALLBACK", `User ${userId} (${uStr}, ${cStr}) -> ${data ?? ""}${durStr}`);
    }
  }

  /** Аудит смены класса */
  setclass(userId: number, className: string, username?: string): void;
  setclass(
    userId: number | string,
    username: string | null | undefined,
    oldClass: string | null | undefined,
    newClass: string
  ): void;
  setclass(
    userId: number | string,
    classNameOrUsername?: string | null,
    oldClassOrUsername?: string | null,
    newClass?: string
  ): void {
    if (newClass !== undefined) {
      const username = classNameOrUsername;
      const oldClass = oldClassOrUsername;
      const uStr = username ? `@${username}` : "no_username";
      this.audit(
        "SETCLASS",
        `User ${userId} (${uStr}) changed class: [${oldClass ?? "none"}] -> [${newClass}]`
      );
    } else {
      const className = classNameOrUsername ?? "none";
      const username = oldClassOrUsername;
      const uStr = username ? `@${username}` : "no_username";
      this.audit("SETCLASS", `User ${userId} (${uStr}) changed class -> [${className}]`);
    }
  }

  /** Лог API-запроса к порталу */
  api(path: string, durationMs: number, status: number): void;
  api(endpoint: string, status: number, durationMs: number): void;
  api(endpoint: string, arg2: number, arg3: number): void {
    let status: number;
    let durationMs: number;
    if (arg2 >= 100 && arg2 <= 599 && arg3 >= 0) {
      status = arg2;
      durationMs = arg3;
    } else {
      durationMs = arg2;
      status = arg3;
    }
    this.debug("API", `${endpoint} -> ${status} (${durationMs}ms)`);
  }

  /** Сброс буферов на диск */
  flush(): Promise<void> {
    return flushBufferedLogs();
  }

  /** Остановка фоновых таймеров и сброс логов */
  close(): Promise<void> {
    clearInterval(flushTimer);
    clearInterval(rotationTimer);
    return this.flush();
  }
}

export const botLogger = new BotLogger();

/** Асинхронный сброс логов */
export function flushBotLogs(): Promise<void> {
  return botLogger.flush();
}

/** Чтение последних строк лога для команды /logs в боте (асинхронно, с учетом in-memory буфера) */
export async function getRecentBotLogs(limit = 25): Promise<string[]> {
  try {
    let fileContent = "";
    try {
      fileContent = await fs.readFile(BOT_LOG_FILE, "utf-8");
    } catch {
      // Файл логов еще не существует
    }
    const fileLines = fileContent.split("\n").filter(Boolean);
    const memoryLines = [...botBuffer];
    const allLines = [...fileLines, ...memoryLines];
    if (allLines.length === 0) return ["Файл логов пока пуст."];
    return allLines.slice(-limit);
  } catch (e) {
    return [`Ошибка чтения логов: ${(e as Error).message}`];
  }
}

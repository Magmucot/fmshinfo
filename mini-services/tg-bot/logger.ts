import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, statSync } from "fs";
import { join } from "path";

// Логи пишутся в центральную папку проекта /logs/bot.log
const LOGS_DIR = join(__dirname, "../../logs");
const BOT_LOG_FILE = join(LOGS_DIR, "bot.log");
const AUDIT_LOG_FILE = join(LOGS_DIR, "audit.log");
const MAX_LOG_SIZE_BYTES = 10 * 1024 * 1024; // 10 МБ

export type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR" | "AUDIT";

function ensureLogsDir() {
  if (!existsSync(LOGS_DIR)) {
    mkdirSync(LOGS_DIR, { recursive: true });
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

function rotateIfNeeded(filePath: string) {
  try {
    if (existsSync(filePath)) {
      const stat = statSync(filePath);
      if (stat.size >= MAX_LOG_SIZE_BYTES) {
        const backupPath = `${filePath}.1`;
        if (existsSync(backupPath)) {
          renameSync(backupPath, `${filePath}.2`);
        }
        renameSync(filePath, backupPath);
      }
    }
  } catch (e) {
    console.error("[tg-logger] Ошибка ротации логов:", e);
  }
}

function writeLine(targetFile: string, line: string) {
  try {
    ensureLogsDir();
    rotateIfNeeded(targetFile);
    appendFileSync(targetFile, line + "\n", "utf-8");
  } catch (e) {
    console.error("[tg-logger] Ошибка записи в файл:", e);
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

    writeLine(BOT_LOG_FILE, logLine);
    if (level === "AUDIT") {
      writeLine(AUDIT_LOG_FILE, logLine);
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

  info(category: string, message: string, meta?: unknown) {
    this.log("INFO", category, message, meta);
  }

  warn(category: string, message: string, meta?: unknown) {
    this.log("WARN", category, message, meta);
  }

  error(category: string, message: string, error?: unknown) {
    const errObj =
      error instanceof Error ? { message: error.message, stack: error.stack } : error;
    this.log("ERROR", category, message, errObj);
  }

  debug(category: string, message: string, meta?: unknown) {
    this.log("DEBUG", category, message, meta);
  }

  audit(category: string, message: string, meta?: unknown) {
    this.log("AUDIT", category, message, meta);
  }

  /** Аудит команды от пользователя */
  command(
    userId: number | string,
    username: string | null | undefined,
    cmd: string,
    className: string | null | undefined,
    durationMs?: number
  ) {
    const uStr = username ? `@${username}` : "no_username";
    const cStr = className ? `[${className}]` : "[no_class]";
    const durStr = durationMs !== undefined ? ` (${durationMs}ms)` : "";
    this.audit("CMD", `User ${userId} (${uStr}, ${cStr}) -> ${cmd}${durStr}`);
  }

  /** Аудит нажатия inline-кнопки */
  callback(
    userId: number | string,
    username: string | null | undefined,
    data: string,
    className: string | null | undefined,
    durationMs?: number
  ) {
    const uStr = username ? `@${username}` : "no_username";
    const cStr = className ? `[${className}]` : "[no_class]";
    const durStr = durationMs !== undefined ? ` (${durationMs}ms)` : "";
    this.audit("CALLBACK", `User ${userId} (${uStr}, ${cStr}) -> ${data}${durStr}`);
  }

  /** Аудит смены класса */
  setclass(
    userId: number | string,
    username: string | null | undefined,
    oldClass: string | null | undefined,
    newClass: string
  ) {
    const uStr = username ? `@${username}` : "no_username";
    this.audit(
      "SETCLASS",
      `User ${userId} (${uStr}) changed class: [${oldClass ?? "none"}] -> [${newClass}]`
    );
  }

  /** Лог API-запроса к порталу */
  api(endpoint: string, status: number, durationMs: number) {
    this.debug("API", `${endpoint} -> ${status} (${durationMs}ms)`);
  }
}

export const botLogger = new BotLogger();

/** Чтение последних строк лога для команды /logs в боте */
export function getRecentBotLogs(limit = 25): string[] {
  try {
    if (!existsSync(BOT_LOG_FILE)) return ["Файл логов пока пуст."];
    const content = readFileSync(BOT_LOG_FILE, "utf-8");
    const lines = content.split("\n").filter(Boolean);
    return lines.slice(-limit);
  } catch (e) {
    return [`Ошибка чтения логов: ${(e as Error).message}`];
  }
}

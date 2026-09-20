import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, statSync } from "fs";
import { join } from "path";

const LOGS_DIR = join(process.cwd(), "logs");
const MAX_LOG_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

export type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR" | "AUDIT";

function ensureLogsDir() {
  if (!existsSync(LOGS_DIR)) {
    mkdirSync(LOGS_DIR, { recursive: true });
  }
}

/** Форматирование времени по Новосибирску (UTC+7) */
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

/** Ротация файла логов при превышении 10 МБ */
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
    console.error("[logger] Ошибка ротации лога:", e);
  }
}

/** Запись форматированной строки в лог-файл */
export function writeToLogFile(fileName: string, line: string) {
  try {
    ensureLogsDir();
    const filePath = join(LOGS_DIR, fileName);
    rotateIfNeeded(filePath);
    appendFileSync(filePath, line + "\n", "utf-8");
  } catch (e) {
    console.error(`[logger] Ошибка записи в ${fileName}:`, e);
  }
}

export class Logger {
  private logFileName: string;

  constructor(logFileName = "portal.log") {
    this.logFileName = logFileName;
  }

  private log(level: LogLevel, category: string, message: string, meta?: unknown) {
    const timestamp = formatNskTimestamp();
    const metaStr = meta !== undefined ? (typeof meta === "object" ? " " + JSON.stringify(meta) : " " + String(meta)) : "";
    const logLine = `[${timestamp}] [${level}] [${category}] ${message}${metaStr}`;

    // Запись в файл
    writeToLogFile(this.logFileName, logLine);

    // Дополнительно в audit.log, если уровень AUDIT
    if (level === "AUDIT") {
      writeToLogFile("audit.log", logLine);
    }

    // Вывод в консоль с цветовым акцентом
    const color =
      level === "ERROR"
        ? "\x1b[31m"
        : level === "WARN"
        ? "\x1b[33m"
        : level === "AUDIT"
        ? "\x1b[35m"
        : level === "DEBUG"
        ? "\x1b[90m"
        : "\x1b[36m";
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
    const errDetails =
      error instanceof Error ? { message: error.message, stack: error.stack } : error;
    this.log("ERROR", category, message, errDetails);
  }

  audit(category: string, message: string, meta?: unknown) {
    this.log("AUDIT", category, message, meta);
  }

  debug(category: string, message: string, meta?: unknown) {
    this.log("DEBUG", category, message, meta);
  }
}

export const portalLogger = new Logger("portal.log");
export const botLogger = new Logger("bot.log");

export interface ParsedLogEntry {
  raw: string;
  timestamp: string;
  level: string;
  category: string;
  message: string;
  userId?: string;
  username?: string;
}

/** Чтение последних строк лог-файла для админ-панели */
export function getRecentLogs(
  fileName: "bot.log" | "portal.log" | "audit.log" = "bot.log",
  limit = 100,
  filterLevel?: string,
  search?: string
): { lines: string[]; parsed: ParsedLogEntry[]; totalLines: number; fileName: string } {
  try {
    ensureLogsDir();
    const filePath = join(LOGS_DIR, fileName);
    if (!existsSync(filePath)) {
      return { lines: [], parsed: [], totalLines: 0, fileName };
    }

    const content = readFileSync(filePath, "utf-8");
    let lines = content.split("\n").filter(Boolean);

    if (filterLevel && filterLevel !== "ALL") {
      lines = lines.filter((l) => l.includes(`[${filterLevel}]`));
    }

    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      lines = lines.filter((l) => l.toLowerCase().includes(q));
    }

    const totalLines = lines.length;
    const sliced = lines.slice(-limit).reverse(); // последние строки первыми

    const parsed: ParsedLogEntry[] = sliced.map((raw) => {
      const match = raw.match(/^\[(.*?)\]\s+\[(.*?)\]\s+\[(.*?)\]\s*(.*)$/);
      let timestamp = "";
      let level = "INFO";
      let category = "GENERAL";
      let message = raw;
      if (match) {
        timestamp = match[1];
        level = match[2];
        category = match[3];
        message = match[4];
      }

      const userMatch = raw.match(/(?:User\s+|ID\s*[:=]\s*|\buser\s+)(\d{5,})/i);
      const userId = userMatch ? userMatch[1] : undefined;

      const usernameMatch = raw.match(/@([a-zA-Z0-9_]{3,32})/);
      const username = usernameMatch ? usernameMatch[1] : undefined;

      return {
        raw,
        timestamp,
        level,
        category,
        message,
        userId,
        username,
      };
    });

    return { lines: sliced, parsed, totalLines, fileName };
  } catch (e) {
    console.error("[logger] Ошибка чтения логов:", e);
    return { lines: [], parsed: [], totalLines: 0, fileName };
  }
}

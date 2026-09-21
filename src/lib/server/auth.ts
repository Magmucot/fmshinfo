import crypto from "crypto";

/** Extracts client IP address from standard proxy headers */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = request.headers.get("x-real-ip");
  if (realIp && realIp.trim()) return realIp.trim();
  const cfIp = request.headers.get("cf-connecting-ip");
  if (cfIp && cfIp.trim()) return cfIp.trim();
  return "127.0.0.1";
}

/** In-memory rate-limiter for failed admin attempts to prevent brute force attacks */
interface AttemptRecord {
  count: number;
  resetAt: number;
}
const failedAttempts = new Map<string, AttemptRecord>();
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_WINDOW_MS = 60 * 1000; // 1 minute

export function recordFailedAdminAttempt(ip: string): boolean {
  const now = Date.now();
  const rec = failedAttempts.get(ip);
  if (!rec || now > rec.resetAt) {
    failedAttempts.set(ip, { count: 1, resetAt: now + LOCKOUT_WINDOW_MS });
    return false;
  }
  rec.count += 1;
  return rec.count >= MAX_FAILED_ATTEMPTS;
}

export function isIpRateLimited(ip: string): boolean {
  const now = Date.now();
  const rec = failedAttempts.get(ip);
  if (!rec) return false;
  if (now > rec.resetAt) {
    failedAttempts.delete(ip);
    return false;
  }
  return rec.count >= MAX_FAILED_ATTEMPTS;
}

export function resetFailedAdminAttempts(ip: string): void {
  failedAttempts.delete(ip);
}

/** Constant-time comparison between two strings to prevent timing side-channel attacks */
export function constantTimeCompare(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    // Perform dummy timingSafeEqual to minimize execution time difference
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Privileged APIs require an explicitly configured key in a request header.
 * Supports X-Admin-Key or Authorization: Bearer <key>.
 * Query parameters are strictly ignored.
 */
export function isAdminRequest(request: Request): boolean {
  const expected = process.env.ADMIN_KEY;
  if (!expected || typeof expected !== "string" || expected.trim().length === 0) {
    return false;
  }

  // Check headers: X-Admin-Key or Authorization: Bearer
  let candidate = request.headers.get("x-admin-key");
  if (!candidate) {
    const auth = request.headers.get("authorization");
    if (auth && auth.startsWith("Bearer ")) {
      candidate = auth.slice(7).trim();
    }
  }

  if (!candidate || typeof candidate !== "string") {
    return false;
  }

  return constantTimeCompare(candidate, expected);
}

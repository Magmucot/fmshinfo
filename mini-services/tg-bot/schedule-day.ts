/** Telegram schedule buttons use Sunday=0 through Saturday=6. */
export function scheduleButtonDay(value: string, now = new Date()): number | null {
  if (value === "today") return new Date(now.getTime() + 7 * 3600_000).getUTCDay();
  return /^[0-6]$/.test(value) ? Number(value) : null;
}

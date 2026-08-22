/**
 * Minimal 5-field cron matcher (minute hour dom month dow).
 * Supports wildcards, commas, ranges (a-b), and steps (star/n or a-b/n).
 * Dow: 0-6 (Sunday=0). Dom/month: 1-based.
 */

export function parseCronExpression(expression: string): string[] {
  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 5) {
    throw new Error(
      `Invalid cron expression "${expression}". Expected 5 fields: minute hour day month weekday`,
    );
  }
  return parts;
}

export function cronMatches(expression: string, date: Date): boolean {
  const [minute, hour, dom, month, dow] = parseCronExpression(expression);
  return (
    fieldMatches(minute!, date.getMinutes(), 0, 59) &&
    fieldMatches(hour!, date.getHours(), 0, 23) &&
    fieldMatches(dom!, date.getDate(), 1, 31) &&
    fieldMatches(month!, date.getMonth() + 1, 1, 12) &&
    fieldMatches(dow!, date.getDay(), 0, 6)
  );
}

/** Next matching minute strictly after `from` (searches up to ~1 year). */
export function nextCronDate(expression: string, from: Date): Date | null {
  parseCronExpression(expression);
  const cursor = new Date(from);
  cursor.setSeconds(0, 0);
  cursor.setMinutes(cursor.getMinutes() + 1);

  const limit = 366 * 24 * 60;
  for (let i = 0; i < limit; i++) {
    if (cronMatches(expression, cursor)) {
      return new Date(cursor);
    }
    cursor.setMinutes(cursor.getMinutes() + 1);
  }
  return null;
}

function fieldMatches(
  field: string,
  value: number,
  min: number,
  max: number,
): boolean {
  if (field === "*") return true;

  for (const part of field.split(",")) {
    if (part.includes("/")) {
      const [range, stepStr] = part.split("/");
      const step = Number(stepStr);
      if (!Number.isFinite(step) || step <= 0) continue;
      const [start, end] = expandRange(range!, min, max);
      if (value >= start && value <= end && (value - start) % step === 0) {
        return true;
      }
      continue;
    }
    if (part.includes("-")) {
      const [start, end] = expandRange(part, min, max);
      if (value >= start && value <= end) return true;
      continue;
    }
    if (Number(part) === value) return true;
  }
  return false;
}

function expandRange(
  range: string,
  min: number,
  max: number,
): [number, number] {
  if (range === "*" || range === "") return [min, max];
  if (range.includes("-")) {
    const [a, b] = range.split("-").map(Number);
    return [a!, b!];
  }
  const n = Number(range);
  return [n, n];
}

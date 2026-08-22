import { describe, expect, test } from "bun:test";
import { cronMatches, nextCronDate, parseCronExpression } from "../src/cron.ts";

describe("cron", () => {
  test("parses 5 fields", () => {
    expect(parseCronExpression("0 7 * * 1-5")).toEqual([
      "0",
      "7",
      "*",
      "*",
      "1-5",
    ]);
    expect(() => parseCronExpression("0 7 *")).toThrow(/5 fields/);
  });

  test("matches weekday morning", () => {
    // Monday 07:00 local
    const monday = new Date(2026, 7, 24, 7, 0, 0); // Aug 24 2026 is Monday
    expect(monday.getDay()).toBe(1);
    expect(cronMatches("0 7 * * 1-5", monday)).toBe(true);
    expect(cronMatches("0 7 * * 1-5", new Date(2026, 7, 23, 7, 0, 0))).toBe(
      false,
    ); // Sunday
    expect(cronMatches("0 7 * * 1-5", new Date(2026, 7, 24, 8, 0, 0))).toBe(
      false,
    );
  });

  test("nextCronDate finds upcoming minute", () => {
    const from = new Date(2026, 7, 24, 6, 59, 0);
    const next = nextCronDate("0 7 * * 1-5", from);
    expect(next?.getHours()).toBe(7);
    expect(next?.getMinutes()).toBe(0);
  });
});

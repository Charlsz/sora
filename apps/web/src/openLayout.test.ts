import { describe, expect, test } from "bun:test";
import { isOpenDesktopLayout } from "./openLayout.ts";

describe("isOpenDesktopLayout", () => {
  test("pins chat only while Computer rail is open with a control URL", () => {
    expect(isOpenDesktopLayout(true, "https://stream.example", true)).toBe(
      true,
    );
    expect(isOpenDesktopLayout(false, "https://stream.example", true)).toBe(
      false,
    );
    expect(isOpenDesktopLayout(true, null, true)).toBe(false);
    expect(isOpenDesktopLayout(true, "https://stream.example", false)).toBe(
      false,
    );
  });
});

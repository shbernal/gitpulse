import { describe, expect, test } from "bun:test";
import { formatDate, formatMonthYear, formatRelativeDays } from "../src/util/dates";
import { formatCompactNumber, formatPercent, truncate } from "../src/util/format";

describe("format helpers", () => {
  test("formats compact numbers", () => {
    expect(formatCompactNumber(999)).toBe("999");
    expect(formatCompactNumber(1_200)).toBe("1.2k");
    expect(formatCompactNumber(2_000_000)).toBe("2m");
  });

  test("formats percentages", () => {
    expect(formatPercent(42)).toBe("42%");
    expect(formatPercent(42.5)).toBe("42.5%");
  });

  test("formats dates and relative days", () => {
    expect(formatDate("2026-05-16T12:00:00Z")).toBe("2026-05-16");
    expect(formatMonthYear("2026-02-16T12:00:00Z")).toBe("feb 2026");
    expect(formatRelativeDays(0)).toBe("today");
    expect(formatRelativeDays(1)).toBe("1 day ago");
    expect(formatRelativeDays(3)).toBe("3 days ago");
  });

  test("truncates long strings", () => {
    expect(truncate("abcdef", 4)).toBe("a...");
    expect(truncate("abcdef", 3)).toBe("abc");
  });
});

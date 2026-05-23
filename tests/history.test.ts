import { describe, expect, test } from "bun:test";
import { renderHistory } from "../src/render/history";

describe("history rendering", () => {
  test("renders recently consulted repositories", () => {
    const output = renderHistory(
      [
        {
          timestamp: "2026-05-16T12:00:00.000Z",
          command: "docs",
          entries: [{ input: "acme/tool", repository: "acme/tool", source: "cache", ok: true }],
          ok: true,
        },
      ],
      { color: false },
    );

    expect(output).toContain("gitpulse history");
    expect(output).toContain("acme/tool");
    expect(output).toContain("2026-05-16 12:00");
    expect(output).toContain("docs");
    expect(output).toContain("cache");
  });
});

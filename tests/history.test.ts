import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { appendHistoryEvent, historyEventLimit, readHistoryEvents, type HistoryEvent } from "../src/cache/history";
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

  test("renders recently consulted user profiles", () => {
    const output = renderHistory(
      [
        {
          timestamp: "2026-05-16T12:00:00.000Z",
          command: "user",
          entries: [{ input: "octocat", repository: null, source: "api", ok: true }],
          ok: true,
        },
      ],
      { color: false },
    );

    expect(output).toContain("octocat");
    expect(output).toContain("user");
    expect(output).toContain("api");
  });
});

describe("history storage", () => {
  test("keeps only the most recent events, in order", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "gitpulse-history-test-"));
    const env = { XDG_STATE_HOME: root };
    const event = (index: number): HistoryEvent => ({
      timestamp: new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString(),
      command: "repo",
      entries: [{ input: `acme/r${index}`, repository: `acme/r${index}`, source: "api", ok: true }],
      ok: true,
    });

    try {
      await mkdir(path.join(root, "gitpulse"), { recursive: true });
      const seeded = Array.from({ length: historyEventLimit + 5 }, (_, index) => JSON.stringify(event(index)));
      await writeFile(path.join(root, "gitpulse", "history.jsonl"), `${seeded.join("\n")}\n`);

      await appendHistoryEvent(event(historyEventLimit + 5), env);
      await appendHistoryEvent(event(historyEventLimit + 6), env);
      const events = await readHistoryEvents(env);
      const raw = await readFile(path.join(root, "gitpulse", "history.jsonl"), "utf8");

      expect(events).toHaveLength(historyEventLimit);
      expect(raw.endsWith("\n")).toBe(true);
      expect(events[0].entries[0].repository).toBe("acme/r7");
      expect(events.at(-1)?.entries[0].repository).toBe(`acme/r${historyEventLimit + 6}`);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

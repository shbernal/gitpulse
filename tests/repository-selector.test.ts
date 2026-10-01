import { afterEach, describe, expect, test } from "bun:test";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { selectSearchRepository, selectStarredRepository } from "../src/repository-selector";
import type { SearchRepositorySummary, StarredRepositorySummary } from "../src/types";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

/**
 * Puts a fake selector alone on PATH. It records stdin using shell builtins only, prints line
 * `pick` of it when given, then exits with `code`.
 */
async function fakeSelector(command: "fzf" | "gum", { pick, code = 0 }: { pick?: number; code?: number }) {
  const directory = await mkdtemp(join(tmpdir(), "gitpulse-selector-"));
  directories.push(directory);
  const input = join(directory, "input");
  const script = [
    "#!/bin/sh",
    "n=0",
    "while IFS= read -r line; do",
    "  n=$((n + 1))",
    `  printf '%s\\n' "$line" >> "${input}"`,
    `  [ "$n" = "${pick ?? 0}" ] && printf '%s\\n' "$line"`,
    "done",
    `exit ${code}`,
  ].join("\n");
  await writeFile(join(directory, command), script);
  await chmod(join(directory, command), 0o755);

  return {
    env: { PATH: directory },
    input: () => readFile(input, "utf8"),
  };
}

function searchResult(fullName: string, description: string | null = "A tool."): SearchRepositorySummary {
  return {
    fullName,
    name: fullName.split("/")[1],
    description,
    url: `https://github.com/${fullName}`,
    primaryLanguage: "Go",
    stars: 1200,
    forks: 3,
    archived: false,
    fork: false,
    pushedAt: "2026-05-01T00:00:00Z",
    updatedAt: "2026-05-01T00:00:00Z",
    score: 1,
  };
}

function starred(fullName: string): StarredRepositorySummary {
  const { score: _score, ...summary } = searchResult(fullName);
  return summary;
}

describe("repository selector", () => {
  test("returns the chosen owner/name from a search row", async () => {
    const selector = await fakeSelector("fzf", { pick: 2 });

    const selected = await selectSearchRepository([searchResult("acme/one"), searchResult("acme/two")], selector.env);

    expect(selected).toBe("acme/two");
  });

  test("hands gum aligned columns without tab characters", async () => {
    const selector = await fakeSelector("gum", { pick: 1 });

    const selected = await selectSearchRepository(
      [searchResult("acme/one"), searchResult("longer-owner/two", "Line one.\nLine two.")],
      selector.env,
    );
    const lines = (await selector.input()).trimEnd().split("\n");

    expect(selected).toBe("acme/one");
    expect(lines).toHaveLength(2);
    expect(lines.join("\n")).not.toContain("\t");
    expect(lines[1]).toContain("Line one. Line two.");
    expect(lines[0].indexOf("1.2k stars")).toBe(lines[1].indexOf("1.2k stars"));
  });

  test("treats Ctrl-C as a cancellation", async () => {
    const selector = await fakeSelector("fzf", { code: 130 });

    expect(await selectStarredRepository([starred("acme/one")], selector.env)).toBeNull();
  });

  test("treats an empty choice as a cancellation", async () => {
    const selector = await fakeSelector("gum", { code: 1 });

    expect(await selectStarredRepository([starred("acme/one")], selector.env)).toBeNull();
  });

  test("reports a selector failure instead of a cancellation", async () => {
    const selector = await fakeSelector("fzf", { code: 2 });

    await expect(selectStarredRepository([starred("acme/one")], selector.env)).rejects.toThrow("fzf failed with exit code 2.");
  });

  test("asks for fzf or gum when neither is on PATH", async () => {
    await expect(selectStarredRepository([starred("acme/one")], { PATH: "" })).rejects.toThrow(
      "No selector found. Install fzf or gum, or use gitpulse starred --list.",
    );
  });
});

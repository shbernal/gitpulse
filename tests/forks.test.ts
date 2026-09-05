import { afterEach, describe, expect, test } from "bun:test";
import { collectMostStarredForks } from "../src/metrics/forks";
import { renderForks } from "../src/render/table";
import type { GitHubClient } from "../src/github/client";
import type { ForkList } from "../src/types";

afterEach(() => {
  process.exitCode = 0;
});

describe("most starred fork collection", () => {
  test("normalizes the fork page and flags forks pushed after they were created", async () => {
    const result = await collectMostStarredForks(
      forkClient(),
      { owner: "acme", name: "tool" },
      { limit: 10 },
      new Date("2026-05-16T00:00:00.000Z"),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.error.message);
    }

    expect(result.list).toMatchObject({
      fetchedAt: "2026-05-16T00:00:00.000Z",
      repository: "acme/tool",
      limit: 10,
    });
    expect(result.list.forks).toEqual([
      {
        fullName: "hacker/tool",
        owner: "hacker",
        description: "Fork with local work.",
        url: "https://github.com/hacker/tool",
        primaryLanguage: "TypeScript",
        stars: 42,
        forks: 3,
        openIssues: 2,
        archived: false,
        createdAt: "2025-01-10T00:00:00Z",
        pushedAt: "2026-05-01T00:00:00Z",
        daysSinceLastPush: 15,
        pushedSinceFork: true,
      },
      {
        fullName: "drive-by/tool",
        owner: "drive-by",
        description: null,
        url: "https://github.com/drive-by/tool",
        primaryLanguage: null,
        stars: 0,
        forks: 0,
        openIssues: 0,
        archived: true,
        // GitHub carries the parent push date over, so this fork was never pushed to.
        createdAt: "2025-06-01T00:00:00Z",
        pushedAt: "2025-05-30T00:00:00Z",
        daysSinceLastPush: 351,
        pushedSinceFork: false,
      },
    ]);
  });

  test("asks GitHub for one star-sorted page", async () => {
    const calls: unknown[] = [];

    await collectMostStarredForks(
      forkClient((options) => calls.push(options)),
      { owner: "acme", name: "tool" },
      { limit: 3 },
    );

    expect(calls).toEqual([{ ref: { owner: "acme", name: "tool" }, limit: 3 }]);
  });

  test("reports API failures instead of throwing", async () => {
    const client = {
      async getMostStarredForks() {
        throw new Error("boom");
      },
    } as unknown as GitHubClient;

    const result = await collectMostStarredForks(client, { owner: "acme", name: "tool" }, { limit: 10 });

    expect(result).toMatchObject({ ok: false, error: { message: "boom" } });
  });
});

describe("fork rendering", () => {
  test("shows fork state and falls back to a placeholder for a repository with no forks", () => {
    const output = renderForks(forkList());

    expect(output).toContain("gitpulse forks acme/tool");
    expect(output).toContain("Most starred forks (top 10)");
    expect(output).toContain("hacker/tool");
    expect(output).toContain("active");
    expect(output).toContain("archived");
    expect(renderForks({ ...forkList(), forks: [] })).toContain("Most starred forks (top 10)");
  });
});

function forkList(): ForkList {
  return {
    fetchedAt: "2026-05-16T00:00:00.000Z",
    repository: "acme/tool",
    limit: 10,
    forks: [
      {
        fullName: "hacker/tool",
        owner: "hacker",
        description: "Fork with local work.",
        url: "https://github.com/hacker/tool",
        primaryLanguage: "TypeScript",
        stars: 42,
        forks: 3,
        openIssues: 2,
        archived: false,
        createdAt: "2025-01-10T00:00:00Z",
        pushedAt: "2026-05-01T00:00:00Z",
        daysSinceLastPush: 15,
        pushedSinceFork: true,
      },
      {
        fullName: "drive-by/tool",
        owner: "drive-by",
        description: null,
        url: "https://github.com/drive-by/tool",
        primaryLanguage: null,
        stars: 0,
        forks: 0,
        openIssues: 0,
        archived: true,
        createdAt: "2025-06-01T00:00:00Z",
        pushedAt: "2025-05-30T00:00:00Z",
        daysSinceLastPush: 351,
        pushedSinceFork: false,
      },
    ],
  };
}

function forkClient(record?: (options: unknown) => void): GitHubClient {
  return {
    async getMostStarredForks(ref: { owner: string; name: string }, limit: number) {
      record?.({ ref, limit });

      return [
        {
          full_name: "hacker/tool",
          name: "tool",
          description: "Fork with local work.",
          html_url: "https://github.com/hacker/tool",
          created_at: "2025-01-10T00:00:00Z",
          pushed_at: "2026-05-01T00:00:00Z",
          updated_at: "2026-05-01T00:00:00Z",
          language: "TypeScript",
          stargazers_count: 42,
          forks_count: 3,
          open_issues_count: 2,
          archived: false,
          fork: true,
          owner: { login: "hacker" },
        },
        {
          full_name: "drive-by/tool",
          name: "tool",
          description: null,
          html_url: "https://github.com/drive-by/tool",
          created_at: "2025-06-01T00:00:00Z",
          pushed_at: "2025-05-30T00:00:00Z",
          updated_at: "2025-06-01T00:00:00Z",
          language: null,
          archived: true,
          fork: true,
          owner: { login: "drive-by" },
        },
      ];
    },
  } as unknown as GitHubClient;
}

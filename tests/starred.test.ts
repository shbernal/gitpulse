import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { main } from "../src/cli";
import { resolveStarredRepositories } from "../src/cache/resolve-starred";
import { writeCachedSnapshot } from "../src/cache/store";
import { writeCachedStarredRepositories } from "../src/cache/starred-store";
import { collectStarredRepositories } from "../src/metrics/starred";
import type { GitHubClient } from "../src/github/client";
import type { RepoSnapshot, StarredRepositoryList, StarredRepositorySummary } from "../src/types";

type Env = Record<string, string | undefined>;

afterEach(() => {
  process.exitCode = 0;
});

describe("starred repository collection", () => {
  test("normalizes starred repositories from the GitHub client", async () => {
    const result = await collectStarredRepositories(starredClient(), new Date("2026-05-16T00:00:00.000Z"), {
      sort: "created",
      direction: "desc",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.error.message);
    }

    expect(result.list).toMatchObject({
      fetchedAt: "2026-05-16T00:00:00.000Z",
      sort: "created",
      direction: "desc",
      repositories: [
        {
          fullName: "acme/tool",
          name: "tool",
          url: "https://github.com/acme/tool",
          primaryLanguage: "TypeScript",
          stars: 100,
          forks: 5,
        },
      ],
    });
  });
});

describe("starred repository cache resolution", () => {
  test("uses a fresh cached starred repository list without calling the API", async () => {
    await withTempEnv(async (env) => {
      await writeCachedStarredRepositories(
        { sort: "created", direction: "desc" },
        starredList([starredRepository("acme/tool")]),
        new Date("2026-05-16T00:00:00.000Z"),
        env,
      );

      const resolved = await resolveStarredRepositories(failingClient(), {
        cacheEnabled: true,
        maxCacheHours: 168,
        staleIfError: true,
        mode: "default",
        sort: "created",
        direction: "desc",
        now: new Date("2026-05-16T12:00:00.000Z"),
        env,
      });

      expect(resolved.result.ok).toBe(true);
      expect(resolved.source.kind).toBe("cache");
    });
  });

  test("offline mode fails when no starred repository cache exists", async () => {
    await withTempEnv(async (env) => {
      const resolved = await resolveStarredRepositories(failingClient(), {
        cacheEnabled: true,
        maxCacheHours: 168,
        staleIfError: true,
        mode: "offline",
        sort: "created",
        direction: "desc",
        now: new Date("2026-05-16T12:00:00.000Z"),
        env,
      });

      expect(resolved.result.ok).toBe(false);
      expect(resolved.source.kind).toBe("none");
    });
  });
});

describe("starred CLI", () => {
  test("prints starred repository full names with --list", async () => {
    await withTempEnv(async (env) => {
      await writeCachedStarredRepositories(
        { sort: "created", direction: "desc" },
        starredList([starredRepository("acme/tool"), starredRepository("charmbracelet/gum")]),
        new Date(),
        env,
      );

      const output = await withProcessEnv(env, () =>
        captureStdout(() => main(["node", "gitpulse", "starred", "--list", "--offline"])),
      );

      expect(output).toBe("acme/tool\ncharmbracelet/gum");
    });
  });

  test("prints starred repository JSON with --list --json", async () => {
    await withTempEnv(async (env) => {
      await writeCachedStarredRepositories(
        { sort: "updated", direction: "asc" },
        starredList([starredRepository("acme/tool")], { sort: "updated", direction: "asc" }),
        new Date(),
        env,
      );

      const output = await withProcessEnv(env, () =>
        captureStdout(() =>
          main(["node", "gitpulse", "starred", "--list", "--json", "--offline", "--sort", "updated", "--direction", "asc"]),
        ),
      );
      const parsed = JSON.parse(output);

      expect(parsed.command).toBe("starred");
      expect(parsed.source.kind).toBe("cache");
      expect(parsed.result.list.sort).toBe("updated");
      expect(parsed.result.list.direction).toBe("asc");
      expect(parsed.result.list.repositories[0].fullName).toBe("acme/tool");
    });
  });

  test("renders the selected starred repository through the normal repo report path", async () => {
    await withTempEnv(async (env) => {
      await writeCachedStarredRepositories(
        { sort: "created", direction: "desc" },
        starredList([starredRepository("acme/tool"), starredRepository("charmbracelet/gum")]),
        new Date(),
        env,
      );
      await writeCachedSnapshot(
        { owner: "charmbracelet", name: "gum" },
        snapshot("charmbracelet/gum"),
        new Date(),
        env,
      );

      const output = await withProcessEnv(env, () =>
        captureStdout(() =>
          main(["node", "gitpulse", "starred", "--offline", "--color", "never"], {
            selectStarredRepository: async (repositories) => repositories[1].fullName,
          }),
        ),
      );

      expect(output).toContain("charmbracelet/gum\nhttps://github.com/charmbracelet/gum");
    });
  });

  test("cancels without rendering a repository report when the selector returns no choice", async () => {
    await withTempEnv(async (env) => {
      await writeCachedStarredRepositories(
        { sort: "created", direction: "desc" },
        starredList([starredRepository("acme/tool")]),
        new Date(),
        env,
      );

      const output = await withProcessEnv(env, () =>
        captureStdout(() =>
          main(["node", "gitpulse", "starred", "--offline", "--color", "never"], {
            selectStarredRepository: async () => null,
          }),
        ),
      );

      expect(output).toBe("");
      expect(process.exitCode).toBe(130);
    });
  });
});

async function withTempEnv<T>(fn: (env: Env) => Promise<T>): Promise<T> {
  const root = await mkdtemp(path.join(tmpdir(), "gitpulse-starred-test-"));

  try {
    return await fn({
      HOME: root,
      XDG_CACHE_HOME: path.join(root, "cache"),
      XDG_CONFIG_HOME: path.join(root, "config"),
      XDG_STATE_HOME: path.join(root, "state"),
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function withProcessEnv<T>(env: Env, fn: () => Promise<T>): Promise<T> {
  const keys = ["HOME", "XDG_CACHE_HOME", "XDG_CONFIG_HOME", "XDG_STATE_HOME"] as const;
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));

  for (const key of keys) {
    const value = env[key];

    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    return await fn();
  } finally {
    for (const key of keys) {
      const value = previous[key];

      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

async function captureStdout(fn: () => Promise<void>): Promise<string> {
  const output: string[] = [];
  const original = console.log;

  console.log = (...args: unknown[]) => {
    output.push(args.join(" "));
  };

  try {
    await fn();
  } finally {
    console.log = original;
  }

  return output.join("\n");
}

function starredClient(overrides: Partial<GitHubClient> = {}): GitHubClient {
  return {
    async getAuthenticatedUserStarredRepositories() {
      return [
        {
          full_name: "acme/tool",
          name: "tool",
          description: "A useful tool.",
          html_url: "https://github.com/acme/tool",
          pushed_at: "2026-05-15T00:00:00Z",
          updated_at: "2026-05-15T00:00:00Z",
          language: "TypeScript",
          stargazers_count: 100,
          forks_count: 5,
          archived: false,
          fork: false,
        },
      ];
    },
    ...overrides,
  } as unknown as GitHubClient;
}

function failingClient(): GitHubClient {
  return starredClient({
    async getAuthenticatedUserStarredRepositories() {
      throw new Error("api down");
    },
  });
}

function starredList(
  repositories: StarredRepositorySummary[],
  options: { sort?: "created" | "updated"; direction?: "asc" | "desc" } = {},
): StarredRepositoryList {
  return {
    fetchedAt: "2026-05-16T00:00:00.000Z",
    sort: options.sort ?? "created",
    direction: options.direction ?? "desc",
    repositories,
  };
}

function starredRepository(fullName: string): StarredRepositorySummary {
  const name = fullName.slice(fullName.indexOf("/") + 1);

  return {
    fullName,
    name,
    description: null,
    url: `https://github.com/${fullName}`,
    primaryLanguage: "TypeScript",
    stars: 10,
    forks: 2,
    archived: false,
    fork: false,
    pushedAt: "2026-05-15T00:00:00Z",
    updatedAt: "2026-05-15T00:00:00Z",
  };
}

function snapshot(fullName: string): RepoSnapshot {
  const [owner, name] = fullName.split("/");

  return {
    ref: { owner, name },
    fetchedAt: "2026-05-16T00:00:00.000Z",
    repository: {
      fullName,
      description: null,
      url: `https://github.com/${fullName}`,
      createdAt: "2020-01-01T00:00:00Z",
      pushedAt: "2026-05-15T00:00:00Z",
      updatedAt: "2026-05-15T00:00:00Z",
      defaultBranch: "main",
      primaryLanguage: "TypeScript",
      languages: [],
      license: "MIT",
      stars: 1,
      forks: 1,
      watchers: 1,
      openIssues: 0,
      openPullRequests: 0,
      openIssuesAndPullRequests: 0,
      topics: [],
      archived: false,
      fork: false,
      disabled: false,
      template: false,
      sizeKb: 1,
    },
    activity: {
      ageDays: 1,
      daysSinceLastPush: 1,
      latestCommitAt: "2026-05-15T00:00:00Z",
      daysSinceLatestCommit: 1,
      latestReleaseAt: null,
      latestReleaseName: null,
      latestReleaseTag: null,
      daysSinceLatestRelease: null,
      releaseCount: 0,
      totalCommitCount: 10,
    },
    documentation: {
      readme: { present: false, path: null },
      changelog: { present: false, path: null },
      contributing: { present: false, path: null },
      codeOfConduct: { present: false, path: null },
      security: { present: false, path: null },
    },
    contributors: {
      fetchedCount: 0,
      totalCount: 0,
      fetchLimit: 100,
      truncated: false,
      topContributor: null,
      topContributorShare: null,
    },
    metrics: {
      activityFreshness: { score: 0, label: "weak", inputs: {} },
      popularity: { score: 0, label: "weak", inputs: {} },
    },
    warnings: [],
  };
}

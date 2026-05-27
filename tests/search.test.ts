import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { main } from "../src/cli";
import { resolveSearchRepositories } from "../src/cache/resolve-search";
import { writeCachedSearchRepositories } from "../src/cache/search-store";
import { writeCachedSnapshot } from "../src/cache/store";
import { collectSearchRepositories } from "../src/metrics/search";
import type { GitHubClient } from "../src/github/client";
import type { RepoSnapshot, SearchRepositoryList, SearchRepositorySummary } from "../src/types";

type Env = Record<string, string | undefined>;

afterEach(() => {
  process.exitCode = 0;
});

describe("repository search collection", () => {
  test("normalizes repository search results from the GitHub client", async () => {
    const result = await collectSearchRepositories(searchClient(), new Date("2026-05-16T00:00:00.000Z"), {
      query: "terminal ui",
      sort: "stars",
      order: "desc",
      limit: 20,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.error.message);
    }

    expect(result.list).toMatchObject({
      fetchedAt: "2026-05-16T00:00:00.000Z",
      query: "terminal ui",
      sort: "stars",
      order: "desc",
      limit: 20,
      totalCount: 2,
      incompleteResults: false,
      repositories: [
        {
          fullName: "acme/tool",
          name: "tool",
          url: "https://github.com/acme/tool",
          primaryLanguage: "TypeScript",
          stars: 100,
          forks: 5,
          score: 1.5,
        },
      ],
    });
  });
});

describe("repository search cache resolution", () => {
  test("uses a fresh cached repository search result without calling the API", async () => {
    await withTempEnv(async (env) => {
      await writeCachedSearchRepositories(
        searchOptions(),
        searchList([searchRepository("acme/tool")]),
        new Date("2026-05-16T00:00:00.000Z"),
        env,
      );

      const resolved = await resolveSearchRepositories(failingClient(), {
        cacheEnabled: true,
        maxCacheHours: 168,
        staleIfError: true,
        mode: "default",
        ...searchOptions(),
        now: new Date("2026-05-16T12:00:00.000Z"),
        env,
      });

      expect(resolved.result.ok).toBe(true);
      expect(resolved.source.kind).toBe("cache");
    });
  });

  test("offline mode fails when no repository search cache exists", async () => {
    await withTempEnv(async (env) => {
      const resolved = await resolveSearchRepositories(failingClient(), {
        cacheEnabled: true,
        maxCacheHours: 168,
        staleIfError: true,
        mode: "offline",
        ...searchOptions(),
        now: new Date("2026-05-16T12:00:00.000Z"),
        env,
      });

      expect(resolved.result.ok).toBe(false);
      expect(resolved.source.kind).toBe("none");
    });
  });
});

describe("search CLI", () => {
  test("prints repository search result full names with --list", async () => {
    await withTempEnv(async (env) => {
      await writeCachedSearchRepositories(
        searchOptions(),
        searchList([searchRepository("acme/tool"), searchRepository("charmbracelet/gum")]),
        new Date(),
        env,
      );

      const output = await withProcessEnv(env, () =>
        captureStdout(() => main(["node", "gitpulse", "search", "terminal", "ui", "--list", "--offline"])),
      );

      expect(output).toBe("acme/tool\ncharmbracelet/gum");
    });
  });

  test("prints repository search JSON with --list --json", async () => {
    await withTempEnv(async (env) => {
      await writeCachedSearchRepositories(
        { query: "terminal ui", sort: "updated", order: "asc", limit: 10 },
        searchList([searchRepository("acme/tool")], { sort: "updated", order: "asc", limit: 10 }),
        new Date(),
        env,
      );

      const output = await withProcessEnv(env, () =>
        captureStdout(() =>
          main([
            "node",
            "gitpulse",
            "search",
            "terminal",
            "ui",
            "--list",
            "--json",
            "--offline",
            "--sort",
            "updated",
            "--order",
            "asc",
            "--limit",
            "10",
          ]),
        ),
      );
      const parsed = JSON.parse(output);

      expect(parsed.command).toBe("search");
      expect(parsed.source.kind).toBe("cache");
      expect(parsed.result.list.sort).toBe("updated");
      expect(parsed.result.list.order).toBe("asc");
      expect(parsed.result.list.repositories[0].fullName).toBe("acme/tool");
    });
  });

  test("renders the selected search repository through the normal repo report path", async () => {
    await withTempEnv(async (env) => {
      await writeCachedSearchRepositories(
        searchOptions(),
        searchList([searchRepository("acme/tool"), searchRepository("charmbracelet/gum")]),
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
          main(["node", "gitpulse", "search", "terminal", "ui", "--offline", "--color", "never"], {
            selectSearchRepository: async (repositories) => repositories[1].fullName,
          }),
        ),
      );

      expect(output).toContain("charmbracelet/gum\nhttps://github.com/charmbracelet/gum");
    });
  });

  test("runs the first repository result with --lucky", async () => {
    await withTempEnv(async (env) => {
      await writeCachedSearchRepositories(
        searchOptions(),
        searchList([searchRepository("acme/tool"), searchRepository("charmbracelet/gum")]),
        new Date(),
        env,
      );
      await writeCachedSnapshot({ owner: "acme", name: "tool" }, snapshot("acme/tool"), new Date(), env);

      const output = await withProcessEnv(env, () =>
        captureStdout(() => main(["node", "gitpulse", "search", "terminal", "ui", "--lucky", "--offline", "--color", "never"])),
      );

      expect(output).toContain("acme/tool\nhttps://github.com/acme/tool");
    });
  });

  test("renders the selected repository JSON with --lucky --json", async () => {
    await withTempEnv(async (env) => {
      await writeCachedSearchRepositories(searchOptions(), searchList([searchRepository("acme/tool")]), new Date(), env);
      await writeCachedSnapshot({ owner: "acme", name: "tool" }, snapshot("acme/tool"), new Date(), env);

      const output = await withProcessEnv(env, () =>
        captureStdout(() => main(["node", "gitpulse", "search", "terminal", "ui", "--lucky", "--json", "--offline"])),
      );
      const parsed = JSON.parse(output);

      expect(parsed.command).toBe("repo");
      expect(parsed.result.snapshot.repository.fullName).toBe("acme/tool");
    });
  });

  test("rejects combining --list and --lucky", async () => {
    const error = await captureStderr(() => main(["node", "gitpulse", "search", "terminal", "ui", "--list", "--lucky"]));

    expect(error).toBe("gitpulse: --list and --lucky cannot be used together.");
    expect(process.exitCode).toBe(1);
  });

  test("keeps unknown root shorthand from falling through to remote search", async () => {
    await withTempEnv(async (env) => {
      await writeCachedSearchRepositories(
        { query: "missing", sort: "best-match", order: "desc", limit: 20 },
        searchList([searchRepository("acme/tool")], { query: "missing" }),
        new Date(),
        env,
      );

      const error = await withProcessEnv(env, () => captureStderr(() => main(["node", "gitpulse", "missing", "--offline"])));

      expect(error).toContain('Unknown repository shorthand "missing"');
      expect(error).toContain("Use owner/name once to fetch and record it.");
      expect(process.exitCode).toBe(1);
    });
  });
});

async function withTempEnv<T>(fn: (env: Env) => Promise<T>): Promise<T> {
  const root = await mkdtemp(path.join(tmpdir(), "gitpulse-search-test-"));

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

async function captureStderr(fn: () => Promise<void>): Promise<string> {
  const output: string[] = [];
  const original = console.error;

  console.error = (...args: unknown[]) => {
    output.push(args.join(" "));
  };

  try {
    await fn();
  } finally {
    console.error = original;
  }

  return output.join("\n");
}

function searchClient(overrides: Partial<GitHubClient> = {}): GitHubClient {
  return {
    async searchRepositories() {
      return {
        repositories: [
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
            score: 1.5,
          },
        ],
        totalCount: 2,
        incompleteResults: false,
      };
    },
    ...overrides,
  } as unknown as GitHubClient;
}

function failingClient(): GitHubClient {
  return searchClient({
    async searchRepositories() {
      throw new Error("api down");
    },
  });
}

function searchOptions() {
  return {
    query: "terminal ui",
    sort: "best-match" as const,
    order: "desc" as const,
    limit: 20,
  };
}

function searchList(
  repositories: SearchRepositorySummary[],
  options: Partial<Pick<SearchRepositoryList, "query" | "sort" | "order" | "limit">> = {},
): SearchRepositoryList {
  return {
    fetchedAt: "2026-05-16T00:00:00.000Z",
    query: options.query ?? "terminal ui",
    sort: options.sort ?? "best-match",
    order: options.order ?? "desc",
    limit: options.limit ?? 20,
    totalCount: repositories.length,
    incompleteResults: false,
    repositories,
  };
}

function searchRepository(fullName: string): SearchRepositorySummary {
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
    score: 1,
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
      activityFreshness: {
        score: 0,
        label: "weak",
        inputs: {},
      },
      popularity: {
        score: 0,
        label: null,
        scale: "index",
        units: 0,
        inputs: {},
      },
    },
    warnings: [],
  };
}

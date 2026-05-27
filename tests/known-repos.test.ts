import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { main } from "../src/cli";
import { renderBashCompletionScript } from "../src/completions";
import { appendHistoryEvent, clearHistory } from "../src/cache/history";
import {
  completeKnownRepos,
  readKnownRepos,
  RepositoryShorthandError,
  resolveKnownRepoShorthand,
  type KnownRepo,
} from "../src/cache/known-repos";
import { completeKnownUsers, readKnownUsers, type KnownUser } from "../src/cache/known-users";
import { clearCache } from "../src/cache/maintenance";
import { writeCachedSnapshot } from "../src/cache/store";
import { writeCachedUserProfileSnapshot } from "../src/cache/user-store";
import type { RepoSnapshot, UserProfileSnapshot } from "../src/types";

type Env = Record<string, string | undefined>;

afterEach(() => {
  process.exitCode = 0;
});

describe("known repositories", () => {
  test("aggregates known repositories from cache", async () => {
    await withTempEnv(async (env) => {
      await writeCachedSnapshot(
        { owner: "acme", name: "tool" },
        snapshot("Acme/Tool"),
        new Date("2026-05-16T12:00:00.000Z"),
        env,
      );

      expect(await readKnownRepos(env)).toEqual([
        {
          fullName: "Acme/Tool",
          owner: "Acme",
          name: "Tool",
          cachedAt: "2026-05-16T12:00:00.000Z",
          sources: ["cache"],
        },
      ]);
    });
  });

  test("aggregates known repositories from history", async () => {
    await withTempEnv(async (env) => {
      await appendHistoryEvent(
        {
          timestamp: "2026-05-16T13:00:00.000Z",
          command: "docs",
          entries: [{ input: "tool", repository: "acme/tool", source: "api", ok: true }],
          ok: true,
        },
        env,
      );

      expect(await readKnownRepos(env)).toEqual([
        {
          fullName: "acme/tool",
          owner: "acme",
          name: "tool",
          lastSeenAt: "2026-05-16T13:00:00.000Z",
          sources: ["history"],
        },
      ]);
    });
  });

  test("deduplicates repositories and prefers cached canonical casing", async () => {
    await withTempEnv(async (env) => {
      await appendHistoryEvent(
        {
          timestamp: "2026-05-16T13:00:00.000Z",
          command: "repo",
          entries: [{ input: "acme/tool", repository: "acme/tool", source: "api", ok: true }],
          ok: true,
        },
        env,
      );
      await writeCachedSnapshot(
        { owner: "acme", name: "tool" },
        snapshot("Acme/Tool"),
        new Date("2026-05-16T12:00:00.000Z"),
        env,
      );

      expect(await readKnownRepos(env)).toEqual([
        {
          fullName: "Acme/Tool",
          owner: "Acme",
          name: "Tool",
          lastSeenAt: "2026-05-16T13:00:00.000Z",
          cachedAt: "2026-05-16T12:00:00.000Z",
          sources: ["history", "cache"],
        },
      ]);
    });
  });

  test("cache and history clears remove known repository candidates", async () => {
    await withTempEnv(async (env) => {
      await appendHistoryEvent(
        {
          timestamp: "2026-05-16T13:00:00.000Z",
          command: "repo",
          entries: [{ input: "acme/tool", repository: "acme/tool", source: "api", ok: true }],
          ok: true,
        },
        env,
      );
      await writeCachedSnapshot({ owner: "acme", name: "tool" }, snapshot("acme/tool"), new Date(), env);

      expect(await readKnownRepos(env)).toHaveLength(1);

      await clearCache(env);
      await clearHistory(env);

      expect(await readKnownRepos(env)).toEqual([]);
    });
  });
});

describe("known users", () => {
  test("aggregates known users from cache", async () => {
    await withTempEnv(async (env) => {
      await writeCachedUserProfileSnapshot("octocat", userSnapshot("OctoCat"), new Date("2026-05-16T12:00:00.000Z"), env);

      expect(await readKnownUsers(env)).toEqual([
        {
          login: "OctoCat",
          cachedAt: "2026-05-16T12:00:00.000Z",
          sources: ["cache"],
        },
      ]);
    });
  });

  test("aggregates known users from history", async () => {
    await withTempEnv(async (env) => {
      await appendHistoryEvent(
        {
          timestamp: "2026-05-16T13:00:00.000Z",
          command: "user",
          entries: [{ input: "octocat", repository: null, user: "OctoCat", source: "api", ok: true }],
          ok: true,
        },
        env,
      );

      expect(await readKnownUsers(env)).toEqual([
        {
          login: "OctoCat",
          lastSeenAt: "2026-05-16T13:00:00.000Z",
          sources: ["history"],
        },
      ]);
    });
  });

  test("deduplicates users and prefers cached canonical casing", async () => {
    await withTempEnv(async (env) => {
      await appendHistoryEvent(
        {
          timestamp: "2026-05-16T13:00:00.000Z",
          command: "user",
          entries: [{ input: "octocat", repository: null, user: "octocat", source: "api", ok: true }],
          ok: true,
        },
        env,
      );
      await writeCachedUserProfileSnapshot("octocat", userSnapshot("OctoCat"), new Date("2026-05-16T12:00:00.000Z"), env);

      expect(await readKnownUsers(env)).toEqual([
        {
          login: "OctoCat",
          lastSeenAt: "2026-05-16T13:00:00.000Z",
          cachedAt: "2026-05-16T12:00:00.000Z",
          sources: ["history", "cache"],
        },
      ]);
    });
  });
});

describe("repository shorthand resolution", () => {
  test("passes explicit owner/name references through", () => {
    expect(resolveKnownRepoShorthand("owner/repo", [])).toBe("owner/repo");
  });

  test("resolves exact bare repository names", () => {
    expect(resolveKnownRepoShorthand("tool", [knownRepo("acme/tool")])).toBe("acme/tool");
  });

  test("resolves exact bare owner names", () => {
    expect(resolveKnownRepoShorthand("acme", [knownRepo("acme/tool")])).toBe("acme/tool");
  });

  test("resolves when exact owner and repository-name matches point to the same repository", () => {
    expect(resolveKnownRepoShorthand("cli", [knownRepo("cli/cli")])).toBe("cli/cli");
  });

  test("rejects ambiguous shorthand with known matches", () => {
    expect(() => resolveKnownRepoShorthand("cli", [knownRepo("cli/cli"), knownRepo("denoland/cli")])).toThrow(
      RepositoryShorthandError,
    );

    try {
      resolveKnownRepoShorthand("cli", [knownRepo("cli/cli"), knownRepo("denoland/cli")]);
    } catch (error) {
      expect(error).toBeInstanceOf(RepositoryShorthandError);
      expect(error instanceof RepositoryShorthandError ? error.kind : null).toBe("ambiguous");
      expect(error instanceof RepositoryShorthandError ? error.candidates : []).toEqual(["cli/cli", "denoland/cli"]);
      expect(error instanceof Error ? error.message : "").toContain('Ambiguous repository shorthand "cli"');
    }
  });

  test("rejects unknown shorthand without searching remotely", () => {
    expect(() => resolveKnownRepoShorthand("missing", [knownRepo("acme/tool")])).toThrow(
      'Unknown repository shorthand "missing"',
    );
  });
});

describe("known repository completion", () => {
  test("completes by owner prefix", () => {
    expect(completeKnownRepos("deno", [knownRepo("denoland/cli"), knownRepo("acme/tool")])).toEqual(["denoland/cli"]);
  });

  test("completes by repository-name prefix", () => {
    expect(completeKnownRepos("too", [knownRepo("acme/tool"), knownRepo("acme/docs")])).toEqual(["acme/tool"]);
  });

  test("completes by full-name prefix", () => {
    expect(completeKnownRepos("denoland/", [knownRepo("denoland/cli"), knownRepo("denoland/deno")])).toEqual([
      "denoland/cli",
      "denoland/deno",
    ]);
  });

  test("prefers match quality before recency", () => {
    expect(
      completeKnownRepos("cli", [
        knownRepo("denoland/cli", { lastSeenAt: "2026-05-16T13:00:00.000Z" }),
        knownRepo("cli/cli", { lastSeenAt: "2026-05-15T13:00:00.000Z" }),
      ]),
    ).toEqual(["cli/cli", "denoland/cli"]);
  });
});

describe("known user completion", () => {
  test("completes by login prefix", () => {
    expect(completeKnownUsers("oct", [knownUser("octocat"), knownUser("github")])).toEqual(["octocat"]);
  });

  test("prefers recent users before alphabetical order", () => {
    expect(
      completeKnownUsers("", [
        knownUser("github", { lastSeenAt: "2026-05-15T13:00:00.000Z" }),
        knownUser("octocat", { lastSeenAt: "2026-05-16T13:00:00.000Z" }),
      ]),
    ).toEqual(["octocat", "github"]);
  });
});

describe("completion commands", () => {
  test("generates the expected Bash hooks", () => {
    const script = renderBashCompletionScript();

    expect(script).toContain("docs web starred user history cache config completions");
    expect(script).not.toContain("repo compare");
    expect(script).toContain("--explain");
    expect(script).toContain("--theme");
    expect(script).toContain("--list --sort --direction");
    expect(script).toContain("created updated");
    expect(script).toContain("asc desc");
    expect(script).toContain('compgen -W "web"');
    expect(script).toContain("docs|web");
    expect(script).toContain("__complete repos --current");
    expect(script).toContain("__complete users --current");
    expect(script).toContain("auto always never");
    expect(script).toContain("tokyo-night catppuccin-mocha nord gruvbox-dark dracula");
    expect(script).toContain("complete -F _gitpulse gitpulse");
  });

  test("prints local repository candidates through the hidden completion command", async () => {
    await withTempEnv(async (env) => {
      await appendHistoryEvent(
        {
          timestamp: "2026-05-16T13:00:00.000Z",
          command: "repo",
          entries: [{ input: "acme/tool", repository: "acme/tool", source: "api", ok: true }],
          ok: true,
        },
        env,
      );

      const output = await withProcessEnv(env, () =>
        captureStdout(() => main(["node", "gitpulse", "__complete", "repos", "--current", "too"])),
      );

      expect(output).toBe("acme/tool");
    });
  });

  test("prints local user candidates through the hidden completion command", async () => {
    await withTempEnv(async (env) => {
      await writeCachedUserProfileSnapshot("octocat", userSnapshot("octocat"), new Date(), env);

      const output = await withProcessEnv(env, () =>
        captureStdout(() => main(["node", "gitpulse", "__complete", "users", "--current", "oct"])),
      );

      expect(output).toBe("octocat");
    });
  });
});

describe("CLI shorthand wiring", () => {
  test("resolves exact local shorthand for root, docs, and inferred comparison output", async () => {
    await withTempEnv(async (env) => {
      await writeCachedSnapshot({ owner: "acme", name: "tool" }, snapshot("acme/tool"), new Date(), env);
      await writeCachedSnapshot({ owner: "charmbracelet", name: "gum" }, snapshot("charmbracelet/gum"), new Date(), env);

      const rootOutput = await withProcessEnv(env, () =>
        captureStdout(() => main(["node", "gitpulse", "tool", "--offline", "--color", "never"])),
      );
      expect(rootOutput).toContain("acme/tool\nhttps://github.com/acme/tool");

      const explainOutput = await withProcessEnv(env, () =>
        captureStdout(() => main(["node", "gitpulse", "tool", "--offline", "--color", "never", "--explain"])),
      );
      expect(explainOutput).toContain("Score Analysis");
      expect(explainOutput).toContain("Commit or push freshness");

      const docsOutput = await withProcessEnv(env, () =>
        captureStdout(() => main(["node", "gitpulse", "docs", "tool", "--offline", "--color", "never"])),
      );
      expect(docsOutput).toContain("gitpulse docs acme/tool");

      const compareOutput = await withProcessEnv(env, () =>
        captureStdout(() => main(["node", "gitpulse", "tool", "gum", "--offline", "--color", "never"])),
      );
      expect(compareOutput).toContain("Compared Repos");
      expect(compareOutput).toContain("tool");
      expect(compareOutput).toContain("gum");
    });
  });

  test("renders cached GitHub user profiles through the user command", async () => {
    await withTempEnv(async (env) => {
      await writeCachedUserProfileSnapshot("octocat", userSnapshot("octocat"), new Date(), env);

      const output = await withProcessEnv(env, () =>
        captureStdout(() => main(["node", "gitpulse", "user", "octocat", "--offline", "--color", "never"])),
      );

      expect(output).toContain("gitpulse user octocat");
      expect(output).toContain("Repository footprint");
    });
  });

  test("opens repository pages through the web command with exact local shorthand", async () => {
    await withTempEnv(async (env) => {
      await writeCachedSnapshot({ owner: "acme", name: "tool" }, snapshot("acme/tool"), new Date(), env);
      const openedUrls: string[] = [];

      const output = await withProcessEnv(env, () =>
        captureStdout(() =>
          main(["node", "gitpulse", "web", "tool"], {
            openUrl: async (url) => {
              openedUrls.push(url);
            },
          }),
        ),
      );

      expect(openedUrls).toEqual(["https://github.com/acme/tool"]);
      expect(output).toBe("Opened https://github.com/acme/tool");
    });
  });

  test("rejects score explanation for inferred comparison output", async () => {
    const error = await captureStderr(() => main(["node", "gitpulse", "acme/tool", "charmbracelet/gum", "--explain"]));

    expect(error).toBe("gitpulse: --explain is only supported for single repository reports.");
    expect(process.exitCode).toBe(1);
    process.exitCode = 0;
  });

  test("opens GitHub user profiles through the user web command", async () => {
    const openedUrls: string[] = [];

    const output = await captureStdout(() =>
      main(["node", "gitpulse", "user", "web", "octocat"], {
        openUrl: async (url) => {
          openedUrls.push(url);
        },
      }),
    );

    expect(openedUrls).toEqual(["https://github.com/octocat"]);
    expect(output).toBe("Opened https://github.com/octocat");
  });
});

async function withTempEnv<T>(fn: (env: Env) => Promise<T>): Promise<T> {
  const root = await mkdtemp(path.join(tmpdir(), "gitpulse-known-repos-test-"));

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

function knownRepo(fullName: string, options: Partial<KnownRepo> = {}): KnownRepo {
  const [owner, name] = fullName.split("/");

  return {
    fullName,
    owner,
    name,
    sources: [],
    ...options,
  };
}

function knownUser(login: string, options: Partial<KnownUser> = {}): KnownUser {
  return {
    login,
    sources: [],
    ...options,
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

function userSnapshot(login: string): UserProfileSnapshot {
  const repository = {
    fullName: `${login}/hello`,
    name: "hello",
    description: null,
    url: `https://github.com/${login}/hello`,
    primaryLanguage: "TypeScript",
    stars: 10,
    forks: 2,
    archived: false,
    fork: false,
    createdAt: "2020-01-01T00:00:00Z",
    pushedAt: "2026-05-15T00:00:00Z",
    updatedAt: "2026-05-15T00:00:00Z",
    daysSinceLastPush: 1,
  };

  return {
    login,
    fetchedAt: "2026-05-16T00:00:00.000Z",
    profile: {
      login,
      name: "The Octocat",
      type: "User",
      bio: null,
      url: `https://github.com/${login}`,
      company: null,
      location: null,
      blog: null,
      twitterUsername: null,
      email: null,
      hireable: null,
      createdAt: "2011-01-25T18:44:36Z",
      updatedAt: "2026-05-01T00:00:00Z",
      ageDays: 5589,
      daysSinceUpdated: 15,
      publicRepos: 1,
      publicGists: 0,
      followers: 10,
      following: 1,
      siteAdmin: false,
    },
    repositories: {
      publicRepoCount: 1,
      fetchedCount: 1,
      fetchLimit: 100,
      truncated: false,
      recentPushWindowDays: 90,
      recentlyPushedCount: 1,
      totalStars: 10,
      totalForks: 2,
      archivedCount: 0,
      forkCount: 0,
      primaryLanguages: [{ name: "TypeScript", repositoryCount: 1, percent: 100 }],
      topRepositories: [repository],
      recentlyPushedRepositories: [repository],
    },
    warnings: [],
  };
}

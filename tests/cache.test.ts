import { describe, expect, test } from "bun:test";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { clearHistory } from "../src/cache/history";
import { clearCache } from "../src/cache/maintenance";
import { gitpulseCacheDir, historyPath } from "../src/cache/paths";
import { cacheSource, isFreshCache } from "../src/cache/policy";
import { resolveSnapshot } from "../src/cache/resolve";
import { writeCachedSnapshot } from "../src/cache/store";
import { configPath, defaultConfig, parseConfig, resetConfig } from "../src/config";
import type { GitHubClient } from "../src/github/client";
import type { RepoSnapshot } from "../src/types";

type Env = Record<string, string | undefined>;

describe("cache policy", () => {
  test("treats cache entries as fresh within the max cache window", () => {
    const now = new Date("2026-05-16T12:00:00.000Z");

    expect(isFreshCache("2026-05-10T12:00:00.000Z", 168, now)).toBe(true);
    expect(isFreshCache("2026-05-01T12:00:00.000Z", 168, now)).toBe(false);
    expect(cacheSource("2026-05-01T12:00:00.000Z", 168, now).kind).toBe("stale-cache");
  });
});

describe("config parsing", () => {
  test("uses cache-first defaults", () => {
    expect(parseConfig({})).toEqual({
      cache: {
        enabled: true,
        maxCacheHours: 168,
        staleIfError: true,
      },
      contributors: {
        fetchLimit: 100,
      },
    });
  });

  test("rejects invalid cache freshness", () => {
    expect(() => parseConfig({ cache: { maxCacheHours: -1 } })).toThrow("cache.maxCacheHours");
  });

  test("parses contributor fetch limits", () => {
    expect(parseConfig({ contributors: { fetchLimit: 250 } }).contributors.fetchLimit).toBe(250);
    expect(() => parseConfig({ contributors: { fetchLimit: 0 } })).toThrow("contributors.fetchLimit");
  });
});

describe("local file maintenance", () => {
  test("resolves XDG paths for config, cache, and history", async () => {
    await withTempEnv(async (env) => {
      expect(configPath(env)).toBe(path.join(env.XDG_CONFIG_HOME ?? "", "gitpulse", "config.json"));
      expect(gitpulseCacheDir(env)).toBe(path.join(env.XDG_CACHE_HOME ?? "", "gitpulse"));
      expect(historyPath(env)).toBe(path.join(env.XDG_STATE_HOME ?? "", "gitpulse", "history.jsonl"));
    });
  });

  test("resets config to default values", async () => {
    await withTempEnv(async (env) => {
      const filePath = await resetConfig(env);

      expect(filePath).toBe(configPath(env));
      expect(JSON.parse(await readFile(filePath, "utf8"))).toEqual(defaultConfig);
    });
  });

  test("clears cache without touching config or history", async () => {
    await withTempEnv(async (env) => {
      const cacheDir = gitpulseCacheDir(env);
      const configFile = configPath(env);
      const historyFile = historyPath(env);

      await mkdir(cacheDir, { recursive: true });
      await mkdir(path.dirname(configFile), { recursive: true });
      await mkdir(path.dirname(historyFile), { recursive: true });
      await writeFile(path.join(cacheDir, "entry.json"), "{}\n", "utf8");
      await writeFile(configFile, "{}\n", "utf8");
      await writeFile(historyFile, "{}\n", "utf8");

      expect(await exists(cacheDir)).toBe(true);
      expect(await clearCache(env)).toBe(cacheDir);
      expect(await exists(cacheDir)).toBe(false);
      expect(await exists(configFile)).toBe(true);
      expect(await exists(historyFile)).toBe(true);
    });
  });

  test("clears history without touching sibling state files", async () => {
    await withTempEnv(async (env) => {
      const historyFile = historyPath(env);
      const siblingFile = path.join(path.dirname(historyFile), "other.jsonl");

      await mkdir(path.dirname(historyFile), { recursive: true });
      await writeFile(historyFile, "{}\n", "utf8");
      await writeFile(siblingFile, "{}\n", "utf8");

      expect(await clearHistory(env)).toBe(historyFile);
      expect(await exists(historyFile)).toBe(false);
      expect(await exists(siblingFile)).toBe(true);
    });
  });

  test("cache and history clears are idempotent", async () => {
    await withTempEnv(async (env) => {
      await clearCache(env);
      await clearCache(env);
      await clearHistory(env);
      await clearHistory(env);
    });
  });
});

describe("snapshot cache resolution", () => {
  test("uses a fresh cache entry without calling the API", async () => {
    await withTempEnv(async (env) => {
      const ref = { owner: "acme", name: "tool" };
      await writeCachedSnapshot(ref, snapshot("acme/tool"), new Date("2026-05-16T00:00:00.000Z"), env);

      const resolved = await resolveSnapshot(failingClient(), "acme/tool", {
        cacheEnabled: true,
        maxCacheHours: 168,
        staleIfError: true,
        mode: "default",
        now: new Date("2026-05-16T12:00:00.000Z"),
        env,
      });

      expect(resolved.result.ok).toBe(true);
      expect(resolved.source.kind).toBe("cache");
    });
  });

  test("refreshes fresh cache when contributor fetch limit changes", async () => {
    await withTempEnv(async (env) => {
      const ref = { owner: "acme", name: "tool" };
      await writeCachedSnapshot(ref, snapshot("acme/tool"), new Date("2026-05-16T00:00:00.000Z"), env);

      const resolved = await resolveSnapshot(failingClient(), "acme/tool", {
        cacheEnabled: true,
        contributorFetchLimit: 250,
        maxCacheHours: 168,
        staleIfError: true,
        mode: "default",
        now: new Date("2026-05-16T12:00:00.000Z"),
        env,
      });

      expect(resolved.result.ok).toBe(true);
      expect(resolved.source.kind).toBe("stale-cache");
      expect(resolved.source.kind === "stale-cache" ? resolved.source.refreshError?.message : null).toContain("api down");
    });
  });

  test("uses stale cache when refresh fails and staleIfError is enabled", async () => {
    await withTempEnv(async (env) => {
      const ref = { owner: "acme", name: "tool" };
      await writeCachedSnapshot(ref, snapshot("acme/tool"), new Date("2026-05-01T00:00:00.000Z"), env);

      const resolved = await resolveSnapshot(failingClient(), "acme/tool", {
        cacheEnabled: true,
        maxCacheHours: 24,
        staleIfError: true,
        mode: "default",
        now: new Date("2026-05-16T00:00:00.000Z"),
        env,
      });

      expect(resolved.result.ok).toBe(true);
      expect(resolved.source.kind).toBe("stale-cache");
      expect(resolved.source.kind === "stale-cache" ? resolved.source.refreshError?.message : null).toContain("api down");
    });
  });

  test("offline mode fails when no cache entry exists", async () => {
    await withTempEnv(async (env) => {
      const resolved = await resolveSnapshot(failingClient(), "acme/missing", {
        cacheEnabled: true,
        maxCacheHours: 168,
        staleIfError: true,
        mode: "offline",
        now: new Date("2026-05-16T00:00:00.000Z"),
        env,
      });

      expect(resolved.result.ok).toBe(false);
      expect(resolved.source.kind).toBe("none");
    });
  });
});

async function withTempEnv<T>(fn: (env: Env) => Promise<T>): Promise<T> {
  const root = await mkdtemp(path.join(tmpdir(), "gitpulse-cache-test-"));

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

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function failingClient(): GitHubClient {
  return {
    getRepository: async () => {
      throw new Error("api down");
    },
  } as unknown as GitHubClient;
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
      communityFootprint: { score: 0, label: "weak", inputs: {} },
      maintenanceVisibility: { score: 0, label: "weak", inputs: {} },
    },
    warnings: [],
  };
}

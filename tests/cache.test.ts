import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { cacheSource, isFreshCache } from "../src/cache/policy";
import { resolveSnapshot } from "../src/cache/resolve";
import { writeCachedSnapshot } from "../src/cache/store";
import { parseConfig } from "../src/config";
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
    });
  });

  test("rejects invalid cache freshness", () => {
    expect(() => parseConfig({ cache: { maxCacheHours: -1 } })).toThrow("cache.maxCacheHours");
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

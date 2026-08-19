import { describe, expect, test } from "bun:test";
import type { GitHubClient } from "../src/github/client";
import { collectSnapshot } from "../src/metrics/snapshot";
import { collectUserProfileSnapshot } from "../src/metrics/user-profile";

describe("collectSnapshot", () => {
  test("uses GitHub subscribers_count as repository watchers", async () => {
    const client = githubClient();

    const result = await collectSnapshot(client, "acme/tool", new Date("2026-05-16T00:00:00.000Z"));

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.error.message);
    }

    expect(result.snapshot.repository.stars).toBe(100);
    expect(result.snapshot.repository.watchers).toBe(7);
    expect(result.snapshot.activity.totalCommitCount).toBe(0);
    expect(result.snapshot.contributors.totalCount).toBe(0);
    expect(result.snapshot.metrics.popularity.inputs.watchers).toBe(7);
    expect(result.snapshot.metrics.popularity.inputs.popularityUnits).toBe(175);
    expect(result.snapshot.metrics.popularity.score).toBe(2.25);
    expect(Object.hasOwn(result.snapshot.metrics.popularity.inputs, "subscribers")).toBe(false);
    expect(Object.hasOwn(result.snapshot.metrics.popularity.inputs, "contributors")).toBe(false);
  });

  test("passes contributor fetch limits into snapshot collection", async () => {
    let requestedFetchLimit: number | undefined;
    const client = githubClient({
      async getContributors(_ref, fetchLimit = 100) {
        requestedFetchLimit = fetchLimit;
        return {
          contributors: [{ login: "octo", contributions: 9 }],
          totalCount: 15,
          fetchLimit,
          truncated: true,
        };
      },
    });

    const result = await collectSnapshot(client, "acme/tool", new Date("2026-05-16T00:00:00.000Z"), {
      contributorFetchLimit: 5,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.error.message);
    }

    expect(requestedFetchLimit).toBe(5);
    expect(result.snapshot.contributors.fetchedCount).toBe(1);
    expect(result.snapshot.contributors.totalCount).toBe(15);
    expect(result.snapshot.contributors.fetchLimit).toBe(5);
    expect(result.snapshot.warnings).toContain("Contributor concentration metrics are based on the first 5 contributors.");
  });

  test("summarizes stable and prerelease paths from sampled releases", async () => {
    const client = githubClient({
      async getReleaseOverview() {
        return {
          latest: {
            name: "v1.0.0",
            tag_name: "v1.0.0",
            published_at: "2026-05-01T00:00:00Z",
            created_at: "2026-05-01T00:00:00Z",
            updated_at: "2026-05-01T00:00:00Z",
            prerelease: false,
            draft: false,
          },
          count: 2,
          releases: [
            {
              name: "Nightly Build",
              tag_name: "nightly",
              published_at: "2024-08-07T00:00:00Z",
              created_at: "2026-06-07T00:00:00Z",
              updated_at: "2026-06-07T00:00:00Z",
              prerelease: true,
              draft: false,
            },
            {
              name: "v1.0.0",
              tag_name: "v1.0.0",
              published_at: "2026-05-01T00:00:00Z",
              created_at: "2026-05-01T00:00:00Z",
              updated_at: "2026-05-01T00:00:00Z",
              prerelease: false,
              draft: false,
            },
          ],
          sampleLimit: 100,
        };
      },
    });

    const result = await collectSnapshot(client, "acme/tool", new Date("2026-06-09T00:00:00.000Z"));

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.error.message);
    }

    expect(result.snapshot.activity.latestReleaseTag).toBe("v1.0.0");
    expect(result.snapshot.activity.releaseSummary).toMatchObject({
      totalCount: 2,
      sampledCount: 2,
      truncated: false,
      stableCount: 1,
      prereleaseCount: 1,
      tracks: [
        { kind: "stable", latestTag: "v1.0.0", prerelease: false },
        { kind: "nightly", latestTag: "nightly", prerelease: true, daysSinceLatest: 2 },
      ],
    });
  });

  test("counts the latest stable release when it falls outside the sampled window", async () => {
    const client = githubClient({
      async getReleaseOverview() {
        return {
          latest: {
            name: "v1.0.0",
            tag_name: "v1.0.0",
            published_at: "2025-01-01T00:00:00Z",
            created_at: "2025-01-01T00:00:00Z",
            updated_at: "2025-01-01T00:00:00Z",
            prerelease: false,
            draft: false,
          },
          count: 312,
          releases: [
            {
              name: "Nightly Build",
              tag_name: "nightly-2026-06-07",
              published_at: "2026-06-07T00:00:00Z",
              created_at: "2026-06-07T00:00:00Z",
              updated_at: "2026-06-07T00:00:00Z",
              prerelease: true,
              draft: false,
            },
          ],
          sampleLimit: 100,
        };
      },
    });

    const result = await collectSnapshot(client, "acme/tool", new Date("2026-06-09T00:00:00.000Z"));

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.error.message);
    }

    const summary = result.snapshot.activity.releaseSummary;

    expect(summary).toMatchObject({
      totalCount: 312,
      sampledCount: 2,
      truncated: true,
      stableCount: 1,
      prereleaseCount: 1,
      draftCount: 0,
    });
    expect(summary.stableCount + summary.prereleaseCount).toBe(summary.sampledCount);
    expect(summary.tracks[0]).toMatchObject({ kind: "stable", latestTag: "v1.0.0", releaseCount: 1 });
  });

  test("reports draft releases separately without treating them as a truncated sample", async () => {
    const client = githubClient({
      async getReleaseOverview() {
        return {
          latest: {
            name: "v2.0.0",
            tag_name: "v2.0.0",
            published_at: "2026-06-01T00:00:00Z",
            created_at: "2026-06-01T00:00:00Z",
            updated_at: "2026-06-01T00:00:00Z",
            prerelease: false,
            draft: false,
          },
          count: 2,
          releases: [
            {
              name: "v2.1.0",
              tag_name: "v2.1.0",
              published_at: null,
              created_at: "2026-06-08T00:00:00Z",
              updated_at: "2026-06-08T00:00:00Z",
              prerelease: false,
              draft: true,
            },
            {
              name: "v2.0.0",
              tag_name: "v2.0.0",
              published_at: "2026-06-01T00:00:00Z",
              created_at: "2026-06-01T00:00:00Z",
              updated_at: "2026-06-01T00:00:00Z",
              prerelease: false,
              draft: false,
            },
          ],
          sampleLimit: 100,
        };
      },
    });

    const result = await collectSnapshot(client, "acme/tool", new Date("2026-06-09T00:00:00.000Z"));

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.error.message);
    }

    expect(result.snapshot.activity.releaseSummary).toMatchObject({
      totalCount: 2,
      sampledCount: 1,
      truncated: false,
      stableCount: 1,
      prereleaseCount: 0,
      draftCount: 1,
    });
  });
});

describe("collectUserProfileSnapshot", () => {
  test("collects deterministic GitHub user profile and repository footprint signals", async () => {
    const result = await collectUserProfileSnapshot(userClient(), "octocat", new Date("2026-05-16T00:00:00.000Z"));

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.error.message);
    }

    expect(result.snapshot.profile.login).toBe("octocat");
    expect(result.snapshot.profile.followers).toBe(1200);
    expect(result.snapshot.profile.ageDays).toBeGreaterThan(0);
    expect(result.snapshot.repositories.publicRepoCount).toBe(3);
    expect(result.snapshot.repositories.fetchedCount).toBe(2);
    expect(result.snapshot.repositories.truncated).toBe(true);
    expect(result.snapshot.repositories.totalStars).toBe(15);
    expect(result.snapshot.repositories.totalForks).toBe(3);
    expect(result.snapshot.repositories.recentlyPushedCount).toBe(1);
    expect(result.snapshot.repositories.primaryLanguages[0]).toEqual({
      name: "Ruby",
      repositoryCount: 1,
      percent: 50,
    });
    expect(result.snapshot.repositories.topRepositories[0].fullName).toBe("octocat/hello");
    expect(result.snapshot.warnings).toContain(
      "Repository footprint is based on the first 2 repositories sorted by recent updates.",
    );
  });
});

function githubClient(overrides: Partial<GitHubClient> = {}): GitHubClient {
  return {
    async getRepository() {
      return {
        full_name: "acme/tool",
        description: null,
        html_url: "https://github.com/acme/tool",
        created_at: "2020-01-01T00:00:00Z",
        pushed_at: "2026-05-15T00:00:00Z",
        updated_at: "2026-05-15T00:00:00Z",
        default_branch: "main",
        language: "TypeScript",
        license: null,
        stargazers_count: 100,
        forks_count: 5,
        subscribers_count: 7,
        open_issues_count: 0,
        topics: [],
        archived: false,
        fork: false,
        disabled: false,
        is_template: false,
        size: 128,
      };
    },
    async getLanguages() {
      return {};
    },
    async getCommitOverview() {
      return { latest: null, count: 0 };
    },
    async getReleaseOverview() {
      return { latest: null, count: 0, releases: [], sampleLimit: 100 };
    },
    async getContributors() {
      return { contributors: [], totalCount: 0, fetchLimit: 100, truncated: false };
    },
    async getOpenPullRequestCount() {
      return 0;
    },
    async listDirectory() {
      return [];
    },
    ...overrides,
  } as unknown as GitHubClient;
}

function userClient(overrides: Partial<GitHubClient> = {}): GitHubClient {
  return {
    async getUser() {
      return {
        login: "octocat",
        name: "The Octocat",
        type: "User",
        bio: "GitHub mascot.",
        html_url: "https://github.com/octocat",
        company: "GitHub",
        location: "San Francisco",
        blog: "https://github.blog",
        twitter_username: "github",
        email: null,
        hireable: null,
        created_at: "2011-01-25T18:44:36Z",
        updated_at: "2026-05-01T00:00:00Z",
        public_repos: 3,
        public_gists: 8,
        followers: 1200,
        following: 9,
        site_admin: false,
      };
    },
    async getUserRepositories() {
      return {
        repositories: [
          {
            full_name: "octocat/hello",
            name: "hello",
            description: "Hello world.",
            html_url: "https://github.com/octocat/hello",
            created_at: "2020-01-01T00:00:00Z",
            pushed_at: "2026-05-10T00:00:00Z",
            updated_at: "2026-05-10T00:00:00Z",
            language: "TypeScript",
            stargazers_count: 10,
            forks_count: 2,
            archived: false,
            fork: false,
          },
          {
            full_name: "octocat/old",
            name: "old",
            description: null,
            html_url: "https://github.com/octocat/old",
            created_at: "2018-01-01T00:00:00Z",
            pushed_at: "2025-01-01T00:00:00Z",
            updated_at: "2025-01-01T00:00:00Z",
            language: "Ruby",
            stargazers_count: 5,
            forks_count: 1,
            archived: true,
            fork: false,
          },
        ],
        fetchLimit: 2,
        truncated: true,
      };
    },
    ...overrides,
  } as unknown as GitHubClient;
}

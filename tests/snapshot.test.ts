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
    expect(result.snapshot.metrics.communityFootprint.inputs.watchers).toBe(7);
    expect(Object.hasOwn(result.snapshot.metrics.communityFootprint.inputs, "subscribers")).toBe(false);
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
      return { latest: null, count: 0 };
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

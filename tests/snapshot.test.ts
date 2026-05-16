import { describe, expect, test } from "bun:test";
import type { GitHubClient } from "../src/github/client";
import { collectSnapshot } from "../src/metrics/snapshot";

describe("collectSnapshot", () => {
  test("uses GitHub subscribers_count as repository watchers", async () => {
    const client = {
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
      async getLatestCommit() {
        return null;
      },
      async getReleaseOverview() {
        return { latest: null, count: 0 };
      },
      async getContributors() {
        return { contributors: [], truncated: false };
      },
      async getOpenPullRequestCount() {
        return 0;
      },
      async listDirectory() {
        return [];
      },
    } as unknown as GitHubClient;

    const result = await collectSnapshot(client, "acme/tool", new Date("2026-05-16T00:00:00.000Z"));

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.error.message);
    }

    expect(result.snapshot.repository.stars).toBe(100);
    expect(result.snapshot.repository.watchers).toBe(7);
    expect(result.snapshot.metrics.communityFootprint.inputs.watchers).toBe(7);
    expect(Object.hasOwn(result.snapshot.metrics.communityFootprint.inputs, "subscribers")).toBe(false);
  });
});

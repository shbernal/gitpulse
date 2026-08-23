import { describe, expect, test } from "bun:test";
import { GitHubClient, githubApiVersion } from "../src/github/client";

describe("GitHubClient release overview", () => {
  test("uses the latest stable release instead of the newest prerelease", async () => {
    const client = githubClient({
      async getLatestRelease() {
        return {
          data: {
            name: "v26.5.6",
            tag_name: "v26.5.6",
            published_at: "2026-05-05T18:30:21Z",
            created_at: "2026-05-05T18:02:39Z",
            updated_at: "2026-05-05T18:30:21Z",
            prerelease: false,
            draft: false,
          },
        };
      },
      async listReleases() {
        return {
          data: [
            {
              name: "Nightly Build",
              tag_name: "nightly",
              published_at: "2024-08-07T00:43:43Z",
              created_at: "2026-06-07T13:46:07Z",
              updated_at: "2026-06-07T14:02:06Z",
              prerelease: true,
              draft: false,
            },
          ],
          headers: {
            link: '<https://api.github.com/repositories/1/releases?per_page=1&page=2>; rel="next", <https://api.github.com/repositories/1/releases?per_page=1&page=31>; rel="last"',
          },
        };
      },
    });

    const overview = await client.getReleaseOverview({ owner: "sxyazi", name: "yazi" });

    expect(overview.latest?.tag_name).toBe("v26.5.6");
    expect(overview.latest?.name).toBe("v26.5.6");
    expect(overview.count).toBe(31);
    expect(overview.releases).toHaveLength(1);
    expect(overview.sampleLimit).toBe(100);
  });

  test("treats a missing stable release as no latest release", async () => {
    const client = githubClient({
      async getLatestRelease() {
        throw { status: 404, message: "Not Found" };
      },
      async listReleases() {
        return {
          data: [
            {
              name: "Nightly Build",
              tag_name: "nightly",
              published_at: "2026-06-01T00:00:00Z",
              created_at: "2026-06-01T00:00:00Z",
              updated_at: "2026-06-01T00:00:00Z",
              prerelease: true,
              draft: false,
            },
          ],
          headers: {},
        };
      },
    });

    const overview = await client.getReleaseOverview({ owner: "acme", name: "preview-only" });

    expect(overview.latest).toBeNull();
    expect(overview.count).toBe(1);
    expect(overview.releases[0]?.tag_name).toBe("nightly");
  });
});

type FakeReposApi = {
  getLatestRelease: (options: { owner: string; repo: string }) => Promise<{ data: unknown }>;
  listReleases: (options: { owner: string; repo: string; per_page: number }) => Promise<{
    data: unknown[];
    headers: { link?: string };
  }>;
};

function githubClient(repos: FakeReposApi): GitHubClient {
  const client = new GitHubClient("");
  (client as unknown as { octokit: { rest: { repos: FakeReposApi } } }).octokit = {
    rest: { repos },
  };
  return client;
}

describe("GitHubClient request headers", () => {
  test("pins the GitHub API version and media type on outgoing requests", async () => {
    const originalFetch = globalThis.fetch;
    let sent: Headers | undefined;

    globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
      sent = new Headers(init?.headers);
      return new Response(JSON.stringify({ full_name: "acme/widget" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;

    try {
      await new GitHubClient("").getRepository({ owner: "acme", name: "widget" });
    } finally {
      globalThis.fetch = originalFetch;
    }

    expect(sent?.get("x-github-api-version")).toBe(githubApiVersion);
    expect(sent?.get("accept")).toBe("application/vnd.github+json");
  });
});

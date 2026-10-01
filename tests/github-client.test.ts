import { describe, expect, test } from "bun:test";
import { version as packageVersion } from "../package.json";
import { GitHubApiError, GitHubClient, githubApiVersion } from "../src/github/client";
import { collectSnapshot } from "../src/metrics/snapshot";
import { renderRepoJson } from "../src/render/json";

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

describe("GitHubClient star mutations", () => {
  test("stars and unstars through the authenticated user endpoints", async () => {
    const calls: string[] = [];
    const client = starClient({
      async starRepoForAuthenticatedUser(options) {
        calls.push(`star ${options.owner}/${options.repo}`);
      },
      async unstarRepoForAuthenticatedUser(options) {
        calls.push(`unstar ${options.owner}/${options.repo}`);
      },
    });

    await client.starRepositoryForAuthenticatedUser({ owner: "acme", name: "tool" });
    await client.unstarRepositoryForAuthenticatedUser({ owner: "acme", name: "tool" });

    expect(calls).toEqual(["star acme/tool", "unstar acme/tool"]);
  });

  test("names the missing token scope when GitHub refuses the write", async () => {
    const client = starClient({
      async starRepoForAuthenticatedUser() {
        throw {
          status: 403,
          message: "Resource not accessible by personal access token",
          response: { headers: { "x-ratelimit-remaining": "4999" } },
        };
      },
    });

    const error = await captureError(() => client.starRepositoryForAuthenticatedUser({ owner: "acme", name: "tool" }));

    expect(error).toBeInstanceOf(GitHubApiError);
    expect((error as GitHubApiError).code).toBe("insufficient_scope");
    expect(error?.message).toContain("public_repo");
  });

  test("separates an invisible repository from a plain not-found message", async () => {
    const client = starClient({
      async unstarRepoForAuthenticatedUser() {
        throw { status: 404, message: "Not Found" };
      },
    });

    const error = await captureError(() =>
      client.unstarRepositoryForAuthenticatedUser({ owner: "acme", name: "ghost" }),
    );

    expect((error as GitHubApiError).code).toBe("not_found");
    expect(error?.message).toBe(
      "Could not unstar acme/ghost. The repository does not exist, or the token cannot see it.",
    );
  });

  test("keeps a rate limit answer intact", async () => {
    const client = starClient({
      async starRepoForAuthenticatedUser() {
        throw {
          status: 403,
          message: "API rate limit exceeded",
          response: { headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": "1780000000" } },
        };
      },
    });

    const error = await captureError(() => client.starRepositoryForAuthenticatedUser({ owner: "acme", name: "tool" }));

    expect((error as GitHubApiError).code).toBe("rate_limited");
  });
});

type FakeActivityApi = Partial<{
  starRepoForAuthenticatedUser: (options: { owner: string; repo: string }) => Promise<void>;
  unstarRepoForAuthenticatedUser: (options: { owner: string; repo: string }) => Promise<void>;
}>;

function starClient(activity: FakeActivityApi): GitHubClient {
  const client = new GitHubClient("token");
  (client as unknown as { octokit: { rest: { activity: FakeActivityApi } } }).octokit = {
    rest: { activity },
  };
  return client;
}

async function captureError(fn: () => Promise<unknown>): Promise<Error | undefined> {
  try {
    await fn();
  } catch (error) {
    return error as Error;
  }

  return undefined;
}

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

    globalThis.fetch = (async (_input: unknown, init?: RequestInit) => {
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
    expect(sent?.get("user-agent")).toStartWith(`gitpulse/${packageVersion} `);
  });
});

async function failureFor(status: number, headers: Record<string, string>, message = "Rate limited") {
  const originalFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = (async () => {
    requests += 1;
    return new Response(JSON.stringify({ message }), {
      status,
      headers: { "content-type": "application/json", ...headers },
    });
  }) as unknown as typeof fetch;

  try {
    const error = await captureError(() => new GitHubClient("").getRepository({ owner: "acme", name: "widget" }));
    return { error: error as GitHubApiError, requests };
  } finally {
    globalThis.fetch = originalFetch;
  }
}

describe("GitHubClient rate limits", () => {
  test("reads a 429 with retry-after as a rate limit and does not wait it out", async () => {
    const before = Date.now();
    const { error, requests } = await failureFor(429, { "retry-after": "60" });
    const reset = Date.parse(error.rateLimitReset ?? "");

    expect(error.code).toBe("rate_limited");
    expect(requests).toBe(1);
    expect(reset - before).toBeGreaterThanOrEqual(59_000);
    expect(reset - before).toBeLessThan(65_000);
  });

  test("reads a 403 secondary rate limit without a zero quota as a rate limit", async () => {
    const { error } = await failureFor(
      403,
      { "retry-after": "120" },
      "You have exceeded a secondary rate limit. Please wait a few minutes before you try again.",
    );

    expect(error.code).toBe("rate_limited");
    expect(error.message).toBe("GitHub API secondary rate limit exceeded.");
  });

  test("reads an exhausted primary quota as a rate limit with its reset time", async () => {
    const { error, requests } = await failureFor(403, {
      "x-ratelimit-remaining": "0",
      "x-ratelimit-reset": String(Math.floor(Date.now() / 1000) + 1800),
    });

    expect(error.code).toBe("rate_limited");
    expect(requests).toBe(1);
    expect(error.rateLimitReset).toBeDefined();
  });

  test("keeps an ordinary 403 as a GitHub error", async () => {
    const { error } = await failureFor(403, { "x-ratelimit-remaining": "5" }, "Resource not accessible");

    expect(error.code).toBe("github_error");
  });

  test("carries the rate limit code and reset time into the JSON envelope", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ message: "API rate limit exceeded" }), {
        status: 403,
        headers: {
          "content-type": "application/json",
          "x-ratelimit-remaining": "0",
          "x-ratelimit-reset": "1780000000",
        },
      })) as unknown as typeof fetch;

    try {
      const result = await collectSnapshot(new GitHubClient(""), "acme/widget");
      const json = JSON.parse(renderRepoJson(result));

      expect(json.result.ok).toBe(false);
      expect(json.result.error.code).toBe("rate_limited");
      expect(json.result.error.message).toBe("GitHub API rate limit exceeded. Resets at 2026-05-28T20:26:40.000Z.");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

type FakeReply = { status?: number; body: unknown; lastPage?: number; nextPage?: number };

/** Answers every GitHub request through `route` and records the URLs the client asked for. */
async function withFakeGitHub<T>(route: (url: URL) => FakeReply, fn: (client: GitHubClient) => Promise<T>) {
  const originalFetch = globalThis.fetch;
  const urls: URL[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    urls.push(url);
    const reply = route(url);
    const pageLink = (page: number, rel: string) => {
      const target = new URL(url);
      target.searchParams.set("page", String(page));
      return `<${target}>; rel="${rel}"`;
    };
    const link = [
      reply.nextPage ? pageLink(reply.nextPage, "next") : null,
      reply.lastPage ? pageLink(reply.lastPage, "last") : null,
    ]
      .filter(Boolean)
      .join(", ");

    return new Response(JSON.stringify(reply.body), {
      status: reply.status ?? 200,
      headers: { "content-type": "application/json", ...(link ? { link } : {}) },
    });
  }) as unknown as typeof fetch;

  try {
    return { value: await fn(new GitHubClient("")), urls };
  } finally {
    globalThis.fetch = originalFetch;
  }
}

function people(count: number, offset = 0) {
  return Array.from({ length: count }, (_, index) => ({ login: `user${offset + index}`, contributions: 100 - index }));
}

describe("GitHubClient contributors", () => {
  test("stops at the fetch limit and reads the total from a one-per-page probe", async () => {
    const { value, urls } = await withFakeGitHub(
      (url) => {
        const perPage = Number(url.searchParams.get("per_page"));
        const page = Number(url.searchParams.get("page") ?? "1");
        return perPage === 1
          ? { body: people(1), nextPage: 2, lastPage: 250 }
          : { body: people(perPage, (page - 1) * perPage), nextPage: page + 1, lastPage: 3 };
      },
      (client) => client.getContributors({ owner: "acme", name: "tool" }, 150),
    );

    expect(value.contributors).toHaveLength(150);
    expect(value.totalCount).toBe(250);
    expect(value.truncated).toBe(true);
    expect(urls.map((url) => url.searchParams.get("page"))).toEqual(["1", "2", null]);
  });

  test("counts every contributor when all pages fit under the limit", async () => {
    const { value, urls } = await withFakeGitHub(
      (url) =>
        url.searchParams.get("page") === "1"
          ? { body: people(100), nextPage: 2, lastPage: 2 }
          : { body: people(30, 100) },
      (client) => client.getContributors({ owner: "acme", name: "tool" }, 500),
    );

    expect(value.totalCount).toBe(130);
    expect(value.truncated).toBe(false);
    expect(urls).toHaveLength(2);
  });

  test("takes the exact total from the first page when fetching one contributor", async () => {
    const { value, urls } = await withFakeGitHub(
      () => ({ body: people(1), nextPage: 2, lastPage: 42 }),
      (client) => client.getContributors({ owner: "acme", name: "tool" }, 1),
    );

    expect(value.totalCount).toBe(42);
    expect(value.truncated).toBe(true);
    expect(urls).toHaveLength(1);
  });

  test("leaves the total unknown when the count probe fails", async () => {
    const { value } = await withFakeGitHub(
      (url) =>
        url.searchParams.get("per_page") === "1"
          ? { status: 422, body: { message: "Unprocessable" } }
          : { body: people(2), nextPage: 2, lastPage: 9 },
      (client) => client.getContributors({ owner: "acme", name: "tool" }, 2),
    );

    expect(value.totalCount).toBeNull();
    expect(value.truncated).toBe(true);
  });
});

function userRepos(count: number) {
  return Array.from({ length: count }, (_, index) => ({ name: `r${index}` }));
}

describe("GitHubClient account repositories", () => {
  test("stops paging at the fetch limit and reports truncation", async () => {
    const { value, urls } = await withFakeGitHub(
      (url) => ({ body: userRepos(Number(url.searchParams.get("per_page"))), nextPage: 2, lastPage: 4 }),
      (client) => client.getUserRepositories("octocat", "User", 100),
    );

    expect(value.repositories).toHaveLength(100);
    expect(value.truncated).toBe(true);
    expect(urls).toHaveLength(1);
    expect(urls[0].pathname).toBe("/users/octocat/repos");
  });

  test("lists an organization through the org endpoint", async () => {
    const { value, urls } = await withFakeGitHub(
      () => ({ body: userRepos(3) }),
      (client) => client.getUserRepositories("acme", "Organization", 100),
    );

    expect(value.truncated).toBe(false);
    expect(urls[0].pathname).toBe("/orgs/acme/repos");
    expect(urls[0].searchParams.get("type")).toBe("public");
  });
});

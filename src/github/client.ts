import { Octokit } from "octokit";
import type {
  RepoRef,
  SearchRepositoryOrder,
  SearchRepositorySort,
  StarredRepositoryDirection,
  StarredRepositorySort,
} from "../types";
import { formatRepoRef } from "../util/repo-ref";
import type {
  CommitOverview,
  ContributorOverview,
  GitHubCommit,
  GitHubContentItem,
  GitHubContributor,
  GitHubRelease,
  GitHubRepository,
  GitHubSearchRepository,
  GitHubStarredRepository,
  GitHubUser,
  GitHubUserRepository,
  ReleaseOverview,
  SearchRepositoryOverview,
  UserRepositoryOverview,
} from "./types";

export const githubApiVersion = "2026-03-10";
const defaultContributorFetchLimit = 100;
const defaultUserRepositoryFetchLimit = 100;
const githubPageSizeLimit = 100;

export class GitHubApiError extends Error {
  readonly status?: number;
  readonly code: string;
  readonly rateLimitReset?: string;

  constructor(message: string, options: { status?: number; code?: string; rateLimitReset?: string } = {}) {
    super(message);
    this.name = "GitHubApiError";
    this.status = options.status;
    this.code = options.code ?? "github_error";
    this.rateLimitReset = options.rateLimitReset;
  }
}

export class GitHubClient {
  private readonly octokit: Octokit;

  constructor(token = process.env.GITHUB_TOKEN) {
    this.octokit = new Octokit({
      auth: token || undefined,
      log: {
        debug: console.debug,
        error: console.error,
        info: console.info,
        warn: suppressGitHubApiVersionDeprecationWarnings,
      },
      userAgent: "gitpulse/0.1.0",
      request: {
        headers: {
          accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": githubApiVersion,
        },
      },
    });
  }

  async getRepository(ref: RepoRef): Promise<GitHubRepository> {
    try {
      const response = await this.octokit.rest.repos.get({
        owner: ref.owner,
        repo: ref.name,
      });

      return response.data as GitHubRepository;
    } catch (error) {
      throw normalizeGitHubError(error, `Could not fetch ${formatRepoRef(ref)}.`);
    }
  }

  async getUser(login: string): Promise<GitHubUser> {
    try {
      const response = await this.octokit.rest.users.getByUsername({
        username: login,
      });

      return response.data as GitHubUser;
    } catch (error) {
      throw normalizeGitHubError(error, `Could not fetch GitHub user ${login}.`);
    }
  }

  async getUserRepositories(
    login: string,
    accountType: string,
    fetchLimit = defaultUserRepositoryFetchLimit,
  ): Promise<UserRepositoryOverview> {
    try {
      const limit = normalizeFetchLimit(fetchLimit, defaultUserRepositoryFetchLimit);
      const perPage = Math.min(limit, githubPageSizeLimit);
      const repositories: GitHubUserRepository[] = [];
      let page = 1;
      let hasMorePages = false;

      while (repositories.length < limit) {
        const response =
          accountType.toLowerCase() === "organization"
            ? await this.octokit.rest.repos.listForOrg({
                org: login,
                type: "public",
                sort: "updated",
                direction: "desc",
                per_page: perPage,
                page,
              })
            : await this.octokit.rest.repos.listForUser({
                username: login,
                type: "owner",
                sort: "updated",
                direction: "desc",
                per_page: perPage,
                page,
              });
        const pageRepositories = response.data as GitHubUserRepository[];

        repositories.push(...pageRepositories);
        hasMorePages = hasNextPage(response.headers.link);

        if (!hasMorePages || pageRepositories.length === 0) {
          break;
        }

        page += 1;
      }

      return {
        repositories: repositories.slice(0, limit),
        fetchLimit: limit,
        truncated: hasMorePages,
      };
    } catch (error) {
      throw normalizeGitHubError(error, `Could not fetch public repositories for ${login}.`);
    }
  }

  async getAuthenticatedUserStarredRepositories(options: {
    sort: StarredRepositorySort;
    direction: StarredRepositoryDirection;
  }): Promise<GitHubStarredRepository[]> {
    try {
      const repositories = await this.octokit.paginate(this.octokit.rest.activity.listReposStarredByAuthenticatedUser, {
        sort: options.sort,
        direction: options.direction,
        per_page: githubPageSizeLimit,
      });

      return repositories as GitHubStarredRepository[];
    } catch (error) {
      throw normalizeGitHubError(error, "Could not fetch starred repositories.");
    }
  }

  async searchRepositories(options: {
    query: string;
    sort: SearchRepositorySort;
    order: SearchRepositoryOrder;
    limit: number;
  }): Promise<SearchRepositoryOverview> {
    try {
      const response = await this.octokit.rest.search.repos({
        q: options.query,
        ...(options.sort === "best-match" ? {} : { sort: options.sort, order: options.order }),
        per_page: Math.min(options.limit, githubPageSizeLimit),
      });

      return {
        repositories: response.data.items.slice(0, options.limit) as GitHubSearchRepository[],
        totalCount: response.data.total_count,
        incompleteResults: response.data.incomplete_results,
      };
    } catch (error) {
      throw normalizeGitHubError(error, `Could not search repositories for "${options.query}".`);
    }
  }

  async getLanguages(ref: RepoRef): Promise<Record<string, number>> {
    try {
      const response = await this.octokit.rest.repos.listLanguages({
        owner: ref.owner,
        repo: ref.name,
      });

      return response.data as Record<string, number>;
    } catch (error) {
      throw normalizeGitHubError(error, `Could not fetch languages for ${formatRepoRef(ref)}.`);
    }
  }

  async getCommitOverview(ref: RepoRef, branch: string): Promise<CommitOverview> {
    try {
      const response = await this.octokit.rest.repos.listCommits({
        owner: ref.owner,
        repo: ref.name,
        sha: branch,
        per_page: 1,
      });

      return {
        latest: (response.data[0] as GitHubCommit | undefined) ?? null,
        count: countFromLinkHeader(response.headers.link, response.data.length),
      };
    } catch (error) {
      throw normalizeGitHubError(error, `Could not fetch commits for ${formatRepoRef(ref)}.`);
    }
  }

  async getLatestCommit(ref: RepoRef, branch: string): Promise<GitHubCommit | null> {
    return (await this.getCommitOverview(ref, branch)).latest;
  }

  async getReleaseOverview(ref: RepoRef): Promise<ReleaseOverview> {
    try {
      const response = await this.octokit.rest.repos.listReleases({
        owner: ref.owner,
        repo: ref.name,
        per_page: 1,
      });

      return {
        latest: (response.data[0] as GitHubRelease | undefined) ?? null,
        count: countFromLinkHeader(response.headers.link, response.data.length),
      };
    } catch (error) {
      throw normalizeGitHubError(error, `Could not fetch releases for ${formatRepoRef(ref)}.`);
    }
  }

  async getContributors(ref: RepoRef, fetchLimit = defaultContributorFetchLimit): Promise<ContributorOverview> {
    try {
      const limit = normalizeFetchLimit(fetchLimit, defaultContributorFetchLimit);
      const perPage = Math.min(limit, githubPageSizeLimit);
      const contributors: GitHubContributor[] = [];
      let page = 1;
      let hasMorePages = false;
      let collectedAllPages = false;
      let exactTotalCount: number | null = null;

      while (contributors.length < limit) {
        const response = await this.octokit.rest.repos.listContributors({
          owner: ref.owner,
          repo: ref.name,
          anon: "true",
          per_page: perPage,
          page,
        });
        const pageContributors = response.data as GitHubContributor[];

        if (page === 1 && perPage === 1) {
          exactTotalCount = countFromLinkHeader(response.headers.link, pageContributors.length);
        }

        contributors.push(...pageContributors);
        hasMorePages = hasNextPage(response.headers.link);

        if (!hasMorePages || pageContributors.length === 0) {
          collectedAllPages = true;
          break;
        }

        page += 1;
      }

      const fetchedContributors = contributors.slice(0, limit);
      const totalCount =
        exactTotalCount ?? (collectedAllPages ? contributors.length : await this.getContributorTotalCount(ref));

      return {
        contributors: fetchedContributors,
        totalCount,
        fetchLimit: limit,
        truncated: totalCount === null ? hasMorePages : fetchedContributors.length < totalCount,
      };
    } catch (error) {
      throw normalizeGitHubError(error, `Could not fetch contributors for ${formatRepoRef(ref)}.`);
    }
  }

  private async getContributorTotalCount(ref: RepoRef): Promise<number | null> {
    try {
      const response = await this.octokit.rest.repos.listContributors({
        owner: ref.owner,
        repo: ref.name,
        anon: "true",
        per_page: 1,
      });

      return countFromLinkHeader(response.headers.link, response.data.length);
    } catch {
      return null;
    }
  }

  async getOpenPullRequestCount(ref: RepoRef): Promise<number> {
    try {
      const response = await this.octokit.rest.pulls.list({
        owner: ref.owner,
        repo: ref.name,
        state: "open",
        per_page: 1,
      });

      return countFromLinkHeader(response.headers.link, response.data.length);
    } catch (error) {
      throw normalizeGitHubError(error, `Could not fetch open pull requests for ${formatRepoRef(ref)}.`);
    }
  }

  async listDirectory(ref: RepoRef, path: string): Promise<GitHubContentItem[]> {
    try {
      const response = await this.octokit.rest.repos.getContent({
        owner: ref.owner,
        repo: ref.name,
        path,
      });

      if (!Array.isArray(response.data)) {
        return [];
      }

      return response.data
        .filter((item) => isFileContentItem(item.type))
        .map((item) => ({
          type: item.type,
          name: item.name,
          path: item.path,
        }));
    } catch (error) {
      if (isNotFound(error)) {
        return [];
      }

      throw normalizeGitHubError(error, `Could not fetch directory ${path || "/"} for ${formatRepoRef(ref)}.`);
    }
  }
}

function isFileContentItem(type: string): type is "file" {
  return type === "file";
}

function suppressGitHubApiVersionDeprecationWarnings(message?: unknown, ...args: unknown[]): void {
  if (
    typeof message === "string" &&
    message.startsWith("[@octokit/request]") &&
    message.includes(" is deprecated.") &&
    message.includes("rest/about-the-rest-api/api-versions")
  ) {
    return;
  }

  console.warn(message, ...args);
}

function normalizeGitHubError(error: unknown, fallbackMessage: string): GitHubApiError {
  const candidate = error as {
    status?: number;
    message?: string;
    response?: {
      headers?: Record<string, string | undefined>;
    };
  };

  const status = candidate.status;
  const headers = candidate.response?.headers ?? {};
  const reset = headers["x-ratelimit-reset"];
  const remaining = headers["x-ratelimit-remaining"];

  if (status === 404) {
    return new GitHubApiError(candidate.message || fallbackMessage, {
      status,
      code: "not_found",
    });
  }

  if (status === 403 && remaining === "0") {
    return new GitHubApiError("GitHub API rate limit exceeded.", {
      status,
      code: "rate_limited",
      rateLimitReset: reset ? new Date(Number(reset) * 1000).toISOString() : undefined,
    });
  }

  if (status === 401) {
    return new GitHubApiError("GitHub authentication failed. Check GITHUB_TOKEN.", {
      status,
      code: "unauthorized",
    });
  }

  return new GitHubApiError(candidate.message || fallbackMessage, {
    status,
    code: "github_error",
  });
}

function isNotFound(error: unknown): boolean {
  return typeof error === "object" && error !== null && "status" in error && error.status === 404;
}

function hasNextPage(linkHeader: string | undefined): boolean {
  return Boolean(linkHeader?.includes('rel="next"'));
}

function normalizeFetchLimit(value: number, fallback: number): number {
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function countFromLinkHeader(linkHeader: string | undefined, fallback: number): number {
  if (!linkHeader) {
    return fallback;
  }

  const lastLink = linkHeader
    .split(",")
    .map((link) => link.trim())
    .find((link) => link.includes('rel="last"'));

  if (!lastLink) {
    return fallback;
  }

  const match = /[?&]page=(\d+)/.exec(lastLink);
  return match ? Number(match[1]) : fallback;
}

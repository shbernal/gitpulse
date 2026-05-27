import { GitHubApiError, type GitHubClient } from "../github/client";
import type { GitHubSearchRepository } from "../github/types";
import type {
  SearchRepositoryList,
  SearchRepositoryOrder,
  SearchRepositoryResult,
  SearchRepositorySort,
  SearchRepositorySummary,
  SnapshotError,
} from "../types";

export type SearchRepositoryCollectionOptions = {
  query: string;
  sort: SearchRepositorySort;
  order: SearchRepositoryOrder;
  limit: number;
};

export async function collectSearchRepositories(
  client: GitHubClient,
  now = new Date(),
  options: SearchRepositoryCollectionOptions,
): Promise<SearchRepositoryResult> {
  try {
    const result = await client.searchRepositories(options);
    const list: SearchRepositoryList = {
      fetchedAt: now.toISOString(),
      query: options.query,
      sort: options.sort,
      order: options.order,
      limit: options.limit,
      totalCount: result.totalCount,
      incompleteResults: result.incompleteResults,
      repositories: result.repositories.map(normalizeSearchRepository),
    };

    return { ok: true, list };
  } catch (error) {
    return {
      ok: false,
      error: errorToSnapshotError(error),
    };
  }
}

function normalizeSearchRepository(repository: GitHubSearchRepository): SearchRepositorySummary {
  return {
    fullName: repository.full_name,
    name: repository.name,
    description: repository.description,
    url: repository.html_url,
    primaryLanguage: repository.language,
    stars: repository.stargazers_count,
    forks: repository.forks_count,
    archived: repository.archived,
    fork: repository.fork,
    pushedAt: repository.pushed_at,
    updatedAt: repository.updated_at,
    score: typeof repository.score === "number" ? repository.score : null,
  };
}

function errorToSnapshotError(error: unknown): SnapshotError {
  if (error instanceof GitHubApiError) {
    return {
      message: error.message,
      status: error.status,
      code: error.code,
    };
  }

  if (error instanceof Error) {
    return {
      message: error.message,
      code: error.name,
    };
  }

  return {
    message: "Unknown error.",
    code: "unknown",
  };
}

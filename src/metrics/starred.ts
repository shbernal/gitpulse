import type { GitHubClient } from "../github/client";
import type { GitHubStarredRepository } from "../github/types";
import type {
  StarredRepositoryDirection,
  StarredRepositoryList,
  StarredRepositoryResult,
  StarredRepositorySort,
  StarredRepositorySummary,
} from "../types";
import { toSnapshotError } from "./errors";

export type StarredCollectionOptions = {
  sort: StarredRepositorySort;
  direction: StarredRepositoryDirection;
};

export async function collectStarredRepositories(
  client: GitHubClient,
  now = new Date(),
  options: StarredCollectionOptions,
): Promise<StarredRepositoryResult> {
  try {
    const repositories = await client.getAuthenticatedUserStarredRepositories(options);
    const list: StarredRepositoryList = {
      fetchedAt: now.toISOString(),
      sort: options.sort,
      direction: options.direction,
      repositories: repositories.map(normalizeStarredRepository),
    };

    return { ok: true, list };
  } catch (error) {
    return {
      ok: false,
      error: toSnapshotError(error),
    };
  }
}

function normalizeStarredRepository(repository: GitHubStarredRepository): StarredRepositorySummary {
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
  };
}

import { GitHubApiError, type GitHubClient } from "../github/client";
import type { GitHubForkRepository } from "../github/types";
import type { ForkList, ForkResult, ForkSummary, RepoRef, SnapshotError } from "../types";
import { daysSince } from "../util/dates";
import { formatRepoRef } from "../util/repo-ref";

export async function collectMostStarredForks(
  client: GitHubClient,
  ref: RepoRef,
  options: { limit: number },
  now = new Date(),
): Promise<ForkResult> {
  try {
    const forks = await client.getMostStarredForks(ref, options.limit);
    const list: ForkList = {
      fetchedAt: now.toISOString(),
      repository: formatRepoRef(ref),
      limit: options.limit,
      forks: forks.map((fork) => normalizeFork(fork, now)),
    };

    return { ok: true, list };
  } catch (error) {
    return { ok: false, error: errorToSnapshotError(error) };
  }
}

function normalizeFork(fork: GitHubForkRepository, now: Date): ForkSummary {
  return {
    fullName: fork.full_name,
    owner: fork.owner.login,
    description: fork.description,
    url: fork.html_url,
    primaryLanguage: fork.language,
    stars: fork.stargazers_count ?? 0,
    forks: fork.forks_count ?? 0,
    openIssues: fork.open_issues_count ?? 0,
    archived: Boolean(fork.archived),
    createdAt: fork.created_at,
    pushedAt: fork.pushed_at,
    daysSinceLastPush: daysSince(fork.pushed_at, now),
    pushedSinceFork: hasPushedSinceFork(fork),
  };
}

function hasPushedSinceFork(fork: GitHubForkRepository): boolean {
  if (!fork.pushed_at || !fork.created_at) {
    return false;
  }

  return new Date(fork.pushed_at).getTime() > new Date(fork.created_at).getTime();
}

function errorToSnapshotError(error: unknown): SnapshotError {
  if (error instanceof GitHubApiError) {
    return { message: error.message, status: error.status, code: error.code };
  }

  if (error instanceof Error) {
    return { message: error.message, code: error.name };
  }

  return { message: "Unknown error." };
}

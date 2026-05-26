import { GitHubApiError, GitHubClient } from "../github/client";
import type { GitHubUser, GitHubUserRepository, UserRepositoryOverview } from "../github/types";
import type {
  SnapshotError,
  UserLanguageFootprint,
  UserProfileFacts,
  UserProfileResult,
  UserProfileSnapshot,
  UserRepositoryFootprint,
  UserRepositorySummary,
} from "../types";
import { daysSince } from "../util/dates";
import { parseGitHubLogin } from "../util/github-login";

type OptionalData<T> = {
  value: T | null;
  warning: string | null;
};

export type UserProfileCollectionOptions = {
  repositoryFetchLimit?: number;
};

const defaultUserRepositoryFetchLimit = 100;
const recentPushWindowDays = 90;
const displayedLanguageLimit = 5;
const displayedRecentRepositoryLimit = 5;
const displayedTopRepositoryLimit = 10;

export async function collectUserProfileSnapshot(
  client: GitHubClient,
  input: string,
  now = new Date(),
  options: UserProfileCollectionOptions = {},
): Promise<UserProfileResult> {
  let login: string;

  try {
    login = parseGitHubLogin(input);
  } catch (error) {
    return createUserProfileFailure(input, error);
  }

  try {
    const profile = await client.getUser(login);
    const repositoryFetchLimit = options.repositoryFetchLimit ?? defaultUserRepositoryFetchLimit;
    const repositories = await optional(
      () => client.getUserRepositories(profile.login, profile.type, repositoryFetchLimit),
      "public repositories",
    );
    const warnings = [repositories.warning].filter((warning): warning is string => Boolean(warning));

    return {
      ok: true,
      snapshot: buildUserProfileSnapshot({
        profile,
        repositories: repositories.value ?? {
          repositories: [],
          fetchLimit: repositoryFetchLimit,
          truncated: false,
        },
        warnings,
        now,
      }),
    };
  } catch (error) {
    return {
      ok: false,
      login,
      input,
      error: errorToSnapshotError(error),
    };
  }
}

function buildUserProfileSnapshot(input: {
  profile: GitHubUser;
  repositories: UserRepositoryOverview;
  warnings: string[];
  now: Date;
}): UserProfileSnapshot {
  const profile = buildProfileFacts(input.profile, input.now);
  const repositorySummaries = input.repositories.repositories.map((repository) => buildRepositorySummary(repository, input.now));
  const footprint = buildRepositoryFootprint(profile.publicRepos, repositorySummaries, input.repositories);
  const warnings = [...input.warnings];

  if (footprint.truncated && footprint.fetchedCount > 0) {
    warnings.push(
      `Repository footprint is based on the first ${footprint.fetchedCount} repositories sorted by recent updates.`,
    );
  }

  return {
    login: profile.login,
    fetchedAt: input.now.toISOString(),
    profile,
    repositories: footprint,
    warnings,
  };
}

function buildProfileFacts(profile: GitHubUser, now: Date): UserProfileFacts {
  return {
    login: profile.login,
    name: emptyToNull(profile.name),
    type: profile.type,
    bio: emptyToNull(profile.bio),
    url: profile.html_url,
    company: emptyToNull(profile.company),
    location: emptyToNull(profile.location),
    blog: normalizeBlog(profile.blog),
    twitterUsername: emptyToNull(profile.twitter_username),
    email: emptyToNull(profile.email),
    hireable: profile.hireable,
    createdAt: profile.created_at,
    updatedAt: profile.updated_at,
    ageDays: daysSince(profile.created_at, now) ?? 0,
    daysSinceUpdated: daysSince(profile.updated_at, now),
    publicRepos: profile.public_repos,
    publicGists: profile.public_gists,
    followers: profile.followers,
    following: profile.following,
    siteAdmin: profile.site_admin,
  };
}

function buildRepositorySummary(repository: GitHubUserRepository, now: Date): UserRepositorySummary {
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
    createdAt: repository.created_at,
    pushedAt: repository.pushed_at,
    updatedAt: repository.updated_at,
    daysSinceLastPush: daysSince(repository.pushed_at, now),
  };
}

function buildRepositoryFootprint(
  publicRepoCount: number,
  repositories: UserRepositorySummary[],
  overview: UserRepositoryOverview,
): UserRepositoryFootprint {
  const recentlyPushed = repositories
    .filter((repository) => repository.daysSinceLastPush !== null && repository.daysSinceLastPush <= recentPushWindowDays)
    .sort(compareRecentRepositories);

  return {
    publicRepoCount,
    fetchedCount: repositories.length,
    fetchLimit: overview.fetchLimit,
    truncated: overview.truncated || repositories.length < publicRepoCount,
    recentPushWindowDays,
    recentlyPushedCount: recentlyPushed.length,
    totalStars: repositories.reduce((sum, repository) => sum + repository.stars, 0),
    totalForks: repositories.reduce((sum, repository) => sum + repository.forks, 0),
    archivedCount: repositories.filter((repository) => repository.archived).length,
    forkCount: repositories.filter((repository) => repository.fork).length,
    primaryLanguages: buildLanguageFootprint(repositories),
    topRepositories: [...repositories].sort(compareTopRepositories).slice(0, displayedTopRepositoryLimit),
    recentlyPushedRepositories: recentlyPushed.slice(0, displayedRecentRepositoryLimit),
  };
}

function buildLanguageFootprint(repositories: UserRepositorySummary[]): UserLanguageFootprint[] {
  const counts = new Map<string, number>();

  for (const repository of repositories) {
    if (!repository.primaryLanguage) {
      continue;
    }

    counts.set(repository.primaryLanguage, (counts.get(repository.primaryLanguage) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([name, repositoryCount]) => ({
      name,
      repositoryCount,
      percent: repositories.length > 0 ? Math.round((repositoryCount / repositories.length) * 1000) / 10 : 0,
    }))
    .sort((left, right) => right.repositoryCount - left.repositoryCount || left.name.localeCompare(right.name))
    .slice(0, displayedLanguageLimit);
}

function compareTopRepositories(left: UserRepositorySummary, right: UserRepositorySummary): number {
  return (
    right.stars - left.stars ||
    right.forks - left.forks ||
    timestamp(right.pushedAt) - timestamp(left.pushedAt) ||
    left.fullName.localeCompare(right.fullName)
  );
}

function compareRecentRepositories(left: UserRepositorySummary, right: UserRepositorySummary): number {
  return timestamp(right.pushedAt) - timestamp(left.pushedAt) || left.fullName.localeCompare(right.fullName);
}

async function optional<T>(fn: () => Promise<T>, label: string): Promise<OptionalData<T>> {
  try {
    return {
      value: await fn(),
      warning: null,
    };
  } catch (error) {
    const snapshotError = errorToSnapshotError(error);
    return {
      value: null,
      warning: `Could not fetch ${label}: ${snapshotError.message}`,
    };
  }
}

function timestamp(value: string | null): number {
  if (!value) {
    return 0;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeBlog(value: string | null): string | null {
  const normalized = emptyToNull(value);

  if (!normalized) {
    return null;
  }

  return normalized;
}

function emptyToNull(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function errorToSnapshotError(error: unknown): SnapshotError {
  if (error instanceof GitHubApiError) {
    return {
      message: error.rateLimitReset
        ? `${error.message} Resets at ${error.rateLimitReset}.`
        : error.message,
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

export function createUserProfileFailure(input: string, error: unknown): UserProfileResult {
  let login: string | null = null;

  try {
    login = parseGitHubLogin(input);
  } catch {
    login = null;
  }

  return {
    ok: false,
    login,
    input,
    error: errorToSnapshotError(error),
  };
}

import { GitHubApiError, GitHubClient } from "../github/client";
import type {
  CommitOverview,
  ContributorOverview,
  GitHubContentItem,
  GitHubRepository,
  ReleaseOverview,
} from "../github/types";
import type {
  ContributorSignals,
  DocumentationSignal,
  DocumentationSignals,
  LanguageBreakdown,
  RepoRef,
  RepoSnapshot,
  SnapshotError,
  SnapshotResult,
} from "../types";
import { daysSince } from "../util/dates";
import { formatRepoRef, parseRepoRef } from "../util/repo-ref";
import { buildCompositeMetrics } from "./composite";

type OptionalData<T> = {
  value: T | null;
  warning: string | null;
};

export type SnapshotCollectionOptions = {
  contributorFetchLimit?: number;
};

const docsCandidates = {
  readme: ["README.md", "README", "README.rst", "README.txt"],
  changelog: ["CHANGELOG.md", "CHANGELOG", "HISTORY.md", "NEWS.md"],
  contributing: ["CONTRIBUTING.md", "CONTRIBUTING"],
  codeOfConduct: ["CODE_OF_CONDUCT.md", "CODE_OF_CONDUCT"],
  security: ["SECURITY.md", "SECURITY"],
} as const;

const defaultContributorFetchLimit = 100;

export async function collectSnapshot(
  client: GitHubClient,
  input: string,
  now = new Date(),
  options: SnapshotCollectionOptions = {},
): Promise<SnapshotResult> {
  let ref: RepoRef;

  try {
    ref = parseRepoRef(input);
  } catch (error) {
    return {
      ok: false,
      ref: null,
      input,
      error: errorToSnapshotError(error),
    };
  }

  try {
    const repository = await client.getRepository(ref);
    const contributorFetchLimit = options.contributorFetchLimit ?? defaultContributorFetchLimit;
    const [languages, commitOverview, releaseOverview, contributors, openPullRequests, documentation] =
      await Promise.all([
        optional(() => client.getLanguages(ref), "languages"),
        optional(() => client.getCommitOverview(ref, repository.default_branch), "commits"),
        optional(() => client.getReleaseOverview(ref), "releases"),
        optional(() => client.getContributors(ref, contributorFetchLimit), "contributors"),
        optional(() => client.getOpenPullRequestCount(ref), "open pull requests"),
        optional(() => detectDocumentation(client, ref), "documentation"),
      ]);

    const warnings = [
      languages.warning,
      commitOverview.warning,
      releaseOverview.warning,
      contributors.warning,
      openPullRequests.warning,
      documentation.warning,
    ].filter((warning): warning is string => Boolean(warning));

    const snapshot = buildSnapshot({
      ref,
      repository,
      languages: languages.value ?? {},
      commitOverview: commitOverview.value ?? { latest: null, count: null },
      releaseOverview: releaseOverview.value ?? { latest: null, count: 0 },
      contributors: contributors.value ?? {
        contributors: [],
        totalCount: null,
        fetchLimit: contributorFetchLimit,
        truncated: false,
      },
      openPullRequests: openPullRequests.value,
      documentation: documentation.value ?? emptyDocumentation(),
      warnings,
      now,
    });

    return { ok: true, snapshot };
  } catch (error) {
    return {
      ok: false,
      ref,
      input,
      error: errorToSnapshotError(error),
    };
  }
}

function buildSnapshot(input: {
  ref: RepoRef;
  repository: GitHubRepository;
  languages: Record<string, number>;
  commitOverview: CommitOverview;
  releaseOverview: ReleaseOverview;
  contributors: ContributorOverview;
  openPullRequests: number | null;
  documentation: DocumentationSignals;
  warnings: string[];
  now: Date;
}): RepoSnapshot {
  const latestCommitAt =
    input.commitOverview.latest?.commit.committer?.date ?? input.commitOverview.latest?.commit.author?.date ?? null;
  const latestRelease = input.releaseOverview.latest;
  const latestReleaseAt = latestRelease?.published_at ?? latestRelease?.created_at ?? null;
  const daysSinceLastPush = daysSince(input.repository.pushed_at, input.now);
  const daysSinceLatestCommit = daysSince(latestCommitAt, input.now);
  const daysSinceLatestRelease = daysSince(latestReleaseAt, input.now);
  const warnings = [...input.warnings];
  const openIssues =
    input.openPullRequests === null
      ? null
      : Math.max(0, input.repository.open_issues_count - input.openPullRequests);

  if (input.openPullRequests === null) {
    warnings.push("Open issue count includes pull requests because pull request count could not be fetched.");
  }

  if (input.repository.archived) {
    warnings.push("Repository is archived.");
  }

  if (input.repository.disabled) {
    warnings.push("Repository is disabled.");
  }

  if (input.repository.fork) {
    warnings.push("Repository is a fork.");
  }

  if (input.contributors.truncated) {
    warnings.push(`Contributor concentration metrics are based on the first ${input.contributors.fetchLimit} contributors.`);
  }

  if (input.contributors.totalCount === null && input.contributors.truncated) {
    warnings.push("Total contributor count could not be determined.");
  }

  const contributors = buildContributorSignals(input.contributors);

  const snapshot: RepoSnapshot = {
    ref: input.ref,
    fetchedAt: input.now.toISOString(),
    repository: {
      fullName: input.repository.full_name,
      description: input.repository.description,
      url: input.repository.html_url,
      createdAt: input.repository.created_at,
      pushedAt: input.repository.pushed_at,
      updatedAt: input.repository.updated_at,
      defaultBranch: input.repository.default_branch,
      primaryLanguage: input.repository.language,
      languages: buildLanguageBreakdown(input.languages),
      license: normalizeLicense(input.repository),
      stars: input.repository.stargazers_count,
      forks: input.repository.forks_count,
      watchers: input.repository.subscribers_count,
      openIssues,
      openPullRequests: input.openPullRequests,
      openIssuesAndPullRequests: input.repository.open_issues_count,
      topics: input.repository.topics ?? [],
      archived: input.repository.archived,
      fork: input.repository.fork,
      disabled: input.repository.disabled,
      template: input.repository.is_template ?? false,
      sizeKb: input.repository.size,
    },
    activity: {
      ageDays: daysSince(input.repository.created_at, input.now) ?? 0,
      daysSinceLastPush,
      latestCommitAt,
      daysSinceLatestCommit,
      latestReleaseAt,
      latestReleaseName: latestRelease?.name ?? null,
      latestReleaseTag: latestRelease?.tag_name ?? null,
      daysSinceLatestRelease,
      releaseCount: input.releaseOverview.count,
      totalCommitCount: input.commitOverview.count,
    },
    documentation: input.documentation,
    contributors,
    metrics: buildCompositeMetrics({
      daysSinceLatestCommit,
      daysSinceLastPush,
      daysSinceLatestRelease,
      releaseCount: input.releaseOverview.count,
      archived: input.repository.archived,
      stars: input.repository.stargazers_count,
      forks: input.repository.forks_count,
      watchers: input.repository.subscribers_count,
      contributors: contributors.totalCount ?? contributors.fetchedCount,
    }),
    warnings,
  };

  return snapshot;
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

async function detectDocumentation(client: GitHubClient, ref: RepoRef): Promise<DocumentationSignals> {
  const [rootFiles, githubFiles] = await Promise.all([client.listDirectory(ref, ""), client.listDirectory(ref, ".github")]);
  const files = [...rootFiles, ...githubFiles];

  return {
    readme: findDocumentation(files, docsCandidates.readme),
    changelog: findDocumentation(files, docsCandidates.changelog),
    contributing: findDocumentation(files, docsCandidates.contributing),
    codeOfConduct: findDocumentation(files, docsCandidates.codeOfConduct),
    security: findDocumentation(files, docsCandidates.security),
  };
}

function findDocumentation(files: GitHubContentItem[], candidates: readonly string[]): DocumentationSignal {
  const file = files.find((item) => candidates.includes(item.name));

  return {
    present: Boolean(file),
    path: file?.path ?? null,
  };
}

function emptyDocumentation(): DocumentationSignals {
  return {
    readme: { present: false, path: null },
    changelog: { present: false, path: null },
    contributing: { present: false, path: null },
    codeOfConduct: { present: false, path: null },
    security: { present: false, path: null },
  };
}

function buildLanguageBreakdown(languages: Record<string, number>): LanguageBreakdown[] {
  const entries = Object.entries(languages).sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((sum, [, bytes]) => sum + bytes, 0);

  if (total === 0) {
    return [];
  }

  return entries.map(([name, bytes]) => ({
    name,
    bytes,
    percent: Math.round((bytes / total) * 1000) / 10,
  }));
}

function buildContributorSignals(overview: ContributorOverview): ContributorSignals {
  const sorted = [...overview.contributors].sort((a, b) => b.contributions - a.contributions);
  const top = sorted[0];
  const total = sorted.reduce((sum, contributor) => sum + contributor.contributions, 0);

  return {
    fetchedCount: overview.contributors.length,
    totalCount: overview.totalCount,
    fetchLimit: overview.fetchLimit,
    truncated: overview.truncated,
    topContributor: top
      ? {
          login: top.login ?? top.name ?? "unknown",
          contributions: top.contributions,
        }
      : null,
    topContributorShare: top && total > 0 ? Math.round((top.contributions / total) * 1000) / 10 : null,
  };
}

function normalizeLicense(repository: GitHubRepository): string | null {
  if (!repository.license) {
    return null;
  }

  if (repository.license.spdx_id && repository.license.spdx_id !== "NOASSERTION") {
    return repository.license.spdx_id;
  }

  return repository.license.key ?? repository.license.name;
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

export function createSnapshotFailure(input: string, error: unknown): SnapshotResult {
  let ref: RepoRef | null = null;

  try {
    ref = parseRepoRef(input);
  } catch {
    ref = null;
  }

  return {
    ok: false,
    ref,
    input,
    error: errorToSnapshotError(error),
  };
}

export function snapshotName(snapshot: RepoSnapshot): string {
  return formatRepoRef(snapshot.ref);
}

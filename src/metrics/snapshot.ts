import { GitHubApiError, GitHubClient } from "../github/client";
import type { GitHubContentItem, GitHubContributor, GitHubRepository, ReleaseOverview } from "../github/types";
import type {
  CompositeMetric,
  CompositeMetrics,
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

type OptionalData<T> = {
  value: T | null;
  warning: string | null;
};

const docsCandidates = {
  readme: ["README.md", "README", "README.rst", "README.txt"],
  changelog: ["CHANGELOG.md", "CHANGELOG", "HISTORY.md", "NEWS.md"],
  contributing: ["CONTRIBUTING.md", "CONTRIBUTING"],
  codeOfConduct: ["CODE_OF_CONDUCT.md", "CODE_OF_CONDUCT"],
  security: ["SECURITY.md", "SECURITY"],
} as const;

export async function collectSnapshot(client: GitHubClient, input: string, now = new Date()): Promise<SnapshotResult> {
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
    const [languages, latestCommit, releaseOverview, contributors, openPullRequests, documentation] =
      await Promise.all([
        optional(() => client.getLanguages(ref), "languages"),
        optional(() => client.getLatestCommit(ref, repository.default_branch), "latest commit"),
        optional(() => client.getReleaseOverview(ref), "releases"),
        optional(() => client.getContributors(ref), "contributors"),
        optional(() => client.getOpenPullRequestCount(ref), "open pull requests"),
        optional(() => detectDocumentation(client, ref), "documentation"),
      ]);

    const warnings = [
      languages.warning,
      latestCommit.warning,
      releaseOverview.warning,
      contributors.warning,
      openPullRequests.warning,
      documentation.warning,
    ].filter((warning): warning is string => Boolean(warning));

    const snapshot = buildSnapshot({
      ref,
      repository,
      languages: languages.value ?? {},
      latestCommit: latestCommit.value,
      releaseOverview: releaseOverview.value ?? { latest: null, count: 0 },
      contributors: contributors.value ?? { contributors: [], truncated: false },
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
  latestCommit: Awaited<ReturnType<GitHubClient["getLatestCommit"]>> | null;
  releaseOverview: ReleaseOverview;
  contributors: { contributors: GitHubContributor[]; truncated: boolean };
  openPullRequests: number | null;
  documentation: DocumentationSignals;
  warnings: string[];
  now: Date;
}): RepoSnapshot {
  const latestCommitAt =
    input.latestCommit?.commit.committer?.date ?? input.latestCommit?.commit.author?.date ?? null;
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
    warnings.push("Contributor metrics are based on the first 100 contributors.");
  }

  const contributors = buildContributorSignals(input.contributors.contributors, input.contributors.truncated);

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
    },
    documentation: input.documentation,
    contributors,
    metrics: buildCompositeMetrics({
      repository: input.repository,
      documentation: input.documentation,
      contributors,
      daysSinceLatestCommit,
      daysSinceLastPush,
      daysSinceLatestRelease,
      releaseCount: input.releaseOverview.count,
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

function buildContributorSignals(contributors: GitHubContributor[], truncated: boolean): ContributorSignals {
  const sorted = [...contributors].sort((a, b) => b.contributions - a.contributions);
  const top = sorted[0];
  const total = sorted.reduce((sum, contributor) => sum + contributor.contributions, 0);

  return {
    fetchedCount: contributors.length,
    truncated,
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

function buildCompositeMetrics(input: {
  repository: GitHubRepository;
  documentation: DocumentationSignals;
  contributors: ContributorSignals;
  daysSinceLatestCommit: number | null;
  daysSinceLastPush: number | null;
  daysSinceLatestRelease: number | null;
  releaseCount: number;
}): CompositeMetrics {
  const freshnessDays = minNullable(input.daysSinceLatestCommit, input.daysSinceLastPush);
  const activityScore =
    freshnessScore(freshnessDays, [
      [30, 55],
      [90, 45],
      [180, 35],
      [365, 20],
      [730, 10],
    ]) +
    freshnessScore(input.daysSinceLatestRelease, [
      [90, 25],
      [365, 20],
      [730, 10],
    ]) +
    (input.releaseCount > 0 ? 10 : 0) +
    (input.repository.archived ? -30 : 10);

  const communityScore =
    logScore(input.repository.stargazers_count, 100_000, 35) +
    logScore(input.repository.forks_count, 25_000, 25) +
    logScore(input.repository.subscribers_count, 10_000, 15) +
    logScore(input.contributors.fetchedCount, 100, 25);

  const documentationCount = Object.values(input.documentation).filter((signal) => signal.present).length;
  const maintenanceScore =
    documentationCount * 12 +
    (input.repository.license ? 15 : 0) +
    (input.releaseCount > 0 ? 15 : 0) +
    (input.repository.archived ? 0 : 10);

  return {
    activityFreshness: metric(clampScore(activityScore), {
      daysSinceLatestCommit: input.daysSinceLatestCommit,
      daysSinceLastPush: input.daysSinceLastPush,
      daysSinceLatestRelease: input.daysSinceLatestRelease,
      releaseCount: input.releaseCount,
      archived: input.repository.archived,
    }),
    communityFootprint: metric(clampScore(communityScore), {
      stars: input.repository.stargazers_count,
      forks: input.repository.forks_count,
      watchers: input.repository.subscribers_count,
      fetchedContributors: input.contributors.fetchedCount,
    }),
    maintenanceVisibility: metric(clampScore(maintenanceScore), {
      documentationFiles: documentationCount,
      hasLicense: Boolean(input.repository.license),
      releaseCount: input.releaseCount,
      archived: input.repository.archived,
    }),
  };
}

function metric(score: number, inputs: CompositeMetric["inputs"]): CompositeMetric {
  return {
    score,
    label: scoreLabel(score),
    inputs,
  };
}

function freshnessScore(days: number | null, buckets: Array<[number, number]>): number {
  if (days === null) {
    return 0;
  }

  const bucket = buckets.find(([maxDays]) => days <= maxDays);
  return bucket?.[1] ?? 0;
}

function logScore(value: number, cap: number, weight: number): number {
  const normalized = Math.log10(Math.min(value, cap) + 1) / Math.log10(cap + 1);
  return normalized * weight;
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function scoreLabel(score: number): string {
  if (score >= 75) {
    return "strong";
  }

  if (score >= 50) {
    return "moderate";
  }

  if (score >= 25) {
    return "limited";
  }

  return "weak";
}

function minNullable(a: number | null, b: number | null): number | null {
  if (a === null) {
    return b;
  }

  if (b === null) {
    return a;
  }

  return Math.min(a, b);
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

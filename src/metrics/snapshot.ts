import { GitHubApiError, GitHubClient } from "../github/client";
import type {
  CommitOverview,
  ContributorOverview,
  GitHubContentItem,
  GitHubRepository,
  GitHubRelease,
  ReleaseOverview,
} from "../github/types";
import type {
  ContributorSignals,
  DocumentationSignal,
  DocumentationSignals,
  LanguageBreakdown,
  RepoRef,
  RepoSnapshot,
  ReleaseSummary,
  ReleaseTrack,
  ReleaseTrackKind,
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
      releaseOverview: releaseOverview.value ?? { latest: null, count: 0, releases: [], sampleLimit: 0 },
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
  const releaseSummary = buildReleaseSummary(input.releaseOverview, input.now);

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
      releaseSummary,
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
    }),
    warnings,
  };

  return snapshot;
}

function buildReleaseSummary(overview: ReleaseOverview, now: Date): ReleaseSummary {
  const releases = overview.releases.filter((release) => !release.draft);
  const draftCount = overview.releases.length - releases.length;
  const stableReleases = releases.filter((release) => !release.prerelease);
  const prereleaseReleases = releases.filter((release) => release.prerelease);
  const stableOutsideSample =
    overview.latest !== null && !stableReleases.some((release) => release.tag_name === overview.latest?.tag_name);
  const stableCount = stableReleases.length + (stableOutsideSample ? 1 : 0);
  const latestStableTrack = overview.latest ? buildReleaseTrack("stable", "stable", [overview.latest], now) : null;
  const stableTrack = latestStableTrack ? { ...latestStableTrack, releaseCount: stableCount } : null;
  const prereleaseTracks = groupPrereleaseTracks(prereleaseReleases, now);
  const tracks = [stableTrack, ...prereleaseTracks].filter((track): track is ReleaseTrack => track !== null);

  return {
    totalCount: overview.count,
    sampledCount: stableCount + prereleaseReleases.length,
    sampleLimit: overview.sampleLimit,
    truncated: overview.count > overview.releases.length,
    stableCount,
    prereleaseCount: prereleaseReleases.length,
    draftCount,
    tracks,
  };
}

function groupPrereleaseTracks(releases: GitHubRelease[], now: Date): ReleaseTrack[] {
  const groups = new Map<ReleaseTrackKind, GitHubRelease[]>();

  for (const release of releases) {
    const kind = classifyPrereleaseTrack(release);
    groups.set(kind, [...(groups.get(kind) ?? []), release]);
  }

  return [...groups.entries()]
    .map(([kind, group]) => buildReleaseTrack(kind, releaseTrackLabel(kind), group, now))
    .filter((track): track is ReleaseTrack => track !== null)
    .sort((a, b) => releaseTrackSortKey(a) - releaseTrackSortKey(b));
}

function buildReleaseTrack(kind: ReleaseTrackKind, label: string, releases: GitHubRelease[], now: Date): ReleaseTrack | null {
  const latest = latestReleaseByDate(releases);

  if (!latest) {
    return null;
  }

  const latestAt = releaseDate(latest, kind);

  return {
    kind,
    label,
    latestName: latest.name,
    latestTag: latest.tag_name,
    latestAt,
    daysSinceLatest: daysSince(latestAt, now),
    releaseCount: releases.length,
    stable: kind === "stable",
    prerelease: kind !== "stable",
  };
}

function latestReleaseByDate(releases: GitHubRelease[]): GitHubRelease | null {
  if (releases.length === 0) {
    return null;
  }

  return releases.reduce((latest, release) => (releaseTimestamp(release) > releaseTimestamp(latest) ? release : latest), releases[0]);
}

function releaseTimestamp(release: GitHubRelease): number {
  return Date.parse(releaseDate(release, release.prerelease ? "prerelease" : "stable") ?? release.created_at) || 0;
}

function releaseDate(release: GitHubRelease, kind: ReleaseTrackKind): string | null {
  if (kind === "stable") {
    return release.published_at ?? release.created_at ?? null;
  }

  return release.updated_at ?? release.published_at ?? release.created_at ?? null;
}

function classifyPrereleaseTrack(release: GitHubRelease): ReleaseTrackKind {
  const text = `${release.tag_name} ${release.name ?? ""}`.toLowerCase();

  if (text.includes("nightly")) {
    return "nightly";
  }

  if (text.includes("canary")) {
    return "canary";
  }

  if (/(^|[^a-z])dev([^a-z]|$)/.test(text)) {
    return "dev";
  }

  if (/(^|[^a-z])alpha([^a-z]|$)/.test(text)) {
    return "alpha";
  }

  if (/(^|[^a-z])beta([^a-z]|$)/.test(text)) {
    return "beta";
  }

  if (/(^|[^a-z])rc[.\d-]*([^a-z]|$)|release candidate/.test(text)) {
    return "rc";
  }

  if (text.includes("preview")) {
    return "preview";
  }

  return "prerelease";
}

function releaseTrackLabel(kind: ReleaseTrackKind): string {
  switch (kind) {
    case "rc":
      return "release candidate";
    case "prerelease":
      return "prerelease";
    default:
      return kind;
  }
}

function releaseTrackSortKey(track: ReleaseTrack): number {
  const order: Record<ReleaseTrackKind, number> = {
    stable: 0,
    nightly: 1,
    canary: 2,
    dev: 3,
    alpha: 4,
    beta: 5,
    rc: 6,
    preview: 7,
    prerelease: 8,
  };

  return order[track.kind];
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

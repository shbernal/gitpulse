import { renderComparison, renderDocs, renderRepo, renderUserProfile } from "../src/render/table";
import type { RepoSnapshot, UserProfileSnapshot } from "../src/types";

export const visualOutputColumns = 100;

export type VisualOutputCase = {
  allowOverflow?: boolean;
  ansi: string;
  columns: number;
  id: string;
  notes: string[];
  title: string;
};

export function visualOutputCases(): VisualOutputCase[] {
  const strongRepo = repoSnapshot("acme/pulsekit", {
    popularityScore: 88,
    description: "Terminal-first project health snapshots for dependency and contribution decisions.",
    forks: 2450,
    license: "Apache-2.0",
    stars: 18_700,
    topics: ["cli", "github", "dependencies"],
    watchers: 320,
  });
  const warningRepo = repoSnapshot("legacy/slowtool", {
    activityLabel: "weak",
    activityScore: 12,
    archived: true,
    commitDays: 940,
    popularityLabel: "limited",
    popularityScore: 31,
    description: "Older automation project retained for existing users.",
    forks: 86,
    latestCommitAt: "2023-10-20T00:00:00Z",
    latestReleaseAt: null,
    latestReleaseName: null,
    latestReleaseTag: null,
    license: null,
    primaryLanguage: "Shell",
    releaseCount: 0,
    stars: 640,
    topics: [],
    totalCommitCount: 390,
    totalContributors: 7,
    warnings: ["Repository is archived.", "Latest release data is unavailable."],
    watchers: 22,
  });
  const tinyRepo = repoSnapshot("tiny/fresh", {
    popularityLabel: "weak",
    popularityScore: 18,
    description: "Small but active tool with a narrow maintainer surface.",
    forks: 4,
    stars: 37,
    totalContributors: 2,
    watchers: 3,
  });
  const longRepo = repoSnapshot("deeply-nested-platform/terminal-output-inspector", {
    description:
      "A deliberately long repository description used to expose truncation, spacing, and fixed-column overflow pressure in generated visual artifacts before layout changes ship.",
    forks: 932,
    stars: 12_400,
    topics: ["terminal", "ansi", "visual-review", "cli-design"],
  });
  const user = userSnapshot("octocat");

  return [
    {
      ansi: renderRepo(strongRepo, { color: true }, { kind: "api" }),
      columns: visualOutputColumns,
      id: "repo-strong",
      notes: ["Single repository report with strong activity and popularity scores."],
      title: "Single repository report",
    },
    {
      ansi: renderRepo(warningRepo, { color: true }, { kind: "stale-cache", cachedAt: "2026-05-01T00:00:00.000Z", ageHours: 600 }),
      columns: visualOutputColumns,
      id: "repo-warning",
      notes: ["Archived repository with weak scores, missing data, stale cache, and warnings."],
      title: "Warning-heavy repository report",
    },
    {
      allowOverflow: true,
      ansi: renderRepo(strongRepo, { color: true, explainScores: true }, { kind: "api" }),
      columns: visualOutputColumns,
      id: "repo-explain",
      notes: ["Score explanation mode with intentionally visible fixed-width pressure from rule details."],
      title: "Repository score explanation",
    },
    {
      ansi: renderComparison(
        [
          { ok: true, snapshot: strongRepo },
          { ok: true, snapshot: tinyRepo },
          { ok: true, snapshot: warningRepo },
        ],
        { color: true },
        [{ kind: "api" }, { kind: "cache", cachedAt: "2026-05-25T00:00:00.000Z", ageHours: 8 }, { kind: "stale-cache", cachedAt: "2026-05-01T00:00:00.000Z", ageHours: 600 }],
      ),
      columns: visualOutputColumns,
      id: "compare-mixed",
      notes: ["Comparison report with strong, small-active, and archived repositories."],
      title: "Mixed comparison report",
    },
    {
      ansi: renderDocs(strongRepo, { color: true }, { kind: "api" }),
      columns: visualOutputColumns,
      id: "docs",
      notes: ["Dedicated documentation signal report."],
      title: "Documentation report",
    },
    {
      ansi: renderUserProfile(user, { color: true }, { kind: "api" }),
      columns: visualOutputColumns,
      id: "user",
      notes: ["GitHub user profile and repository footprint report."],
      title: "User profile report",
    },
    {
      allowOverflow: true,
      ansi: renderRepo(longRepo, { color: true }, { kind: "api" }),
      columns: visualOutputColumns,
      id: "repo-long-content",
      notes: ["Intentional fixed-width pressure case. The column guide shows where 100 columns ends."],
      title: "Long content pressure report",
    },
  ];
}

type RepoSnapshotOptions = {
  activityLabel?: string;
  activityScore?: number;
  archived?: boolean;
  commitDays?: number;
  popularityLabel?: string;
  popularityScore?: number;
  description?: string | null;
  disabled?: boolean;
  fork?: boolean;
  forks?: number;
  latestCommitAt?: string | null;
  latestReleaseAt?: string | null;
  latestReleaseName?: string | null;
  latestReleaseTag?: string | null;
  license?: string | null;
  openIssues?: number | null;
  openPullRequests?: number | null;
  primaryLanguage?: string | null;
  releaseCount?: number;
  sizeKb?: number;
  stars?: number;
  template?: boolean;
  topics?: string[];
  topContributor?: string | null;
  topContributorShare?: number | null;
  totalCommitCount?: number | null;
  totalContributors?: number | null;
  warnings?: string[];
  watchers?: number;
};

function repoSnapshot(fullName: string, options: RepoSnapshotOptions = {}): RepoSnapshot {
  const [owner, name] = fullName.split("/");
  const openIssues = options.openIssues ?? 42;
  const openPullRequests = options.openPullRequests ?? 6;
  const primaryLanguage = options.primaryLanguage ?? "TypeScript";
  const commitDays = options.commitDays ?? 2;
  const totalContributors = options.totalContributors ?? 76;
  const topContributorShare = options.topContributorShare ?? 18.4;

  return {
    ref: { owner, name },
    fetchedAt: "2026-05-16T00:00:00.000Z",
    repository: {
      archived: options.archived ?? false,
      createdAt: "2020-01-01T00:00:00Z",
      defaultBranch: "main",
      description: options.description ?? "A useful developer tool.",
      disabled: options.disabled ?? false,
      fork: options.fork ?? false,
      forks: options.forks ?? 120,
      fullName,
      languages: languageBreakdown(primaryLanguage),
      license: options.license ?? "MIT",
      openIssues,
      openIssuesAndPullRequests: openIssues + openPullRequests,
      openPullRequests,
      primaryLanguage,
      pushedAt: options.latestCommitAt ?? "2026-05-14T00:00:00Z",
      sizeKb: options.sizeKb ?? 81_240,
      stars: options.stars ?? 980,
      template: options.template ?? false,
      topics: options.topics ?? ["cli", "github"],
      updatedAt: "2026-05-15T00:00:00Z",
      url: `https://github.com/${fullName}`,
      watchers: options.watchers ?? 33,
    },
    activity: {
      ageDays: 2327,
      daysSinceLastPush: commitDays,
      daysSinceLatestCommit: commitDays,
      daysSinceLatestRelease: options.latestReleaseAt === null ? null : 15,
      latestCommitAt: options.latestCommitAt ?? "2026-05-14T00:00:00Z",
      latestReleaseAt: options.latestReleaseAt === undefined ? "2026-05-01T00:00:00Z" : options.latestReleaseAt,
      latestReleaseName: options.latestReleaseName === undefined ? "v1.0.0" : options.latestReleaseName,
      latestReleaseTag: options.latestReleaseTag === undefined ? "v1.0.0" : options.latestReleaseTag,
      releaseCount: options.releaseCount ?? 14,
      totalCommitCount: options.totalCommitCount ?? 1240,
    },
    contributors: {
      fetchLimit: 100,
      fetchedCount: totalContributors ?? 0,
      topContributor: options.topContributor === null ? null : { login: options.topContributor ?? "octo", contributions: 228 },
      topContributorShare,
      totalCount: totalContributors,
      truncated: false,
    },
    documentation: {
      changelog: { path: "CHANGELOG.md", present: true },
      codeOfConduct: { path: "CODE_OF_CONDUCT.md", present: true },
      contributing: { path: "CONTRIBUTING.md", present: true },
      readme: { path: "README.md", present: true },
      security: { path: null, present: false },
    },
    metrics: {
      activityFreshness: { inputs: {}, label: options.activityLabel ?? "strong", score: options.activityScore ?? 91 },
      popularity: { inputs: {}, label: options.popularityLabel ?? "moderate", score: options.popularityScore ?? 67 },
    },
    warnings: options.warnings ?? [],
  };
}

function languageBreakdown(primaryLanguage: string | null): RepoSnapshot["repository"]["languages"] {
  if (!primaryLanguage) {
    return [];
  }

  if (primaryLanguage === "Shell") {
    return [
      { bytes: 700, name: "Shell", percent: 70 },
      { bytes: 200, name: "Python", percent: 20 },
      { bytes: 100, name: "Makefile", percent: 10 },
    ];
  }

  return [
    { bytes: 850, name: primaryLanguage, percent: 85 },
    { bytes: 120, name: "Rust", percent: 12 },
    { bytes: 30, name: "Shell", percent: 3 },
  ];
}

function userSnapshot(login: string): UserProfileSnapshot {
  const topRepository = userRepository(login, "hello", "TypeScript", 12_400, 880, false, false, 3);
  const archivedRepository = userRepository(login, "old-extension", "JavaScript", 940, 120, true, false, 780);
  const forkRepository = userRepository(login, "patched-tool", "Rust", 620, 44, false, true, 24);

  return {
    fetchedAt: "2026-05-16T00:00:00.000Z",
    login,
    profile: {
      ageDays: 5589,
      bio: "GitHub mascot and public example account.",
      blog: "https://github.blog",
      company: "GitHub",
      createdAt: "2011-01-25T18:44:36Z",
      daysSinceUpdated: 15,
      email: null,
      followers: 1_200_000,
      following: 9,
      hireable: null,
      location: "San Francisco",
      login,
      name: "The Octocat",
      publicGists: 1,
      publicRepos: 3,
      siteAdmin: false,
      twitterUsername: "github",
      type: "User",
      updatedAt: "2026-05-01T00:00:00Z",
      url: `https://github.com/${login}`,
    },
    repositories: {
      archivedCount: 1,
      fetchedCount: 3,
      fetchLimit: 100,
      forkCount: 1,
      primaryLanguages: [
        { name: "TypeScript", percent: 34, repositoryCount: 1 },
        { name: "JavaScript", percent: 33, repositoryCount: 1 },
        { name: "Rust", percent: 33, repositoryCount: 1 },
      ],
      publicRepoCount: 3,
      recentPushWindowDays: 90,
      recentlyPushedCount: 2,
      recentlyPushedRepositories: [topRepository, forkRepository],
      topRepositories: [topRepository, archivedRepository, forkRepository],
      totalForks: 1044,
      totalStars: 13_960,
      truncated: false,
    },
    warnings: [],
  };
}

function userRepository(
  login: string,
  name: string,
  primaryLanguage: string,
  stars: number,
  forks: number,
  archived: boolean,
  fork: boolean,
  daysSinceLastPush: number,
): UserProfileSnapshot["repositories"]["topRepositories"][number] {
  return {
    archived,
    createdAt: "2020-01-01T00:00:00Z",
    daysSinceLastPush,
    description: null,
    fork,
    forks,
    fullName: `${login}/${name}`,
    name,
    primaryLanguage,
    pushedAt: daysSinceLastPush > 365 ? "2024-04-01T00:00:00Z" : "2026-05-13T00:00:00Z",
    stars,
    updatedAt: "2026-05-15T00:00:00Z",
    url: `https://github.com/${login}/${name}`,
  };
}

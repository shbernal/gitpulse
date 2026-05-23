export type RepoRef = {
  owner: string;
  name: string;
};

export type LanguageBreakdown = {
  name: string;
  bytes: number;
  percent: number;
};

export type RepositoryFacts = {
  fullName: string;
  description: string | null;
  url: string;
  createdAt: string;
  pushedAt: string | null;
  updatedAt: string;
  defaultBranch: string;
  primaryLanguage: string | null;
  languages: LanguageBreakdown[];
  license: string | null;
  stars: number;
  forks: number;
  watchers: number;
  openIssues: number | null;
  openPullRequests: number | null;
  openIssuesAndPullRequests: number;
  topics: string[];
  archived: boolean;
  fork: boolean;
  disabled: boolean;
  template: boolean;
  sizeKb: number;
};

export type ActivityMetrics = {
  ageDays: number;
  daysSinceLastPush: number | null;
  latestCommitAt: string | null;
  daysSinceLatestCommit: number | null;
  latestReleaseAt: string | null;
  latestReleaseName: string | null;
  latestReleaseTag: string | null;
  daysSinceLatestRelease: number | null;
  releaseCount: number;
  totalCommitCount: number | null;
};

export type DocumentationSignal = {
  present: boolean;
  path: string | null;
};

export type DocumentationSignals = {
  readme: DocumentationSignal;
  changelog: DocumentationSignal;
  contributing: DocumentationSignal;
  codeOfConduct: DocumentationSignal;
  security: DocumentationSignal;
};

export type ContributorSignals = {
  fetchedCount: number;
  totalCount: number | null;
  fetchLimit: number;
  truncated: boolean;
  topContributor: {
    login: string;
    contributions: number;
  } | null;
  topContributorShare: number | null;
};

export type CompositeMetric = {
  score: number;
  label: string;
  inputs: Record<string, number | boolean | null>;
};

export type CompositeMetrics = {
  activityFreshness: CompositeMetric;
  communityFootprint: CompositeMetric;
};

export type UserProfileFacts = {
  login: string;
  name: string | null;
  type: string;
  bio: string | null;
  url: string;
  company: string | null;
  location: string | null;
  blog: string | null;
  twitterUsername: string | null;
  email: string | null;
  hireable: boolean | null;
  createdAt: string;
  updatedAt: string;
  ageDays: number;
  daysSinceUpdated: number | null;
  publicRepos: number;
  publicGists: number;
  followers: number;
  following: number;
  siteAdmin: boolean;
};

export type UserRepositorySummary = {
  fullName: string;
  name: string;
  description: string | null;
  url: string;
  primaryLanguage: string | null;
  stars: number;
  forks: number;
  archived: boolean;
  fork: boolean;
  createdAt: string;
  pushedAt: string | null;
  updatedAt: string;
  daysSinceLastPush: number | null;
};

export type UserLanguageFootprint = {
  name: string;
  repositoryCount: number;
  percent: number;
};

export type UserRepositoryFootprint = {
  publicRepoCount: number;
  fetchedCount: number;
  fetchLimit: number;
  truncated: boolean;
  recentPushWindowDays: number;
  recentlyPushedCount: number;
  totalStars: number;
  totalForks: number;
  archivedCount: number;
  forkCount: number;
  primaryLanguages: UserLanguageFootprint[];
  topRepositories: UserRepositorySummary[];
  recentlyPushedRepositories: UserRepositorySummary[];
};

export type RepoSnapshot = {
  ref: RepoRef;
  fetchedAt: string;
  repository: RepositoryFacts;
  activity: ActivityMetrics;
  documentation: DocumentationSignals;
  contributors: ContributorSignals;
  metrics: CompositeMetrics;
  warnings: string[];
};

export type UserProfileSnapshot = {
  login: string;
  fetchedAt: string;
  profile: UserProfileFacts;
  repositories: UserRepositoryFootprint;
  warnings: string[];
};

export type SnapshotError = {
  message: string;
  status?: number;
  code?: string;
};

export type SnapshotResult =
  | {
      ok: true;
      snapshot: RepoSnapshot;
    }
  | {
      ok: false;
      ref: RepoRef | null;
      input: string;
      error: SnapshotError;
    };

export type UserProfileResult =
  | {
      ok: true;
      snapshot: UserProfileSnapshot;
    }
  | {
      ok: false;
      login: string | null;
      input: string;
      error: SnapshotError;
    };

export type SnapshotSource =
  | {
      kind: "api";
    }
  | {
      kind: "cache";
      cachedAt: string;
      ageHours: number;
    }
  | {
      kind: "stale-cache";
      cachedAt: string;
      ageHours: number;
      refreshError?: SnapshotError;
    }
  | {
      kind: "none";
    };

export type SnapshotWithSource = {
  result: SnapshotResult;
  source: SnapshotSource;
};

export type UserProfileWithSource = {
  result: UserProfileResult;
  source: SnapshotSource;
};

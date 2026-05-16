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
  maintenanceVisibility: CompositeMetric;
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

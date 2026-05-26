import type { CompositeMetric, CompositeMetrics, RepoSnapshot } from "../types";

type CompositeSignalValue = number | boolean | null;
type FreshnessBucket = readonly [maxDays: number, points: number];

export type CompositeMetricsInput = {
  daysSinceLatestCommit: number | null;
  daysSinceLastPush: number | null;
  daysSinceLatestRelease: number | null;
  releaseCount: number;
  archived: boolean;
  stars: number;
  forks: number;
  watchers: number;
};

export type CompositeContribution = {
  id: string;
  label: string;
  points: number;
  maxPoints: number | null;
  rule: string;
  detail: string;
  inputs: Record<string, CompositeSignalValue>;
};

export type CompositeMetricAnalysis = {
  score: number;
  label: string | null;
  scale: NonNullable<CompositeMetric["scale"]>;
  rawScore: number;
  maxScore: number | null;
  units?: number;
  inputs: CompositeMetric["inputs"];
  contributions: CompositeContribution[];
};

export type CompositeMetricsAnalysis = {
  activityFreshness: CompositeMetricAnalysis;
  popularity: CompositeMetricAnalysis;
};

const activityFreshnessBuckets = [
  [30, 55],
  [90, 45],
  [180, 35],
  [365, 20],
  [730, 10],
] as const satisfies readonly FreshnessBucket[];

const releaseFreshnessBuckets = [
  [90, 25],
  [365, 20],
  [730, 10],
] as const satisfies readonly FreshnessBucket[];

const popularityWeights = {
  stars: 1,
  forks: 8,
  watchers: 5,
} as const;

export function buildCompositeMetrics(input: CompositeMetricsInput): CompositeMetrics {
  const analysis = buildCompositeMetricsAnalysis(input);

  return {
    activityFreshness: metric(analysis.activityFreshness),
    popularity: metric(analysis.popularity),
  };
}

export function buildCompositeMetricsAnalysis(input: CompositeMetricsInput): CompositeMetricsAnalysis {
  return {
    activityFreshness: buildActivityFreshnessAnalysis(input),
    popularity: buildPopularityAnalysis(input),
  };
}

export function buildCompositeMetricsAnalysisFromSnapshot(snapshot: RepoSnapshot): CompositeMetricsAnalysis {
  return buildCompositeMetricsAnalysis({
    daysSinceLatestCommit: snapshot.activity.daysSinceLatestCommit,
    daysSinceLastPush: snapshot.activity.daysSinceLastPush,
    daysSinceLatestRelease: snapshot.activity.daysSinceLatestRelease,
    releaseCount: snapshot.activity.releaseCount,
    archived: snapshot.repository.archived,
    stars: snapshot.repository.stars,
    forks: snapshot.repository.forks,
    watchers: snapshot.repository.watchers,
  });
}

function buildActivityFreshnessAnalysis(input: CompositeMetricsInput): CompositeMetricAnalysis {
  const freshnessDays = minNullable(input.daysSinceLatestCommit, input.daysSinceLastPush);
  const contributions: CompositeContribution[] = [
    freshnessContribution({
      id: "commitOrPushFreshness",
      label: "Commit or push freshness",
      days: freshnessDays,
      buckets: activityFreshnessBuckets,
      maxPoints: 55,
      inputs: {
        freshnessDays,
        daysSinceLatestCommit: input.daysSinceLatestCommit,
        daysSinceLastPush: input.daysSinceLastPush,
      },
      detail: [
        `using ${formatDays(freshnessDays)}`,
        `latest commit ${formatDays(input.daysSinceLatestCommit)}`,
        `last push ${formatDays(input.daysSinceLastPush)}`,
      ].join("; "),
    }),
    freshnessContribution({
      id: "releaseFreshness",
      label: "Release freshness",
      days: input.daysSinceLatestRelease,
      buckets: releaseFreshnessBuckets,
      maxPoints: 25,
      inputs: {
        daysSinceLatestRelease: input.daysSinceLatestRelease,
      },
      detail: `latest release ${formatDays(input.daysSinceLatestRelease)}`,
    }),
    {
      id: "releasePresence",
      label: "Release presence",
      points: input.releaseCount > 0 ? 10 : 0,
      maxPoints: 10,
      rule: input.releaseCount > 0 ? "has fetched releases" : "no fetched releases",
      detail: `${input.releaseCount} ${input.releaseCount === 1 ? "fetched release" : "fetched releases"}`,
      inputs: {
        releaseCount: input.releaseCount,
      },
    },
    {
      id: "archiveState",
      label: "Archive state",
      points: input.archived ? -30 : 10,
      maxPoints: 10,
      rule: input.archived ? "repository is archived" : "repository is not archived",
      detail: input.archived ? "archived repositories are penalized" : "active repositories receive the archive-state bonus",
      inputs: {
        archived: input.archived,
      },
    },
  ];
  const rawScore = sumPoints(contributions);
  const score = clampScore(rawScore);

  return {
    score,
    label: scoreLabel(score),
    scale: "bounded",
    rawScore: roundDetail(rawScore),
    maxScore: 100,
    inputs: {
      daysSinceLatestCommit: input.daysSinceLatestCommit,
      daysSinceLastPush: input.daysSinceLastPush,
      daysSinceLatestRelease: input.daysSinceLatestRelease,
      releaseCount: input.releaseCount,
      archived: input.archived,
    },
    contributions,
  };
}

function buildPopularityAnalysis(input: CompositeMetricsInput): CompositeMetricAnalysis {
  const starUnits = input.stars * popularityWeights.stars;
  const forkUnits = input.forks * popularityWeights.forks;
  const watcherUnits = input.watchers * popularityWeights.watchers;
  const units = starUnits + forkUnits + watcherUnits;
  const score = roundDetail(Math.log10(units + 1));
  const contributions = [
    unitContribution("stars", "Stars", input.stars, popularityWeights.stars),
    unitContribution("forks", "Forks", input.forks, popularityWeights.forks),
    unitContribution("watchers", "Watchers", input.watchers, popularityWeights.watchers),
  ];

  return {
    score,
    label: null,
    scale: "index",
    rawScore: score,
    maxScore: null,
    units,
    inputs: {
      stars: input.stars,
      forks: input.forks,
      watchers: input.watchers,
      popularityUnits: units,
      starWeight: popularityWeights.stars,
      forkWeight: popularityWeights.forks,
      watcherWeight: popularityWeights.watchers,
    },
    contributions,
  };
}

function metric(analysis: CompositeMetricAnalysis): CompositeMetric {
  return {
    score: analysis.score,
    label: analysis.label,
    scale: analysis.scale,
    ...(analysis.units === undefined ? {} : { units: analysis.units }),
    inputs: analysis.inputs,
  };
}

function freshnessContribution(input: {
  id: string;
  label: string;
  days: number | null;
  buckets: readonly FreshnessBucket[];
  maxPoints: number;
  detail: string;
  inputs: Record<string, CompositeSignalValue>;
}): CompositeContribution {
  const bucket =
    input.days === null
      ? null
      : input.buckets.find(([maxDays]) => input.days !== null && input.days <= maxDays) ?? null;
  const points = bucket?.[1] ?? 0;

  return {
    id: input.id,
    label: input.label,
    points,
    maxPoints: input.maxPoints,
    rule: freshnessRule(input.days, input.buckets, bucket),
    detail: input.detail,
    inputs: input.inputs,
  };
}

function unitContribution(id: string, label: string, value: number, weight: number): CompositeContribution {
  const units = value * weight;

  return {
    id,
    label,
    points: units,
    maxPoints: null,
    rule: `${weight}x PU`,
    detail: `value ${value}, weight ${weight}`,
    inputs: {
      value,
      weight,
      popularityUnits: units,
    },
  };
}

function freshnessRule(days: number | null, buckets: readonly FreshnessBucket[], bucket: FreshnessBucket | null): string {
  if (days === null) {
    return "missing date";
  }

  if (bucket) {
    return `<= ${bucket[0]} days`;
  }

  return `> ${buckets[buckets.length - 1][0]} days`;
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

function sumPoints(contributions: CompositeContribution[]): number {
  return contributions.reduce((sum, contribution) => sum + contribution.points, 0);
}

function roundDetail(value: number): number {
  return Number(value.toFixed(2));
}

function formatDays(days: number | null): string {
  return days === null ? "n/a" : `${days}d`;
}

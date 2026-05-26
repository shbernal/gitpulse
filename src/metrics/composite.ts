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
  contributors: number;
};

export type CompositeContribution = {
  id: string;
  label: string;
  points: number;
  maxPoints: number;
  rule: string;
  detail: string;
  inputs: Record<string, CompositeSignalValue>;
};

export type CompositeMetricAnalysis = {
  score: number;
  label: string;
  rawScore: number;
  maxScore: number;
  inputs: CompositeMetric["inputs"];
  contributions: CompositeContribution[];
};

export type CompositeMetricsAnalysis = {
  activityFreshness: CompositeMetricAnalysis;
  communityFootprint: CompositeMetricAnalysis;
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

export function buildCompositeMetrics(input: CompositeMetricsInput): CompositeMetrics {
  const analysis = buildCompositeMetricsAnalysis(input);

  return {
    activityFreshness: metric(analysis.activityFreshness.score, analysis.activityFreshness.inputs),
    communityFootprint: metric(analysis.communityFootprint.score, analysis.communityFootprint.inputs),
  };
}

export function buildCompositeMetricsAnalysis(input: CompositeMetricsInput): CompositeMetricsAnalysis {
  return {
    activityFreshness: buildActivityFreshnessAnalysis(input),
    communityFootprint: buildCommunityFootprintAnalysis(input),
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
    contributors: snapshot.contributors.totalCount ?? snapshot.contributors.fetchedCount,
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

function buildCommunityFootprintAnalysis(input: CompositeMetricsInput): CompositeMetricAnalysis {
  const contributions = [
    logContribution("stars", "Stars", input.stars, 100_000, 35),
    logContribution("forks", "Forks", input.forks, 25_000, 25),
    logContribution("watchers", "Watchers", input.watchers, 10_000, 15),
    logContribution("contributors", "Contributors", input.contributors, 100, 25),
  ];
  const rawScoreValue =
    logScore(input.stars, 100_000, 35) +
    logScore(input.forks, 25_000, 25) +
    logScore(input.watchers, 10_000, 15) +
    logScore(input.contributors, 100, 25);
  const score = clampScore(rawScoreValue);
  const rawScore = roundDetail(rawScoreValue);

  return {
    score,
    label: scoreLabel(score),
    rawScore,
    maxScore: 100,
    inputs: {
      stars: input.stars,
      forks: input.forks,
      watchers: input.watchers,
      contributors: input.contributors,
    },
    contributions,
  };
}

function metric(score: number, inputs: CompositeMetric["inputs"]): CompositeMetric {
  return {
    score,
    label: scoreLabel(score),
    inputs,
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

function logContribution(id: string, label: string, value: number, cap: number, weight: number): CompositeContribution {
  const cappedValue = Math.min(value, cap);
  const normalized = Math.log10(cappedValue + 1) / Math.log10(cap + 1);
  const points = normalized * weight;

  return {
    id,
    label,
    points: roundDetail(points),
    maxPoints: weight,
    rule: `logarithmic cap ${cap}`,
    detail: `value ${value}, cap ${cap}, weight ${weight}`,
    inputs: {
      value,
      cap,
      weight,
      cappedValue,
      normalized: roundDetail(normalized),
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

function sumPoints(contributions: CompositeContribution[]): number {
  return contributions.reduce((sum, contribution) => sum + contribution.points, 0);
}

function roundDetail(value: number): number {
  return Number(value.toFixed(2));
}

function formatDays(days: number | null): string {
  return days === null ? "n/a" : `${days}d`;
}

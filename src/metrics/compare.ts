import type { RepoSnapshot, SnapshotResult } from "../types";
import { formatRepoRef } from "../util/repo-ref";

export function buildComparisonSummary(results: SnapshotResult[]): string[] {
  const snapshots = results.filter((result): result is { ok: true; snapshot: RepoSnapshot } => result.ok);

  if (snapshots.length < 2) {
    return [];
  }

  const lines: string[] = [];
  const mostStars = maxBy(snapshots, ({ snapshot }) => snapshot.repository.stars);
  const freshest = minByNullable(snapshots, ({ snapshot }) => snapshot.activity.daysSinceLatestCommit);
  const newestRelease = minByNullable(snapshots, ({ snapshot }) => snapshot.activity.daysSinceLatestRelease);
  const mostContributors = maxBy(snapshots, ({ snapshot }) => snapshot.contributors.fetchedCount);
  const archived = snapshots.filter(({ snapshot }) => snapshot.repository.archived);

  if (mostStars && isDistinctMax(snapshots, ({ snapshot }) => snapshot.repository.stars)) {
    lines.push(`${name(mostStars.snapshot)} has the largest star count among the compared repositories.`);
  }

  if (freshest && isDistinctMinNullable(snapshots, ({ snapshot }) => snapshot.activity.daysSinceLatestCommit)) {
    lines.push(`${name(freshest.snapshot)} has the most recent default-branch commit.`);
  }

  if (newestRelease && isDistinctMinNullable(snapshots, ({ snapshot }) => snapshot.activity.daysSinceLatestRelease)) {
    lines.push(`${name(newestRelease.snapshot)} has the newest latest release.`);
  }

  if (mostContributors && isDistinctMax(snapshots, ({ snapshot }) => snapshot.contributors.fetchedCount)) {
    lines.push(`${name(mostContributors.snapshot)} has the largest fetched contributor set.`);
  }

  if (archived.length === 0) {
    lines.push("None of the compared repositories are archived.");
  } else {
    lines.push(`${archived.map(({ snapshot }) => name(snapshot)).join(", ")} ${archived.length === 1 ? "is" : "are"} archived.`);
  }

  return lines;
}

function name(snapshot: RepoSnapshot): string {
  return formatRepoRef(snapshot.ref);
}

function maxBy<T>(items: T[], selector: (item: T) => number): T | null {
  if (items.length === 0) {
    return null;
  }

  return items.reduce((best, item) => (selector(item) > selector(best) ? item : best), items[0]);
}

function minByNullable<T>(items: T[], selector: (item: T) => number | null): T | null {
  const present = items.filter((item) => selector(item) !== null);

  if (present.length === 0) {
    return null;
  }

  return present.reduce((best, item) => {
    const bestValue = selector(best);
    const itemValue = selector(item);
    return itemValue !== null && bestValue !== null && itemValue < bestValue ? item : best;
  }, present[0]);
}

function isDistinctMax<T>(items: T[], selector: (item: T) => number): boolean {
  const values = items.map(selector).sort((a, b) => b - a);
  return values.length > 1 && values[0] > values[1];
}

function isDistinctMinNullable<T>(items: T[], selector: (item: T) => number | null): boolean {
  const values = items
    .map(selector)
    .filter((value): value is number => value !== null)
    .sort((a, b) => a - b);

  return values.length > 1 && values[0] < values[1];
}

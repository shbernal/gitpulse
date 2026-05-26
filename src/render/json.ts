import { buildComparisonSummary } from "../metrics/compare";
import { buildCompositeMetricsAnalysisFromSnapshot } from "../metrics/composite";
import type { SnapshotResult, SnapshotSource, UserProfileResult } from "../types";

const schemaVersion = 3;

export function renderRepoJson(result: SnapshotResult, source?: SnapshotSource, options: { explainScores?: boolean } = {}): string {
  return JSON.stringify(
    {
      schemaVersion,
      command: "repo",
      ...(source ? { source } : {}),
      result,
      ...(options.explainScores && result.ok ? { analysis: buildCompositeMetricsAnalysisFromSnapshot(result.snapshot) } : {}),
    },
    null,
    2,
  );
}

export function renderComparisonJson(results: SnapshotResult[], sources: SnapshotSource[] = []): string {
  return JSON.stringify(
    {
      schemaVersion,
      command: "compare",
      results: sources.length > 0 ? results.map((result, index) => withSource(result, sources[index])) : results,
      summary: buildComparisonSummary(results),
    },
    null,
    2,
  );
}

export function renderDocsJson(result: SnapshotResult, source?: SnapshotSource): string {
  return JSON.stringify(
    {
      schemaVersion,
      command: "docs",
      ...(source ? { source } : {}),
      result: docsResult(result),
    },
    null,
    2,
  );
}

export function renderUserProfileJson(result: UserProfileResult, source?: SnapshotSource): string {
  return JSON.stringify(
    {
      schemaVersion,
      command: "user",
      ...(source ? { source } : {}),
      result,
    },
    null,
    2,
  );
}

function withSource(
  result: SnapshotResult,
  source: SnapshotSource | undefined,
): SnapshotResult | (SnapshotResult & { source: SnapshotSource }) {
  return source ? { ...result, source } : result;
}

function docsResult(result: SnapshotResult): unknown {
  if (!result.ok) {
    return result;
  }

  const { snapshot } = result;

  return {
    ok: true,
    ref: snapshot.ref,
    repository: {
      fullName: snapshot.repository.fullName,
      url: snapshot.repository.url,
    },
    fetchedAt: snapshot.fetchedAt,
    documentation: snapshot.documentation,
    warnings: snapshot.warnings,
  };
}

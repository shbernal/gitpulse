import { buildComparisonSummary } from "../metrics/compare";
import type { SnapshotResult, SnapshotSource } from "../types";

const schemaVersion = 2;

export function renderRepoJson(result: SnapshotResult, source?: SnapshotSource): string {
  return JSON.stringify(
    {
      schemaVersion,
      command: "repo",
      ...(source ? { source } : {}),
      result,
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

function withSource(
  result: SnapshotResult,
  source: SnapshotSource | undefined,
): SnapshotResult | (SnapshotResult & { source: SnapshotSource }) {
  return source ? { ...result, source } : result;
}

import { buildComparisonSummary } from "../metrics/compare";
import type { SnapshotResult } from "../types";

export function renderRepoJson(result: SnapshotResult): string {
  return JSON.stringify(result, null, 2);
}

export function renderComparisonJson(results: SnapshotResult[]): string {
  return JSON.stringify(
    {
      results,
      summary: buildComparisonSummary(results),
    },
    null,
    2,
  );
}

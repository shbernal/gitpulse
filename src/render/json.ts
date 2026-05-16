import { buildComparisonSummary } from "../metrics/compare";
import type { SnapshotResult } from "../types";

const schemaVersion = 1;

export function renderRepoJson(result: SnapshotResult): string {
  return JSON.stringify(
    {
      schemaVersion,
      command: "repo",
      result,
    },
    null,
    2,
  );
}

export function renderComparisonJson(results: SnapshotResult[]): string {
  return JSON.stringify(
    {
      schemaVersion,
      command: "compare",
      results,
      summary: buildComparisonSummary(results),
    },
    null,
    2,
  );
}

import { describe, expect, test } from "bun:test";
import { buildComparisonSummary } from "../src/metrics/compare";
import type { RepoSnapshot, SnapshotResult } from "../src/types";

describe("buildComparisonSummary", () => {
  test("summarizes deterministic differences", () => {
    const results: SnapshotResult[] = [
      { ok: true, snapshot: snapshot("a/one", 100, 10, 20, false) },
      { ok: true, snapshot: snapshot("b/two", 50, 1, 10, false) },
    ];

    expect(buildComparisonSummary(results)).toContain("one has the largest star count among the compared repositories.");
    expect(buildComparisonSummary(results)).toContain("two has the most recent default-branch commit.");
    expect(buildComparisonSummary(results)).toContain("None of the compared repositories are archived.");
  });

  test("keeps owners in summaries when compared repo names match", () => {
    const results: SnapshotResult[] = [
      { ok: true, snapshot: snapshot("a/tool", 100, 10, 20, false) },
      { ok: true, snapshot: snapshot("b/tool", 50, 1, 10, true) },
    ];

    expect(buildComparisonSummary(results)).toContain("a/tool has the largest star count among the compared repositories.");
    expect(buildComparisonSummary(results)).toContain("b/tool has the most recent default-branch commit.");
    expect(buildComparisonSummary(results)).toContain("b/tool is archived.");
  });
});

function snapshot(fullName: string, stars: number, commitDays: number, contributors: number, archived: boolean): RepoSnapshot {
  const [owner, name] = fullName.split("/");

  return {
    ref: { owner, name },
    fetchedAt: "2026-05-16T00:00:00.000Z",
    repository: {
      fullName,
      description: null,
      url: `https://github.com/${fullName}`,
      createdAt: "2020-01-01T00:00:00Z",
      pushedAt: "2026-05-01T00:00:00Z",
      updatedAt: "2026-05-01T00:00:00Z",
      defaultBranch: "main",
      primaryLanguage: "TypeScript",
      languages: [],
      license: "MIT",
      stars,
      forks: 0,
      watchers: 0,
      openIssues: 0,
      openPullRequests: 0,
      openIssuesAndPullRequests: 0,
      topics: [],
      archived,
      fork: false,
      disabled: false,
      template: false,
      sizeKb: 1,
    },
    activity: {
      ageDays: 1,
      daysSinceLastPush: commitDays,
      latestCommitAt: "2026-05-01T00:00:00Z",
      daysSinceLatestCommit: commitDays,
      latestReleaseAt: null,
      latestReleaseName: null,
      latestReleaseTag: null,
      daysSinceLatestRelease: null,
      releaseCount: 0,
      totalCommitCount: 100,
    },
    documentation: {
      readme: { present: false, path: null },
      changelog: { present: false, path: null },
      contributing: { present: false, path: null },
      codeOfConduct: { present: false, path: null },
      security: { present: false, path: null },
    },
    contributors: {
      fetchedCount: contributors,
      totalCount: contributors,
      fetchLimit: 100,
      truncated: false,
      topContributor: null,
      topContributorShare: null,
    },
    metrics: {
      activityFreshness: { score: 0, label: "weak", inputs: {} },
      communityFootprint: { score: 0, label: "weak", inputs: {} },
      maintenanceVisibility: { score: 0, label: "weak", inputs: {} },
    },
    warnings: [],
  };
}

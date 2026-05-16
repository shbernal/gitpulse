import { describe, expect, test } from "bun:test";
import { stripVTControlCharacters } from "node:util";
import { renderComparisonJson, renderRepoJson } from "../src/render/json";
import { renderComparison, renderRepo } from "../src/render/table";
import { shouldUseColor } from "../src/render/terminal";
import type { RepoSnapshot, SnapshotResult } from "../src/types";

describe("terminal rendering", () => {
  test("renders a compact repository report", () => {
    const output = renderRepo(snapshot("acme/tool"), { color: false });

    expect(output).toContain("gitpulse acme/tool");
    expect(output).toContain("[active] [source] [branch main] [TypeScript] [MIT]");
    expect(output).toContain("Pulse");
    expect(output).toContain("[########--]");
    expect(output).toContain("At a glance");
    expect(output).toContain("Watchers");
    expect(output).not.toContain("Subscribers");
    expect(output).not.toContain("+-");
  });

  test("renders a comparison scoreboard", () => {
    const output = renderComparison(
      [
        { ok: true, snapshot: snapshot("acme/one") },
        { ok: true, snapshot: snapshot("acme/two", { stars: 20, commitDays: 4 }) },
      ],
      { color: false },
    );

    expect(output).toContain("Scoreboard");
    expect(output).toContain("Repository");
    expect(output).toContain("Activity");
    expect(output).toContain("Repository Facts");
    expect(output).toContain("jan 2020");
    expect(output).toContain("Watchers");
    expect(output).not.toContain("Subscribers");
    expect(output).not.toContain("Summary");
    expect(output).not.toContain("Age");
    expect(output).not.toContain("+-");
  });

  test("can render semantic ANSI color", () => {
    const output = renderRepo(snapshot("acme/tool"), { color: true });

    expect(output).toContain("\u001b[");
    expect(output).toContain("\u001b[4m");
    expect(stripVTControlCharacters(output)).toContain("[active] [source] [branch main] [TypeScript] [MIT]");
  });

  test("keeps colored comparison table alignment equivalent to plain output", () => {
    const results: SnapshotResult[] = [
      { ok: true, snapshot: snapshot("acme/one") },
      { ok: true, snapshot: snapshot("acme/two", { stars: 20, commitDays: 400 }) },
    ];

    expect(stripVTControlCharacters(renderComparison(results, { color: true }))).toBe(renderComparison(results, { color: false }));
  });

  test("resolves terminal color mode from flags and environment", () => {
    expect(shouldUseColor("always", {}, { isTTY: false })).toBe(true);
    expect(shouldUseColor("never", { FORCE_COLOR: "1" }, { isTTY: true })).toBe(false);
    expect(shouldUseColor("auto", { NO_COLOR: "1" }, { isTTY: true })).toBe(false);
    expect(shouldUseColor("auto", { FORCE_COLOR: "1" }, { isTTY: false })).toBe(true);
  });
});

describe("JSON rendering", () => {
  test("wraps repo output in a stable envelope", () => {
    const result: SnapshotResult = { ok: true, snapshot: snapshot("acme/tool") };
    const parsed = JSON.parse(renderRepoJson(result));

    expect(parsed.schemaVersion).toBe(2);
    expect(parsed.command).toBe("repo");
    expect(parsed.result.ok).toBe(true);
    expect(parsed.result.snapshot.repository.fullName).toBe("acme/tool");
  });

  test("wraps comparison output in a stable envelope", () => {
    const results: SnapshotResult[] = [
      { ok: true, snapshot: snapshot("acme/one") },
      { ok: false, ref: null, input: "bad", error: { message: "Invalid repository reference." } },
    ];
    const parsed = JSON.parse(renderComparisonJson(results));

    expect(parsed.schemaVersion).toBe(2);
    expect(parsed.command).toBe("compare");
    expect(parsed.results).toHaveLength(2);
    expect(Array.isArray(parsed.summary)).toBe(true);
  });

  test("does not emit ANSI escapes in JSON output", () => {
    const result: SnapshotResult = { ok: true, snapshot: snapshot("acme/tool") };

    expect(renderRepoJson(result)).not.toContain("\u001b[");
    expect(renderComparisonJson([result])).not.toContain("\u001b[");
  });
});

function snapshot(
  fullName: string,
  options: {
    archived?: boolean;
    commitDays?: number;
    stars?: number;
  } = {},
): RepoSnapshot {
  const [owner, name] = fullName.split("/");
  const commitDays = options.commitDays ?? 2;

  return {
    ref: { owner, name },
    fetchedAt: "2026-05-16T00:00:00.000Z",
    repository: {
      fullName,
      description: "A useful developer tool.",
      url: `https://github.com/${fullName}`,
      createdAt: "2020-01-01T00:00:00Z",
      pushedAt: "2026-05-14T00:00:00Z",
      updatedAt: "2026-05-15T00:00:00Z",
      defaultBranch: "main",
      primaryLanguage: "TypeScript",
      languages: [
        { name: "TypeScript", bytes: 900, percent: 90 },
        { name: "Shell", bytes: 100, percent: 10 },
      ],
      license: "MIT",
      stars: options.stars ?? 100,
      forks: 12,
      watchers: 8,
      openIssues: 3,
      openPullRequests: 1,
      openIssuesAndPullRequests: 4,
      topics: ["cli", "github"],
      archived: options.archived ?? false,
      fork: false,
      disabled: false,
      template: false,
      sizeKb: 512,
    },
    activity: {
      ageDays: 2327,
      daysSinceLastPush: 2,
      latestCommitAt: "2026-05-14T00:00:00Z",
      daysSinceLatestCommit: commitDays,
      latestReleaseAt: "2026-05-01T00:00:00Z",
      latestReleaseName: "v1.0.0",
      latestReleaseTag: "v1.0.0",
      daysSinceLatestRelease: 15,
      releaseCount: 4,
    },
    documentation: {
      readme: { present: true, path: "README.md" },
      changelog: { present: true, path: "CHANGELOG.md" },
      contributing: { present: false, path: null },
      codeOfConduct: { present: false, path: null },
      security: { present: true, path: "SECURITY.md" },
    },
    contributors: {
      fetchedCount: 10,
      truncated: false,
      topContributor: { login: "octo", contributions: 42 },
      topContributorShare: 42,
    },
    metrics: {
      activityFreshness: { score: 82, label: "strong", inputs: {} },
      communityFootprint: { score: 48, label: "limited", inputs: {} },
      maintenanceVisibility: { score: 67, label: "moderate", inputs: {} },
    },
    warnings: [],
  };
}

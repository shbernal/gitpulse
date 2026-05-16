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
    expect(output).toContain("Contributors");
    expect(output).toContain("Total contributors");
    expect(output).toContain("Top contributor");
    expect(output).toContain("42 commits, 42%");
    expect(output).toContain("Total number of commits");
    expect(output).not.toContain("Subscribers");
    expect(output).not.toContain("+-");
  });

  test("renders repository size in human units", () => {
    const output = renderRepo(snapshot("acme/tool", { sizeKb: 1_221_981 }), { color: false });

    expect(output).toContain("Size");
    expect(output).toContain("1.2 GB");
    expect(output).not.toContain("1,221,981 KB");
  });

  test("renders cache source metadata when provided", () => {
    const output = renderRepo(snapshot("acme/tool"), { color: false }, { kind: "cache", cachedAt: "2026-05-13T00:00:00.000Z", ageHours: 72 });

    expect(output).toContain("data source: cache, fetched 3d ago");
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
    expect(output).not.toContain("Data sources");
    expect(output).toContain("Repository");
    expect(output).toContain("one");
    expect(output).toContain("two");
    expect(output).toContain("82/100");
    expect(output).toContain("48/100");
    expect(output).toContain("67/100");
    expect(output).not.toContain("acme/one");
    expect(output).not.toContain("acme/two");
    expect(output).not.toContain("Signals");
    expect(output).not.toContain("Activity freshness");
    expect(output).not.toContain("Community footprint");
    expect(output).not.toContain("Maintenance visibility");
    expect(output).not.toContain("82 strong");
    expect(output).toContain("Activity");
    expect(output).toContain("Repository Facts");
    expect(output).toContain("jan 2020");
    expect(output).toContain("Watchers");
    expect(output).not.toContain("Subscribers");
    expect(output).not.toContain("Summary");
    expect(output).not.toContain("Age");
    expect(output).not.toContain("+-");
  });

  test("keeps owner prefixes in comparison output when repo names match", () => {
    const output = renderComparison(
      [
        { ok: true, snapshot: snapshot("acme/tool") },
        { ok: true, snapshot: snapshot("octo/tool", { stars: 20, commitDays: 4 }) },
      ],
      { color: false },
    );

    expect(output).toContain("acme/tool");
    expect(output).toContain("octo/tool");
  });

  test("renders compact comparison source metadata when provided", () => {
    const output = renderComparison(
      [
        { ok: true, snapshot: snapshot("acme/one") },
        { ok: true, snapshot: snapshot("acme/two") },
      ],
      { color: false },
      [
        { kind: "api" },
        { kind: "stale-cache", cachedAt: "2026-05-01T00:00:00.000Z", ageHours: 360 },
      ],
    );

    expect(output).toContain("data sources: api; stale cache, fetched 15d ago");
    expect(output).not.toContain("Data sources");
    expect(output).not.toContain("Repository  Source");
    expect(output).toContain("stale cache, fetched 15d ago");
  });

  test("summarizes comparison cache source age ranges", () => {
    const output = renderComparison(
      [
        { ok: true, snapshot: snapshot("acme/one") },
        { ok: true, snapshot: snapshot("acme/two") },
      ],
      { color: false },
      [
        { kind: "cache", cachedAt: "2026-05-16T11:57:00.000Z", ageHours: 0.05 },
        { kind: "cache", cachedAt: "2026-05-16T11:51:00.000Z", ageHours: 0.15 },
      ],
    );

    expect(output).toContain("data sources: cache, fetched 3-9m ago");
    expect(output).not.toContain("Repository  Source");
  });

  test("can render semantic ANSI color", () => {
    const output = renderRepo(snapshot("acme/tool"), { color: true });

    expect(output).toContain("\u001b[");
    expect(output).toContain("\u001b[4m");
    expect(stripVTControlCharacters(output)).toContain("[active] [source] [branch main] [TypeScript] [MIT]");
  });

  test("colors known programming languages in human-readable output", () => {
    const output = renderRepo(snapshot("acme/tool"), { color: true });

    expect(output).toContain("\u001b[38;2;49;120;198mTypeScript");
    expect(output).toContain("\u001b[48;2;49;120;198m");
    expect(stripVTControlCharacters(output)).toContain("Primary language  TypeScript");
    expect(stripVTControlCharacters(output)).toContain("Language mix      TypeScript 90%, Shell 10%");
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
    const parsed = JSON.parse(renderRepoJson(result, { kind: "api" }));

    expect(parsed.schemaVersion).toBe(2);
    expect(parsed.command).toBe("repo");
    expect(parsed.source.kind).toBe("api");
    expect(parsed.result.ok).toBe(true);
    expect(parsed.result.snapshot.repository.fullName).toBe("acme/tool");
  });

  test("wraps comparison output in a stable envelope", () => {
    const results: SnapshotResult[] = [
      { ok: true, snapshot: snapshot("acme/one") },
      { ok: false, ref: null, input: "bad", error: { message: "Invalid repository reference." } },
    ];
    const parsed = JSON.parse(renderComparisonJson(results, [{ kind: "cache", cachedAt: "2026-05-16T00:00:00.000Z", ageHours: 1 }]));

    expect(parsed.schemaVersion).toBe(2);
    expect(parsed.command).toBe("compare");
    expect(parsed.results).toHaveLength(2);
    expect(parsed.results[0].source.kind).toBe("cache");
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
    sizeKb?: number;
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
      sizeKb: options.sizeKb ?? 512,
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
      totalCommitCount: 144,
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
      totalCount: 12,
      fetchLimit: 100,
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

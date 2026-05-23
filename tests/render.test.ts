import { describe, expect, test } from "bun:test";
import { stripVTControlCharacters } from "node:util";
import { renderComparisonJson, renderDocsJson, renderRepoJson, renderUserProfileJson } from "../src/render/json";
import { renderComparison, renderDocs, renderRepo, renderUserProfile } from "../src/render/table";
import { shouldUseColor } from "../src/render/terminal";
import type { RepoSnapshot, SnapshotResult, UserProfileResult, UserProfileSnapshot } from "../src/types";

describe("terminal rendering", () => {
  test("renders a compact repository report", () => {
    const output = renderRepo(snapshot("acme/tool"), { color: false });

    expect(output).toStartWith("Repo\nacme/tool (https://github.com/acme/tool)");
    expect(output).toContain("acme/tool (https://github.com/acme/tool)");
    expect(output).not.toContain("gitpulse acme/tool");
    expect(output.split("\n").every((line) => !line.startsWith("  "))).toBe(true);
    expect(output).toContain("[active] [source] [branch main] [TypeScript] [MIT]");
    expect(output).toContain("Pulse");
    expect(output).toContain("[########--]");
    expect(output).toContain("Activity freshness");
    expect(output).toContain("Community footprint");
    expect(output).not.toContain("Maintenance visibility");
    expect(output).not.toContain("Documentation");
    expect(output).toContain("At a glance");
    expect(section(output, "Repo", "Status")).toContain("Topics  cli, github");
    expect(section(output, "Project shape", "Data Provenance")).not.toContain("Topics");
    expect(output).toContain("Data Provenance");
    expect(output).toContain("\nData Provenance\nfetched 2026-05-16T00:00:00.000Z");
    expect(output).toContain("Watchers");
    expect(output).toContain("Contributors");
    expect(output).toContain("Total contributors");
    expect(output).toContain("Top contributor");
    expect(output).toContain("42 commits, 42%");
    expect(output).toContain("Total number of commits");
    expect(output).not.toContain("Subscribers");
    expect(output).not.toContain("+-");
  });

  test("allows longer repository descriptions before truncating", () => {
    const output = renderRepo(snapshot("acme/tool", { description: `${"x".repeat(250)} end` }), { color: false });

    expect(output).toContain(`${"x".repeat(237)}...`);
    expect(output).not.toContain(`${"x".repeat(238)}...`);
  });

  test("renders documentation signals in the dedicated docs report", () => {
    const output = renderDocs(snapshot("acme/tool"), { color: false }, { kind: "api" });

    expect(output).toContain("gitpulse docs acme/tool");
    expect(output).toContain("data source: api");
    expect(output).toContain("Documentation");
    expect(output).toContain("README");
    expect(output).toContain("present (README.md)");
    expect(output).toContain("Contributing");
    expect(output).toContain("missing");
    expect(output).not.toContain("Pulse");
    expect(output).not.toContain("Activity freshness");
  });

  test("renders repository size in human units", () => {
    const output = renderRepo(snapshot("acme/tool", { sizeKb: 1_221_981 }), { color: false });

    expect(output).toContain("Size");
    expect(output).toContain("1.2 GB");
    expect(output).not.toContain("1,221,981 KB");
  });

  test("renders a GitHub user profile report", () => {
    const output = renderUserProfile(userSnapshot("octocat"), { color: false }, { kind: "api" });

    expect(output).toContain("gitpulse user octocat");
    expect(output).toContain("data source: api");
    expect(output).toContain("Profile");
    expect(output).toContain("Followers");
    expect(output).toContain("Repository footprint");
    expect(output).toContain("Public repos fetched");
    expect(output).toContain("1 of 2");
    expect(output).toContain("Top repositories");
    expect(output).toContain("octocat/hello");
    expect(output).toContain("Recently pushed repositories");
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
    expect(output).toContain("Compared Repos");
    expect(output).not.toContain("gitpulse comparison");
    expect(output.indexOf("A useful developer tool.")).toBeLessThan(output.indexOf("Scoreboard"));
    expect(output).not.toContain("Data sources");
    expect(output).toContain("Repository");
    expect(output).toContain("one");
    expect(output).toContain("two");
    expect(output).toContain("82/100");
    expect(output).toContain("48/100");
    expect(output).not.toContain("67/100");
    expect(output).toContain("acme/one (https://github.com/acme/one)");
    expect(output).toContain("acme/two (https://github.com/acme/two)");
    expect(output).not.toContain("Signals");
    expect(output).not.toContain("Activity freshness");
    expect(output).not.toContain("Community footprint");
    expect(output).not.toContain("Maintenance visibility");
    expect(output).not.toContain("Documentation");
    expect(output).not.toContain("Docs");
    expect(output).not.toContain("82 strong");
    expect(output).toContain("Activity");
    expect(output).toContain("Repo Facts");
    expect(output).not.toContain("Repository Facts");
    expect(output).toContain("jan 2020");
    expect(output).toContain("Watchers");
    expect(output).not.toContain("Subscribers");
    expect(output).not.toContain("Summary");
    expect(output).not.toContain("Age");
    expect(output).not.toContain("+-");
    expect(output).toContain("Data Provenance");
    expect(output).toContain("\nData Provenance\nCompared 2 repositories");
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
    expect(output).toContain("Data Provenance");
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
    expect(output).toContain("\u001b[2m(https://github.com/acme/tool)");
    expect(stripVTControlCharacters(output)).toContain("[active] [source] [branch main] [TypeScript] [MIT]");
  });

  test("renders provenance warnings with an orange warning prefix", () => {
    const output = renderRepo(snapshot("acme/tool", { warnings: ["Repository is archived."] }), { color: true });

    expect(stripVTControlCharacters(output)).toContain("\n[warning] Repository is archived.");
    expect(output).toContain("\u001b[38;2;245;158;11m");
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

    expect(parsed.schemaVersion).toBe(3);
    expect(parsed.command).toBe("repo");
    expect(parsed.source.kind).toBe("api");
    expect(parsed.result.ok).toBe(true);
    expect(parsed.result.snapshot.repository.fullName).toBe("acme/tool");
    expect(parsed.result.snapshot.metrics.maintenanceVisibility).toBeUndefined();
  });

  test("wraps comparison output in a stable envelope", () => {
    const results: SnapshotResult[] = [
      { ok: true, snapshot: snapshot("acme/one") },
      { ok: false, ref: null, input: "bad", error: { message: "Invalid repository reference." } },
    ];
    const parsed = JSON.parse(renderComparisonJson(results, [{ kind: "cache", cachedAt: "2026-05-16T00:00:00.000Z", ageHours: 1 }]));

    expect(parsed.schemaVersion).toBe(3);
    expect(parsed.command).toBe("compare");
    expect(parsed.results).toHaveLength(2);
    expect(parsed.results[0].source.kind).toBe("cache");
    expect(Array.isArray(parsed.summary)).toBe(true);
  });

  test("wraps docs output in a focused JSON envelope", () => {
    const result: SnapshotResult = { ok: true, snapshot: snapshot("acme/tool") };
    const parsed = JSON.parse(renderDocsJson(result, { kind: "api" }));

    expect(parsed.schemaVersion).toBe(3);
    expect(parsed.command).toBe("docs");
    expect(parsed.source.kind).toBe("api");
    expect(parsed.result.ok).toBe(true);
    expect(parsed.result.repository.fullName).toBe("acme/tool");
    expect(parsed.result.documentation.readme.path).toBe("README.md");
    expect(parsed.result.snapshot).toBeUndefined();
  });

  test("wraps user profile output in a stable envelope", () => {
    const result: UserProfileResult = { ok: true, snapshot: userSnapshot("octocat") };
    const parsed = JSON.parse(renderUserProfileJson(result, { kind: "api" }));

    expect(parsed.schemaVersion).toBe(3);
    expect(parsed.command).toBe("user");
    expect(parsed.source.kind).toBe("api");
    expect(parsed.result.ok).toBe(true);
    expect(parsed.result.snapshot.profile.login).toBe("octocat");
    expect(parsed.result.snapshot.repositories.totalStars).toBe(10);
  });

  test("does not emit ANSI escapes in JSON output", () => {
    const result: SnapshotResult = { ok: true, snapshot: snapshot("acme/tool") };
    const userResult: UserProfileResult = { ok: true, snapshot: userSnapshot("octocat") };

    expect(renderRepoJson(result)).not.toContain("\u001b[");
    expect(renderComparisonJson([result])).not.toContain("\u001b[");
    expect(renderDocsJson(result)).not.toContain("\u001b[");
    expect(renderUserProfileJson(userResult)).not.toContain("\u001b[");
  });
});

function snapshot(
  fullName: string,
  options: {
    archived?: boolean;
    commitDays?: number;
    sizeKb?: number;
    stars?: number;
    description?: string | null;
    warnings?: string[];
  } = {},
): RepoSnapshot {
  const [owner, name] = fullName.split("/");
  const commitDays = options.commitDays ?? 2;

  return {
    ref: { owner, name },
    fetchedAt: "2026-05-16T00:00:00.000Z",
    repository: {
      fullName,
      description: options.description ?? "A useful developer tool.",
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
    },
    warnings: options.warnings ?? [],
  };
}

function section(output: string, title: string, nextTitle: string): string {
  const start = output.indexOf(title);
  const end = output.indexOf(`\n${nextTitle}`, start);
  return output.slice(start, end);
}

function userSnapshot(login: string): UserProfileSnapshot {
  const repository = {
    fullName: `${login}/hello`,
    name: "hello",
    description: null,
    url: `https://github.com/${login}/hello`,
    primaryLanguage: "TypeScript",
    stars: 10,
    forks: 2,
    archived: false,
    fork: false,
    createdAt: "2020-01-01T00:00:00Z",
    pushedAt: "2026-05-15T00:00:00Z",
    updatedAt: "2026-05-15T00:00:00Z",
    daysSinceLastPush: 1,
  };

  return {
    login,
    fetchedAt: "2026-05-16T00:00:00.000Z",
    profile: {
      login,
      name: "The Octocat",
      type: "User",
      bio: "GitHub mascot.",
      url: `https://github.com/${login}`,
      company: "GitHub",
      location: "San Francisco",
      blog: "https://github.blog",
      twitterUsername: "github",
      email: null,
      hireable: null,
      createdAt: "2011-01-25T18:44:36Z",
      updatedAt: "2026-05-01T00:00:00Z",
      ageDays: 5589,
      daysSinceUpdated: 15,
      publicRepos: 2,
      publicGists: 1,
      followers: 1200,
      following: 9,
      siteAdmin: false,
    },
    repositories: {
      publicRepoCount: 2,
      fetchedCount: 1,
      fetchLimit: 100,
      truncated: true,
      recentPushWindowDays: 90,
      recentlyPushedCount: 1,
      totalStars: 10,
      totalForks: 2,
      archivedCount: 0,
      forkCount: 0,
      primaryLanguages: [{ name: "TypeScript", repositoryCount: 1, percent: 100 }],
      topRepositories: [repository],
      recentlyPushedRepositories: [repository],
    },
    warnings: ["Repository footprint is based on the first 1 repositories sorted by recent updates."],
  };
}

import type {
  CompositeMetric,
  DocumentationSignal,
  RepoSnapshot,
  SnapshotResult,
  SnapshotSource,
  UserProfileSnapshot,
  UserRepositorySummary,
} from "../types";
import {
  buildCompositeMetricsAnalysisFromSnapshot,
  type CompositeContribution,
  type CompositeMetricAnalysis,
} from "../metrics/composite";
import { formatDate, formatDateWithAge, formatMonthYear, formatRelativeDays } from "../util/dates";
import { formatBool, formatCompactNumber, formatInteger, formatPercent, formatSizeKb, truncate } from "../util/format";
import { formatComparisonRepoLabels, formatRepoRef } from "../util/repo-ref";
import { createTheme, padVisibleEnd, scoreTone, type RenderOptions, visibleLength } from "./terminal";

type Section = {
  title: string;
  rows: Array<[string, string]>;
};

type Field = {
  label: string;
  value: string;
};

type Theme = ReturnType<typeof createTheme>;
type ThemeTone = Parameters<Theme["tone"]>[1];
type SnapshotSuccess = Extract<SnapshotResult, { ok: true }>;
type RepoRenderOptions = RenderOptions & {
  explainScores?: boolean;
};

const DESCRIPTION_MAX_LENGTH = 240;

export function renderRepo(snapshot: RepoSnapshot, options: RepoRenderOptions = {}, source?: SnapshotSource): string {
  const theme = createTheme(options);
  const output = [
    theme.section("Repo"),
    formatRepositoryTitle(snapshot, theme),
    ...renderRepositoryDescription(snapshot),
    renderKeyValueList([["Topics", formatTopics(snapshot, theme)]], theme, ""),
    "",
    theme.section("Pulse"),
    ...renderMetricRows(
      [
        ["Activity freshness", snapshot.metrics.activityFreshness],
        ["Community footprint", snapshot.metrics.communityFootprint],
      ],
      theme,
      "",
    ),
  ];

  if (options.explainScores) {
    output.push("", theme.section("Score Analysis"), ...renderScoreAnalysis(snapshot, theme));
  }

  output.push(
    "",
    theme.section("At a glance"),
    renderFieldGrid(
      [
        { label: "Stars", value: theme.value(formatCompactNumber(snapshot.repository.stars)) },
        { label: "Forks", value: theme.value(formatCompactNumber(snapshot.repository.forks)) },
        { label: "Watchers", value: theme.value(formatCompactNumber(snapshot.repository.watchers)) },
        { label: "Open issues", value: theme.value(formatInteger(snapshot.repository.openIssues)) },
        { label: "Open PRs", value: theme.value(formatInteger(snapshot.repository.openPullRequests)) },
      ],
      theme,
      2,
      "",
    ),
    "",
    theme.section("Activity"),
    renderFieldGrid(
      [
        { label: "Created", value: theme.value(formatDateWithAge(snapshot.repository.createdAt, snapshot.activity.ageDays)) },
        { label: "Last push", value: formatDateWithAgeTone(snapshot.repository.pushedAt, snapshot.activity.daysSinceLastPush, theme) },
        { label: "Updated", value: theme.value(formatDate(snapshot.repository.updatedAt)) },
        { label: "Latest commit", value: formatDateWithAgeTone(snapshot.activity.latestCommitAt, snapshot.activity.daysSinceLatestCommit, theme) },
        { label: "Latest release", value: formatRelease(snapshot, theme) },
        { label: "Releases", value: theme.value(formatInteger(snapshot.activity.releaseCount)) },
      ],
      theme,
      2,
      "",
    ),
    "",
    theme.section("Contributors"),
    renderKeyValueList(
      [
        ["Total contributors", formatContributorCount(snapshot, theme)],
        ["Top contributor", formatTopContributor(snapshot, theme)],
        ["Total number of commits", valueOrMissing(formatInteger(snapshot.activity.totalCommitCount), theme)],
      ],
      theme,
      "",
    ),
    "",
    theme.section("Project shape"),
    renderKeyValueList(
      [
        ["Default branch", theme.tone(snapshot.repository.defaultBranch, "info")],
        ["Primary language", formatPrimaryLanguage(snapshot.repository.primaryLanguage, theme)],
        ["Language mix", formatLanguageMix(snapshot, theme)],
        ["License", formatLicense(snapshot.repository.license, theme)],
        ["Size", theme.value(formatSizeKb(snapshot.repository.sizeKb))],
      ],
      theme,
      "",
    ),
    "",
  );

  output.push(...renderDataProvenance(theme, { fetchedAt: snapshot.fetchedAt, source, warnings: snapshot.warnings }));

  return output.join("\n").trimEnd();
}

export function renderDocs(snapshot: RepoSnapshot, options: RenderOptions = {}, source?: SnapshotSource): string {
  const theme = createTheme(options);
  const output = [
    theme.repo(`gitpulse docs ${formatRepoRef(snapshot.ref)}`),
    `  ${snapshot.repository.url}`,
    "",
    theme.section("Documentation"),
    renderKeyValueList(
      [
        ["README", formatDocumentation(snapshot.documentation.readme, theme)],
        ["Changelog", formatDocumentation(snapshot.documentation.changelog, theme)],
        ["Contributing", formatDocumentation(snapshot.documentation.contributing, theme)],
        ["Code of conduct", formatDocumentation(snapshot.documentation.codeOfConduct, theme)],
        ["Security policy", formatDocumentation(snapshot.documentation.security, theme)],
      ],
      theme,
    ),
    "",
  ];

  output.push(...renderDataProvenance(theme, { fetchedAt: snapshot.fetchedAt, source, warnings: snapshot.warnings }));

  return output.join("\n").trimEnd();
}

export function renderUserProfile(snapshot: UserProfileSnapshot, options: RenderOptions = {}, source?: SnapshotSource): string {
  const theme = createTheme(options);
  const output = [
    theme.repo(`gitpulse user ${snapshot.profile.login}`),
    ...(snapshot.profile.name ? [`  ${truncate(snapshot.profile.name, 120)}`] : []),
    ...(snapshot.profile.bio ? [`  ${truncate(snapshot.profile.bio, 120)}`] : []),
    `  ${snapshot.profile.url}`,
    "",
    theme.section("Profile"),
    renderFieldGrid(
      [
        { label: "Type", value: theme.value(snapshot.profile.type) },
        { label: "Created", value: theme.value(formatDateWithAge(snapshot.profile.createdAt, snapshot.profile.ageDays)) },
        { label: "Updated", value: formatDateWithAgeTone(snapshot.profile.updatedAt, snapshot.profile.daysSinceUpdated, theme) },
        { label: "Followers", value: theme.value(formatCompactNumber(snapshot.profile.followers)) },
        { label: "Following", value: theme.value(formatCompactNumber(snapshot.profile.following)) },
        { label: "Public repos", value: theme.value(formatInteger(snapshot.profile.publicRepos)) },
        { label: "Public gists", value: theme.value(formatInteger(snapshot.profile.publicGists)) },
        { label: "Hireable", value: formatNullableBool(snapshot.profile.hireable, theme) },
      ],
      theme,
    ),
    "",
    theme.section("Details"),
    renderKeyValueList(
      [
        ["Company", profileValue(snapshot.profile.company, theme)],
        ["Location", profileValue(snapshot.profile.location, theme)],
        ["Blog", profileValue(snapshot.profile.blog, theme)],
        ["Twitter/X", profileValue(snapshot.profile.twitterUsername, theme)],
        ["Email", profileValue(snapshot.profile.email, theme)],
        ["Site admin", formatBoolTone(snapshot.profile.siteAdmin, theme, "warn", "muted")],
      ],
      theme,
    ),
    "",
    theme.section("Repository footprint"),
    renderKeyValueList(
      [
        ["Public repos fetched", theme.value(formatFetchedCount(snapshot))],
        ["Total stars", theme.value(formatCompactNumber(snapshot.repositories.totalStars))],
        ["Total forks", theme.value(formatCompactNumber(snapshot.repositories.totalForks))],
        [
          "Recently pushed",
          theme.value(`${formatInteger(snapshot.repositories.recentlyPushedCount)} in last ${snapshot.repositories.recentPushWindowDays}d`),
        ],
        ["Archived repos", theme.value(formatInteger(snapshot.repositories.archivedCount))],
        ["Fork repos", theme.value(formatInteger(snapshot.repositories.forkCount))],
        ["Primary languages", formatUserLanguages(snapshot, theme)],
      ],
      theme,
    ),
    "",
    theme.section("Top repositories"),
    renderUserRepositoryTable(snapshot.repositories.topRepositories, theme),
    "",
    theme.section("Recently pushed repositories"),
    renderUserRepositoryTable(snapshot.repositories.recentlyPushedRepositories, theme),
    "",
  ];

  output.push(...renderDataProvenance(theme, { fetchedAt: snapshot.fetchedAt, source, warnings: snapshot.warnings }));

  return output.join("\n").trimEnd();
}

export function renderComparison(results: SnapshotResult[], options: RenderOptions = {}, sources: SnapshotSource[] = []): string {
  const theme = createTheme(options);
  const snapshots = results.filter((result): result is SnapshotSuccess => result.ok);
  const failures = results.filter((result) => !result.ok);
  const sourceSummary = formatComparisonSourceSummary(
    results.flatMap((result, index) => (result.ok && sources[index] ? [sources[index]] : [])),
  );

  if (snapshots.length === 0) {
    return [
      theme.section("Compared Repos"),
      "",
      "No repository data could be fetched.",
      "",
      ...failures.map((failure) => `  - ${failure.input}: ${theme.error(failure.error.message)}`),
    ].join("\n");
  }

  const repoLabels = formatComparisonRepoLabels(snapshots.map(({ snapshot }) => snapshot.repository.fullName));
  const headers = ["Metric", ...repoLabels];
  const sections = [
    {
      title: "Repo Facts",
      rows: [
        row("Created", snapshots, ({ snapshot }) => theme.value(formatMonthYear(snapshot.repository.createdAt))),
        row("Primary language", snapshots, ({ snapshot }) => formatPrimaryLanguage(snapshot.repository.primaryLanguage, theme)),
        row("License", snapshots, ({ snapshot }) => formatLicense(snapshot.repository.license, theme)),
        row("Archived", snapshots, ({ snapshot }) => formatBoolTone(snapshot.repository.archived, theme, "bad")),
        row("Fork", snapshots, ({ snapshot }) => formatBoolTone(snapshot.repository.fork, theme, "warn")),
      ],
    },
    {
      title: "Adoption",
      rows: [
        row("Stars", snapshots, ({ snapshot }) => theme.value(formatCompactNumber(snapshot.repository.stars))),
        row("Forks", snapshots, ({ snapshot }) => theme.value(formatCompactNumber(snapshot.repository.forks))),
        row("Watchers", snapshots, ({ snapshot }) => theme.value(formatCompactNumber(snapshot.repository.watchers))),
        row("Total contributors", snapshots, ({ snapshot }) => formatContributorCount(snapshot, theme)),
        row("Top contributor share", snapshots, ({ snapshot }) => valueOrMissing(formatPercent(snapshot.contributors.topContributorShare), theme)),
      ],
    },
    {
      title: "Activity",
      rows: [
        row("Last push", snapshots, ({ snapshot }) => formatRelativeDaysTone(snapshot.activity.daysSinceLastPush, theme)),
        row("Latest commit", snapshots, ({ snapshot }) => formatRelativeDaysTone(snapshot.activity.daysSinceLatestCommit, theme)),
        row("Latest release", snapshots, ({ snapshot }) => formatRelativeDaysTone(snapshot.activity.daysSinceLatestRelease, theme)),
        row("Total number of commits", snapshots, ({ snapshot }) => valueOrMissing(formatInteger(snapshot.activity.totalCommitCount), theme)),
        row("Release count", snapshots, ({ snapshot }) => theme.value(formatInteger(snapshot.activity.releaseCount))),
        row("Open issues", snapshots, ({ snapshot }) => theme.value(formatInteger(snapshot.repository.openIssues))),
        row("Open PRs", snapshots, ({ snapshot }) => theme.value(formatInteger(snapshot.repository.openPullRequests))),
      ],
    },
  ];

  const output = [
    theme.section("Compared Repos"),
    ...renderComparisonRepositoryDescriptions(snapshots, theme),
    "",
    theme.section("Scoreboard"),
    renderTable(
      ["Repository", "Activity", "Community", "Stars", "Forks", "Last commit", "Release", "State"],
      snapshots.map(({ snapshot }, index) => [
        theme.repo(repoLabels[index]),
        formatMetricCompact(snapshot.metrics.activityFreshness, theme),
        formatMetricCompact(snapshot.metrics.communityFootprint, theme),
        theme.value(formatCompactNumber(snapshot.repository.stars)),
        theme.value(formatCompactNumber(snapshot.repository.forks)),
        formatRelativeDaysTone(snapshot.activity.daysSinceLatestCommit, theme),
        formatRelativeDaysTone(snapshot.activity.daysSinceLatestRelease, theme),
        formatState(snapshot, theme),
      ]),
      theme,
    ),
    "",
  ];

  output.push(...sections.flatMap((section) => [theme.section(section.title), renderTable(headers, section.rows, theme), ""]));

  const warnings = snapshots.flatMap(({ snapshot }, index) =>
    snapshot.warnings.map((warning) => `${repoLabels[index]}: ${warning}`),
  );

  if (failures.length > 0) {
    output.push(theme.section("Fetch errors"), ...failures.map((failure) => `  - ${failure.input}: ${theme.error(failure.error.message)}`), "");
  }

  output.push(...renderDataProvenance(theme, { comparedCount: snapshots.length, sourceSummary, warnings }));

  return output.join("\n").trimEnd();
}

function renderFieldGrid(fields: Field[], theme: Theme, columns = 2, prefix = "  "): string {
  const labelWidth = Math.max(...fields.map((field) => visibleLength(field.label)));
  const cells = fields.map((field) => `${padVisibleEnd(theme.label(field.label), labelWidth)}  ${field.value}`);
  const cellWidth = Math.max(...cells.map((cell) => visibleLength(cell)));
  const lines: string[] = [];

  for (let index = 0; index < cells.length; index += columns) {
    const rowCells = cells
      .slice(index, index + columns)
      .map((cell, cellIndex, row) => (cellIndex === row.length - 1 ? cell : padVisibleEnd(cell, cellWidth)));
    lines.push(`${prefix}${rowCells.join("    ").trimEnd()}`);
  }

  return lines.join("\n");
}

function renderKeyValueList(rows: Array<[string, string]>, theme: Theme, prefix = "  "): string {
  const labelWidth = Math.max(...rows.map(([label]) => visibleLength(label)));
  return rows.map(([label, value]) => `${prefix}${padVisibleEnd(theme.label(label), labelWidth)}  ${value}`).join("\n");
}

function renderTable(headers: string[], rows: string[][], theme: Theme): string {
  const widths = headers.map((header, index) =>
    Math.max(visibleLength(header), ...rows.map((tableRow) => visibleLength(tableRow[index] ?? ""))),
  );
  const renderRow = (cells: string[]) => cells.map((cell, index) => padVisibleEnd(cell, widths[index])).join("  ").trimEnd();
  const separator = widths.map((width) => "-".repeat(width)).join("  ");

  return [theme.bold(renderRow(headers)), theme.muted(separator), ...rows.map(renderRow)].join("\n");
}

function renderUserRepositoryTable(repositories: UserRepositorySummary[], theme: Theme): string {
  if (repositories.length === 0) {
    return `  ${theme.missing()}`;
  }

  return renderTable(
    ["Repository", "Stars", "Forks", "Language", "Last push", "State"],
    repositories.map((repository) => [
      theme.repo(repository.fullName),
      theme.value(formatCompactNumber(repository.stars)),
      theme.value(formatCompactNumber(repository.forks)),
      formatPrimaryLanguage(repository.primaryLanguage, theme),
      formatDateWithAgeTone(repository.pushedAt, repository.daysSinceLastPush, theme),
      formatUserRepositoryState(repository, theme),
    ]),
    theme,
  );
}

function formatRepositoryTitle(snapshot: RepoSnapshot, theme: Theme): string {
  return `${theme.repo(snapshot.repository.fullName)} ${theme.muted(`(${snapshot.repository.url})`)}`;
}

function renderRepositoryDescription(snapshot: RepoSnapshot): string[] {
  return snapshot.repository.description ? [truncate(snapshot.repository.description, DESCRIPTION_MAX_LENGTH)] : [];
}

function renderComparisonRepositoryDescriptions(snapshots: SnapshotSuccess[], theme: Theme): string[] {
  return snapshots.flatMap(({ snapshot }) => [
    formatRepositoryTitle(snapshot, theme),
    ...renderRepositoryDescription(snapshot),
  ]);
}

function renderDataProvenance(
  theme: Theme,
  input: {
    fetchedAt?: string;
    source?: SnapshotSource;
    comparedCount?: number;
    sourceSummary?: string | null;
    warnings: string[];
  },
): string[] {
  const lines = [
    input.fetchedAt ? theme.muted(`fetched ${input.fetchedAt}`) : null,
    input.source ? `${theme.muted("data source:")} ${formatSnapshotSource(input.source)}` : null,
    input.comparedCount !== undefined ? `Compared ${theme.value(String(input.comparedCount))} repositories` : null,
    input.sourceSummary ? `${theme.muted("data sources:")} ${input.sourceSummary}` : null,
    ...input.warnings.map((warning) => theme.warning(`[warning] ${warning}`)),
  ].filter((line): line is string => Boolean(line));

  return lines.length > 0 ? [theme.section("Data Provenance"), ...lines, ""] : [];
}

function formatFetchedCount(snapshot: UserProfileSnapshot): string {
  const fetched = formatInteger(snapshot.repositories.fetchedCount);
  const total = formatInteger(snapshot.repositories.publicRepoCount);

  return snapshot.repositories.truncated ? `${fetched} of ${total}` : fetched;
}

function formatUserLanguages(snapshot: UserProfileSnapshot, theme: Theme): string {
  if (snapshot.repositories.primaryLanguages.length === 0) {
    return theme.missing();
  }

  return snapshot.repositories.primaryLanguages
    .map((language) => `${theme.language(language.name)} ${theme.value(`${formatInteger(language.repositoryCount)} repos, ${formatPercent(language.percent)}`)}`)
    .join(", ");
}

function formatUserRepositoryState(repository: UserRepositorySummary, theme: Theme): string {
  if (repository.archived) {
    return theme.tone("archived", "bad");
  }

  if (repository.fork) {
    return theme.tone("fork", "warn");
  }

  return theme.tone("source", "good");
}

function formatNullableBool(value: boolean | null, theme: Theme): string {
  return value === null ? theme.missing() : formatBoolTone(value, theme, "good", "muted");
}

function profileValue(value: string | null, theme: Theme): string {
  return value ? theme.value(value) : theme.missing();
}

function formatSnapshotSource(source: SnapshotSource): string {
  if (source.kind === "api") {
    return "api";
  }

  if (source.kind === "none") {
    return "none";
  }

  const label = source.kind === "stale-cache" ? "stale cache" : "cache";
  const refreshError = source.kind === "stale-cache" && source.refreshError ? `; refresh failed: ${source.refreshError.message}` : "";
  return `${label}, fetched ${formatCacheAge(source.ageHours)}${refreshError}`;
}

function formatComparisonSourceSummary(sources: SnapshotSource[]): string | null {
  if (sources.length === 0) {
    return null;
  }

  const apiCount = sources.filter((source) => source.kind === "api").length;
  const cacheAges = sources.flatMap((source) => (source.kind === "cache" ? [source.ageHours] : []));
  const staleSources = sources.filter((source): source is Extract<SnapshotSource, { kind: "stale-cache" }> => source.kind === "stale-cache");
  const noneCount = sources.filter((source) => source.kind === "none").length;
  const parts = [
    apiCount > 0 ? countLabel("api", apiCount, sources.length) : null,
    cacheAges.length > 0 ? `${countLabel("cache", cacheAges.length, sources.length)}, fetched ${formatCacheAgeRange(cacheAges)}` : null,
    staleSources.length > 0
      ? `${countLabel("stale cache", staleSources.length, sources.length)}, fetched ${formatCacheAgeRange(staleSources.map((source) => source.ageHours))}${
          staleSources.some((source) => source.refreshError) ? " (refresh failed)" : ""
        }`
      : null,
    noneCount > 0 ? countLabel("none", noneCount, sources.length) : null,
  ].filter((part): part is string => Boolean(part));

  return parts.join("; ");
}

function countLabel(label: string, count: number, total: number): string {
  return count > 1 && count !== total ? `${label} x${count}` : label;
}

function formatCacheAgeRange(ageHours: number[]): string {
  const sorted = [...ageHours].sort((a, b) => a - b);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];

  if (first === last) {
    return formatCacheAge(first);
  }

  const firstDuration = formatCacheAgeDuration(first);
  const lastDuration = formatCacheAgeDuration(last);

  if (firstDuration.unit && firstDuration.unit === lastDuration.unit) {
    return `${firstDuration.value}-${lastDuration.value}${firstDuration.unit} ago`;
  }

  return firstDuration.unit && lastDuration.unit ? `${firstDuration.text}-${lastDuration.text} ago` : `${firstDuration.text}-${lastDuration.text}`;
}

function formatCacheAge(ageHours: number): string {
  const duration = formatCacheAgeDuration(ageHours);
  return duration.unit ? `${duration.text} ago` : duration.text;
}

function formatCacheAgeDuration(ageHours: number): { text: string; value: string; unit: string | null } {
  if (!Number.isFinite(ageHours)) {
    return { text: "unknown age", value: "unknown age", unit: null };
  }

  if (ageHours < 1) {
    return { text: `${Math.max(1, Math.round(ageHours * 60))}m`, value: String(Math.max(1, Math.round(ageHours * 60))), unit: "m" };
  }

  if (ageHours < 48) {
    return { text: `${formatAgeNumber(ageHours)}h`, value: formatAgeNumber(ageHours), unit: "h" };
  }

  return { text: `${formatAgeNumber(ageHours / 24)}d`, value: formatAgeNumber(ageHours / 24), unit: "d" };
}

function formatAgeNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function row(
  label: string,
  snapshots: SnapshotSuccess[],
  selector: (item: SnapshotSuccess) => string,
): string[] {
  return [label, ...snapshots.map(selector)];
}

function renderMetricRows(metrics: Array<[string, CompositeMetric]>, theme: Theme, prefix = "  "): string[] {
  const labelWidth = Math.max(...metrics.map(([label]) => label.length));
  return metrics.map(([label, metric]) => {
    const tone = scoreTone(metric.score);
    const score = `${String(metric.score).padStart(3)}/100`;
    return `${prefix}${padVisibleEnd(theme.label(label), labelWidth)}  ${theme.bar(metric.score)}  ${theme.tone(score, tone)}  ${theme.tone(metric.label, tone)}`;
  });
}

function renderScoreAnalysis(snapshot: RepoSnapshot, theme: Theme): string[] {
  const analysis = buildCompositeMetricsAnalysisFromSnapshot(snapshot);

  return [
    ...renderMetricAnalysis("Activity freshness", analysis.activityFreshness, theme),
    "",
    ...renderMetricAnalysis("Community footprint", analysis.communityFootprint, theme),
  ];
}

function renderMetricAnalysis(label: string, analysis: CompositeMetricAnalysis, theme: Theme): string[] {
  const tone = scoreTone(analysis.score);
  const labelWidth = Math.max("Raw total".length, ...analysis.contributions.map((contribution) => contribution.label.length));
  const pointWidth = Math.max(
    `${formatPoints(analysis.rawScore, analysis.maxScore)}`.length,
    ...analysis.contributions.map((contribution) => formatPoints(contribution.points, contribution.maxPoints).length),
  );
  const rows = analysis.contributions.map((contribution) => renderContribution(contribution, theme, labelWidth, pointWidth));
  const rawPoints = padVisibleEnd(theme.value(formatPoints(analysis.rawScore, analysis.maxScore)), pointWidth);

  return [
    `${theme.label(label)}  ${theme.tone(`${analysis.score}/100`, tone)}  ${theme.tone(analysis.label, tone)}`,
    ...rows,
    [
      padVisibleEnd(theme.label("Raw total"), labelWidth),
      rawPoints,
      theme.muted(`raw ${formatPoint(analysis.rawScore)} -> rounded/clamped to ${analysis.score}/100`),
    ].join("  "),
  ];
}

function renderContribution(contribution: CompositeContribution, theme: Theme, labelWidth: number, pointWidth: number): string {
  const points = padVisibleEnd(theme.value(formatPoints(contribution.points, contribution.maxPoints)), pointWidth);
  return [
    padVisibleEnd(theme.label(contribution.label), labelWidth),
    points,
    theme.muted(`${contribution.rule} (${contribution.detail})`),
  ].join("  ");
}

function formatPoints(points: number, maxPoints: number): string {
  return `${formatSignedPoint(points)}/${formatPoint(maxPoints)}`;
}

function formatSignedPoint(value: number): string {
  if (value > 0) {
    return `+${formatPoint(value)}`;
  }

  if (value < 0) {
    return `-${formatPoint(Math.abs(value))}`;
  }

  return "0";
}

function formatPoint(value: number): string {
  if (Number.isInteger(value)) {
    return String(value);
  }

  return value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function formatPrimaryLanguage(language: string | null, theme: Theme): string {
  return language ? theme.language(language) : theme.missing();
}

function formatTopics(snapshot: RepoSnapshot, theme: Theme): string {
  return valueOrMissing(snapshot.repository.topics.length > 0 ? snapshot.repository.topics.join(", ") : "n/a", theme);
}

function formatLanguageMix(snapshot: RepoSnapshot, theme: Theme): string {
  if (snapshot.repository.languages.length === 0) {
    return theme.missing();
  }

  return snapshot.repository.languages
    .slice(0, 3)
    .map((language) => `${theme.language(language.name)} ${theme.value(formatPercent(language.percent))}`)
    .join(", ");
}

function formatRelease(snapshot: RepoSnapshot, theme: Theme): string {
  if (!snapshot.activity.latestReleaseAt) {
    return theme.missing();
  }

  const label = snapshot.activity.latestReleaseName || snapshot.activity.latestReleaseTag || "latest";
  return `${label} - ${formatDateWithAgeTone(snapshot.activity.latestReleaseAt, snapshot.activity.daysSinceLatestRelease, theme)}`;
}

function formatDocumentation(signal: DocumentationSignal, theme: Theme): string {
  return signal.present
    ? `${theme.tone("present", "good")} (${theme.muted(signal.path ?? "unknown")})`
    : theme.tone("missing", "warn");
}

function formatTopContributor(snapshot: RepoSnapshot, theme: Theme): string {
  if (!snapshot.contributors.topContributor) {
    return theme.missing();
  }

  const contributionCount = snapshot.contributors.topContributor.contributions;
  const share = formatPercent(snapshot.contributors.topContributorShare);
  const details = [`${theme.value(formatInteger(contributionCount))} ${contributionCount === 1 ? "commit" : "commits"}`];

  if (share !== "n/a") {
    details.push(theme.value(share));
  }

  return `${theme.value(snapshot.contributors.topContributor.login)} (${details.join(", ")})`;
}

function formatContributorCount(snapshot: RepoSnapshot, theme: Theme): string {
  const totalCount = snapshot.contributors.totalCount;

  if (totalCount !== null && totalCount !== undefined) {
    return theme.value(formatInteger(totalCount));
  }

  const fetchedCount = formatInteger(snapshot.contributors.fetchedCount);
  return snapshot.contributors.truncated ? `${theme.value(fetchedCount)} ${theme.muted("fetched")}` : theme.value(fetchedCount);
}

function formatMetricCompact(metric: CompositeMetric, theme: Theme): string {
  const tone = scoreTone(metric.score);
  return theme.tone(`${metric.score}/100`, tone);
}

function formatState(snapshot: RepoSnapshot, theme: Theme): string {
  const states = [
    snapshot.repository.archived ? theme.tone("archived", "bad") : null,
    snapshot.repository.disabled ? theme.tone("disabled", "bad") : null,
    snapshot.repository.fork ? theme.tone("fork", "warn") : null,
    snapshot.repository.template ? theme.tone("template", "info") : null,
  ].filter((state): state is string => Boolean(state));

  return states.length > 0 ? states.join(", ") : theme.tone("active", "good");
}

function formatDateWithAgeTone(isoDate: string | null | undefined, days: number | null, theme: Theme): string {
  const value = formatDateWithAge(isoDate, days);
  return value === "n/a" ? theme.missing(value) : theme.tone(value, activityTone(days));
}

function formatRelativeDaysTone(days: number | null, theme: Theme): string {
  const value = formatRelativeDays(days);
  return value === "n/a" ? theme.missing(value) : theme.tone(value, activityTone(days));
}

function activityTone(days: number | null): ThemeTone {
  if (days === null) {
    return "muted";
  }

  if (days <= 30) {
    return "good";
  }

  if (days <= 180) {
    return "info";
  }

  if (days <= 365) {
    return "warn";
  }

  return "bad";
}

function formatBoolTone(value: boolean, theme: Theme, trueTone: ThemeTone, falseTone: ThemeTone = "good"): string {
  return theme.tone(formatBool(value), value ? trueTone : falseTone);
}

function formatLicense(license: string | null, theme: Theme): string {
  return license ? theme.tone(license, "good") : theme.tone("n/a", "warn");
}

function valueOrMissing(value: string, theme: Theme): string {
  return value === "n/a" ? theme.missing(value) : theme.value(value);
}

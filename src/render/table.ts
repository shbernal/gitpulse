import type { CompositeMetric, DocumentationSignal, RepoSnapshot, SnapshotResult } from "../types";
import { formatDate, formatDateWithAge, formatRelativeDays } from "../util/dates";
import { formatBool, formatCompactNumber, formatInteger, formatPercent, truncate } from "../util/format";
import { formatRepoRef } from "../util/repo-ref";
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

export function renderRepo(snapshot: RepoSnapshot, options: RenderOptions = {}): string {
  const theme = createTheme(options);
  const output = [
    theme.repo(`gitpulse ${formatRepoRef(snapshot.ref)}`),
    ...(snapshot.repository.description ? [`  ${truncate(snapshot.repository.description, 120)}`] : []),
    `  ${snapshot.repository.url}`,
    theme.muted(`  fetched ${snapshot.fetchedAt}`),
    "",
    theme.section("Status"),
    `  ${repoBadges(snapshot, theme).join(" ")}`,
    "",
    theme.section("Pulse"),
    ...renderMetricRows(
      [
        ["Activity freshness", snapshot.metrics.activityFreshness],
        ["Community footprint", snapshot.metrics.communityFootprint],
        ["Maintenance visibility", snapshot.metrics.maintenanceVisibility],
      ],
      theme,
    ),
    "",
    theme.section("At a glance"),
    renderFieldGrid(
      [
        { label: "Stars", value: theme.value(formatCompactNumber(snapshot.repository.stars)) },
        { label: "Forks", value: theme.value(formatCompactNumber(snapshot.repository.forks)) },
        { label: "Watchers", value: theme.value(formatCompactNumber(snapshot.repository.watchers)) },
        { label: "Contributors", value: theme.value(formatContributorCount(snapshot)) },
        { label: "Open issues", value: theme.value(formatInteger(snapshot.repository.openIssues)) },
        { label: "Open PRs", value: theme.value(formatInteger(snapshot.repository.openPullRequests)) },
        { label: "Top contributor", value: formatTopContributor(snapshot, theme) },
        { label: "Top share", value: valueOrMissing(formatPercent(snapshot.contributors.topContributorShare), theme) },
      ],
      theme,
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
    ),
    "",
    theme.section("Project shape"),
    renderKeyValueList(
      [
        ["Default branch", theme.tone(snapshot.repository.defaultBranch, "info")],
        ["Primary language", valueOrMissing(snapshot.repository.primaryLanguage ?? "n/a", theme)],
        ["Language mix", valueOrMissing(formatLanguageMix(snapshot), theme)],
        ["License", formatLicense(snapshot.repository.license, theme)],
        ["Topics", valueOrMissing(snapshot.repository.topics.length > 0 ? snapshot.repository.topics.join(", ") : "n/a", theme)],
        ["Size", theme.value(`${formatInteger(snapshot.repository.sizeKb)} KB`)],
      ],
      theme,
    ),
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

  if (snapshot.warnings.length > 0) {
    output.push(theme.section("Warnings"), ...snapshot.warnings.map((warning) => `  - ${theme.warning(warning)}`), "");
  }

  return output.join("\n").trimEnd();
}

export function renderComparison(results: SnapshotResult[], options: RenderOptions = {}): string {
  const theme = createTheme(options);
  const snapshots = results.filter((result): result is SnapshotSuccess => result.ok);
  const failures = results.filter((result) => !result.ok);

  if (snapshots.length === 0) {
    return [
      theme.bold("gitpulse compare"),
      "",
      "No repository data could be fetched.",
      "",
      ...failures.map((failure) => `  - ${failure.input}: ${theme.error(failure.error.message)}`),
    ].join("\n");
  }

  const headers = ["Metric", ...snapshots.map(({ snapshot }) => snapshot.repository.fullName)];
  const sections = [
    {
      title: "Repository Facts",
      rows: [
        row("Created", snapshots, ({ snapshot }) => theme.value(formatDate(snapshot.repository.createdAt))),
        row("Primary language", snapshots, ({ snapshot }) => valueOrMissing(snapshot.repository.primaryLanguage ?? "n/a", theme)),
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
        row("Fetched contributors", snapshots, ({ snapshot }) => theme.value(formatInteger(snapshot.contributors.fetchedCount))),
        row("Top contributor share", snapshots, ({ snapshot }) => valueOrMissing(formatPercent(snapshot.contributors.topContributorShare), theme)),
      ],
    },
    {
      title: "Activity",
      rows: [
        row("Last push", snapshots, ({ snapshot }) => formatRelativeDaysTone(snapshot.activity.daysSinceLastPush, theme)),
        row("Latest commit", snapshots, ({ snapshot }) => formatRelativeDaysTone(snapshot.activity.daysSinceLatestCommit, theme)),
        row("Latest release", snapshots, ({ snapshot }) => formatRelativeDaysTone(snapshot.activity.daysSinceLatestRelease, theme)),
        row("Release count", snapshots, ({ snapshot }) => theme.value(formatInteger(snapshot.activity.releaseCount))),
        row("Open issues", snapshots, ({ snapshot }) => theme.value(formatInteger(snapshot.repository.openIssues))),
        row("Open PRs", snapshots, ({ snapshot }) => theme.value(formatInteger(snapshot.repository.openPullRequests))),
      ],
    },
    {
      title: "Documentation",
      rows: [
        row("README", snapshots, ({ snapshot }) => formatPresence(snapshot.documentation.readme.present, theme)),
        row("Changelog", snapshots, ({ snapshot }) => formatPresence(snapshot.documentation.changelog.present, theme)),
        row("Contributing", snapshots, ({ snapshot }) => formatPresence(snapshot.documentation.contributing.present, theme)),
        row("Code of conduct", snapshots, ({ snapshot }) => formatPresence(snapshot.documentation.codeOfConduct.present, theme)),
        row("Security policy", snapshots, ({ snapshot }) => formatPresence(snapshot.documentation.security.present, theme)),
      ],
    },
    {
      title: "Signals",
      rows: [
        row("Activity freshness", snapshots, ({ snapshot }) => formatScore(snapshot.metrics.activityFreshness.score, theme)),
        row("Community footprint", snapshots, ({ snapshot }) => formatScore(snapshot.metrics.communityFootprint.score, theme)),
        row("Maintenance visibility", snapshots, ({ snapshot }) => formatScore(snapshot.metrics.maintenanceVisibility.score, theme)),
      ],
    },
  ];

  const output = [
    theme.bold("gitpulse compare"),
    `Compared ${theme.value(String(snapshots.length))} repositories`,
    "",
    theme.section("Scoreboard"),
    renderTable(
      ["Repository", "Activity", "Community", "Maintenance", "Stars", "Forks", "Last commit", "Release", "Docs", "State"],
      snapshots.map(({ snapshot }) => [
        theme.repo(snapshot.repository.fullName),
        formatMetricCompact(snapshot.metrics.activityFreshness, theme),
        formatMetricCompact(snapshot.metrics.communityFootprint, theme),
        formatMetricCompact(snapshot.metrics.maintenanceVisibility, theme),
        theme.value(formatCompactNumber(snapshot.repository.stars)),
        theme.value(formatCompactNumber(snapshot.repository.forks)),
        formatRelativeDaysTone(snapshot.activity.daysSinceLatestCommit, theme),
        formatRelativeDaysTone(snapshot.activity.daysSinceLatestRelease, theme),
        formatDocumentationCount(snapshot, theme),
        formatState(snapshot, theme),
      ]),
      theme,
    ),
    "",
  ];

  output.push(...sections.flatMap((section) => [theme.section(section.title), renderTable(headers, section.rows, theme), ""]));

  const warnings = snapshots.flatMap(({ snapshot }) =>
    snapshot.warnings.map((warning) => `${snapshot.repository.fullName}: ${warning}`),
  );
  if (warnings.length > 0) {
    output.push(theme.section("Warnings"), ...warnings.map((warning) => `  - ${theme.warning(warning)}`), "");
  }

  if (failures.length > 0) {
    output.push(theme.section("Fetch errors"), ...failures.map((failure) => `  - ${failure.input}: ${theme.error(failure.error.message)}`), "");
  }

  return output.join("\n").trimEnd();
}

function renderFieldGrid(fields: Field[], theme: Theme, columns = 2): string {
  const labelWidth = Math.max(...fields.map((field) => visibleLength(field.label)));
  const cells = fields.map((field) => `${padVisibleEnd(theme.label(field.label), labelWidth)}  ${field.value}`);
  const cellWidth = Math.max(...cells.map((cell) => visibleLength(cell)));
  const lines: string[] = [];

  for (let index = 0; index < cells.length; index += columns) {
    const rowCells = cells
      .slice(index, index + columns)
      .map((cell, cellIndex, row) => (cellIndex === row.length - 1 ? cell : padVisibleEnd(cell, cellWidth)));
    lines.push(`  ${rowCells.join("    ").trimEnd()}`);
  }

  return lines.join("\n");
}

function renderKeyValueList(rows: Array<[string, string]>, theme: Theme): string {
  const labelWidth = Math.max(...rows.map(([label]) => visibleLength(label)));
  return rows.map(([label, value]) => `  ${padVisibleEnd(theme.label(label), labelWidth)}  ${value}`).join("\n");
}

function renderTable(headers: string[], rows: string[][], theme: Theme): string {
  const widths = headers.map((header, index) =>
    Math.max(visibleLength(header), ...rows.map((tableRow) => visibleLength(tableRow[index] ?? ""))),
  );
  const renderRow = (cells: string[]) => cells.map((cell, index) => padVisibleEnd(cell, widths[index])).join("  ").trimEnd();
  const separator = widths.map((width) => "-".repeat(width)).join("  ");

  return [theme.bold(renderRow(headers)), theme.muted(separator), ...rows.map(renderRow)].join("\n");
}

function row(
  label: string,
  snapshots: SnapshotSuccess[],
  selector: (item: SnapshotSuccess) => string,
): string[] {
  return [label, ...snapshots.map(selector)];
}

function repoBadges(snapshot: RepoSnapshot, theme: Theme): string[] {
  return [
    snapshot.repository.archived ? theme.badge("archived", "bad") : theme.badge("active", "good"),
    snapshot.repository.disabled ? theme.badge("disabled", "bad") : null,
    snapshot.repository.fork ? theme.badge("fork", "warn") : theme.badge("source", "muted"),
    snapshot.repository.template ? theme.badge("template", "info") : null,
    theme.badge(`branch ${snapshot.repository.defaultBranch}`, "info"),
    theme.badge(snapshot.repository.primaryLanguage ?? "language n/a", snapshot.repository.primaryLanguage ? "info" : "muted"),
    theme.badge(snapshot.repository.license ?? "no license", snapshot.repository.license ? "good" : "warn"),
  ].filter((badge): badge is string => Boolean(badge));
}

function renderMetricRows(metrics: Array<[string, CompositeMetric]>, theme: Theme): string[] {
  const labelWidth = Math.max(...metrics.map(([label]) => label.length));
  return metrics.map(([label, metric]) => {
    const tone = scoreTone(metric.score);
    const score = `${String(metric.score).padStart(3)}/100`;
    return `  ${padVisibleEnd(theme.label(label), labelWidth)}  ${theme.bar(metric.score)}  ${theme.tone(score, tone)}  ${theme.tone(metric.label, tone)}`;
  });
}

function formatLanguageMix(snapshot: RepoSnapshot): string {
  if (snapshot.repository.languages.length === 0) {
    return "n/a";
  }

  return snapshot.repository.languages
    .slice(0, 3)
    .map((language) => `${language.name} ${formatPercent(language.percent)}`)
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

  return `${theme.value(snapshot.contributors.topContributor.login)} (${theme.value(formatInteger(snapshot.contributors.topContributor.contributions))})`;
}

function formatContributorCount(snapshot: RepoSnapshot): string {
  return `${formatInteger(snapshot.contributors.fetchedCount)}${snapshot.contributors.truncated ? " first page" : ""}`;
}

function formatMetricCompact(metric: CompositeMetric, theme: Theme): string {
  const tone = scoreTone(metric.score);
  return `${theme.tone(String(metric.score), tone)} ${theme.tone(metric.label, tone)}`;
}

function documentationCount(snapshot: RepoSnapshot): number {
  return Object.values(snapshot.documentation).filter((signal) => signal.present).length;
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

function formatPresence(present: boolean, theme: Theme): string {
  return theme.tone(formatBool(present), present ? "good" : "warn");
}

function formatScore(score: number, theme: Theme): string {
  return theme.tone(String(score), scoreTone(score));
}

function formatDocumentationCount(snapshot: RepoSnapshot, theme: Theme): string {
  const count = documentationCount(snapshot);
  const tone: ThemeTone = count >= 4 ? "good" : count >= 2 ? "info" : count === 1 ? "warn" : "bad";
  return theme.tone(`${count}/5`, tone);
}

function formatLicense(license: string | null, theme: Theme): string {
  return license ? theme.tone(license, "good") : theme.tone("n/a", "warn");
}

function valueOrMissing(value: string, theme: Theme): string {
  return value === "n/a" ? theme.missing(value) : theme.value(value);
}

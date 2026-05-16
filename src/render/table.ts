import { buildComparisonSummary } from "../metrics/compare";
import type { CompositeMetric, DocumentationSignal, RepoSnapshot, SnapshotResult } from "../types";
import { formatDate, formatDateWithAge, formatRelativeDays } from "../util/dates";
import { formatBool, formatCompactNumber, formatInteger, formatPercent, truncate } from "../util/format";
import { formatRepoRef } from "../util/repo-ref";
import { createTheme, scoreTone, type RenderOptions } from "./terminal";

type Section = {
  title: string;
  rows: Array<[string, string]>;
};

type Field = {
  label: string;
  value: string;
};

type Theme = ReturnType<typeof createTheme>;
type SnapshotSuccess = Extract<SnapshotResult, { ok: true }>;

export function renderRepo(snapshot: RepoSnapshot, options: RenderOptions = {}): string {
  const theme = createTheme(options);
  const output = [
    theme.bold(`gitpulse ${formatRepoRef(snapshot.ref)}`),
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
    renderFieldGrid([
      { label: "Stars", value: formatCompactNumber(snapshot.repository.stars) },
      { label: "Forks", value: formatCompactNumber(snapshot.repository.forks) },
      { label: "Watchers", value: formatCompactNumber(snapshot.repository.watchers) },
      { label: "Contributors", value: formatContributorCount(snapshot) },
      { label: "Open issues", value: formatInteger(snapshot.repository.openIssues) },
      { label: "Open PRs", value: formatInteger(snapshot.repository.openPullRequests) },
      { label: "Top contributor", value: formatTopContributor(snapshot) },
      { label: "Top share", value: formatPercent(snapshot.contributors.topContributorShare) },
    ]),
    "",
    theme.section("Activity"),
    renderFieldGrid([
      { label: "Created", value: formatDateWithAge(snapshot.repository.createdAt, snapshot.activity.ageDays) },
      { label: "Last push", value: formatDateWithAge(snapshot.repository.pushedAt, snapshot.activity.daysSinceLastPush) },
      { label: "Updated", value: formatDate(snapshot.repository.updatedAt) },
      { label: "Latest commit", value: formatDateWithAge(snapshot.activity.latestCommitAt, snapshot.activity.daysSinceLatestCommit) },
      { label: "Latest release", value: formatRelease(snapshot) },
      { label: "Releases", value: formatInteger(snapshot.activity.releaseCount) },
    ]),
    "",
    theme.section("Project shape"),
    renderKeyValueList([
      ["Default branch", snapshot.repository.defaultBranch],
      ["Primary language", snapshot.repository.primaryLanguage ?? "n/a"],
      ["Language mix", formatLanguageMix(snapshot)],
      ["License", snapshot.repository.license ?? "n/a"],
      ["Topics", snapshot.repository.topics.length > 0 ? snapshot.repository.topics.join(", ") : "n/a"],
      ["Size", `${formatInteger(snapshot.repository.sizeKb)} KB`],
    ]),
    "",
    theme.section("Documentation"),
    renderKeyValueList([
      ["README", formatDocumentation(snapshot.documentation.readme)],
      ["Changelog", formatDocumentation(snapshot.documentation.changelog)],
      ["Contributing", formatDocumentation(snapshot.documentation.contributing)],
      ["Code of conduct", formatDocumentation(snapshot.documentation.codeOfConduct)],
      ["Security policy", formatDocumentation(snapshot.documentation.security)],
    ]),
    "",
  ];

  if (snapshot.warnings.length > 0) {
    output.push(theme.section("Warnings"), ...snapshot.warnings.map((warning) => `  - ${warning}`), "");
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
      ...failures.map((failure) => `  - ${failure.input}: ${failure.error.message}`),
    ].join("\n");
  }

  const headers = ["Metric", ...snapshots.map(({ snapshot }) => snapshot.repository.fullName)];
  const summary = buildComparisonSummary(results);
  const sections = [
    {
      title: "Repository Facts",
      rows: [
        row("Created", snapshots, ({ snapshot }) => formatDate(snapshot.repository.createdAt)),
        row("Age", snapshots, ({ snapshot }) => formatRelativeDays(snapshot.activity.ageDays)),
        row("Primary language", snapshots, ({ snapshot }) => snapshot.repository.primaryLanguage ?? "n/a"),
        row("License", snapshots, ({ snapshot }) => snapshot.repository.license ?? "n/a"),
        row("Archived", snapshots, ({ snapshot }) => formatBool(snapshot.repository.archived)),
        row("Fork", snapshots, ({ snapshot }) => formatBool(snapshot.repository.fork)),
      ],
    },
    {
      title: "Adoption",
      rows: [
        row("Stars", snapshots, ({ snapshot }) => formatCompactNumber(snapshot.repository.stars)),
        row("Forks", snapshots, ({ snapshot }) => formatCompactNumber(snapshot.repository.forks)),
        row("Watchers", snapshots, ({ snapshot }) => formatCompactNumber(snapshot.repository.watchers)),
        row("Fetched contributors", snapshots, ({ snapshot }) => formatInteger(snapshot.contributors.fetchedCount)),
        row("Top contributor share", snapshots, ({ snapshot }) => formatPercent(snapshot.contributors.topContributorShare)),
      ],
    },
    {
      title: "Activity",
      rows: [
        row("Last push", snapshots, ({ snapshot }) => formatRelativeDays(snapshot.activity.daysSinceLastPush)),
        row("Latest commit", snapshots, ({ snapshot }) => formatRelativeDays(snapshot.activity.daysSinceLatestCommit)),
        row("Latest release", snapshots, ({ snapshot }) => formatRelativeDays(snapshot.activity.daysSinceLatestRelease)),
        row("Release count", snapshots, ({ snapshot }) => formatInteger(snapshot.activity.releaseCount)),
        row("Open issues", snapshots, ({ snapshot }) => formatInteger(snapshot.repository.openIssues)),
        row("Open PRs", snapshots, ({ snapshot }) => formatInteger(snapshot.repository.openPullRequests)),
      ],
    },
    {
      title: "Documentation",
      rows: [
        row("README", snapshots, ({ snapshot }) => formatBool(snapshot.documentation.readme.present)),
        row("Changelog", snapshots, ({ snapshot }) => formatBool(snapshot.documentation.changelog.present)),
        row("Contributing", snapshots, ({ snapshot }) => formatBool(snapshot.documentation.contributing.present)),
        row("Code of conduct", snapshots, ({ snapshot }) => formatBool(snapshot.documentation.codeOfConduct.present)),
        row("Security policy", snapshots, ({ snapshot }) => formatBool(snapshot.documentation.security.present)),
      ],
    },
    {
      title: "Signals",
      rows: [
        row("Activity freshness", snapshots, ({ snapshot }) => String(snapshot.metrics.activityFreshness.score)),
        row("Community footprint", snapshots, ({ snapshot }) => String(snapshot.metrics.communityFootprint.score)),
        row("Maintenance visibility", snapshots, ({ snapshot }) => String(snapshot.metrics.maintenanceVisibility.score)),
      ],
    },
  ];

  const output = [
    theme.bold("gitpulse compare"),
    `Compared ${snapshots.length} repositories`,
    "",
    theme.section("Scoreboard"),
    renderTable(
      ["Repository", "Activity", "Community", "Maintenance", "Stars", "Forks", "Last commit", "Release", "Docs", "State"],
      snapshots.map(({ snapshot }) => [
        snapshot.repository.fullName,
        formatMetricCompact(snapshot.metrics.activityFreshness),
        formatMetricCompact(snapshot.metrics.communityFootprint),
        formatMetricCompact(snapshot.metrics.maintenanceVisibility),
        formatCompactNumber(snapshot.repository.stars),
        formatCompactNumber(snapshot.repository.forks),
        formatRelativeDays(snapshot.activity.daysSinceLatestCommit),
        formatRelativeDays(snapshot.activity.daysSinceLatestRelease),
        `${documentationCount(snapshot)}/5`,
        formatState(snapshot),
      ]),
      theme,
    ),
    "",
  ];

  if (summary.length > 0) {
    output.push(theme.section("Summary"), ...summary.map((line) => `  - ${line}`), "");
  }

  output.push(...sections.flatMap((section) => [theme.section(section.title), renderTable(headers, section.rows, theme), ""]));

  const warnings = snapshots.flatMap(({ snapshot }) =>
    snapshot.warnings.map((warning) => `${snapshot.repository.fullName}: ${warning}`),
  );
  if (warnings.length > 0) {
    output.push(theme.section("Warnings"), ...warnings.map((warning) => `  - ${warning}`), "");
  }

  if (failures.length > 0) {
    output.push(theme.section("Fetch errors"), ...failures.map((failure) => `  - ${failure.input}: ${failure.error.message}`), "");
  }

  return output.join("\n").trimEnd();
}

function renderFieldGrid(fields: Field[], columns = 2): string {
  const labelWidth = Math.max(...fields.map((field) => field.label.length));
  const cells = fields.map((field) => `${field.label.padEnd(labelWidth)}  ${field.value}`);
  const cellWidth = Math.max(...cells.map((cell) => cell.length));
  const lines: string[] = [];

  for (let index = 0; index < cells.length; index += columns) {
    const rowCells = cells
      .slice(index, index + columns)
      .map((cell, cellIndex, row) => (cellIndex === row.length - 1 ? cell : cell.padEnd(cellWidth)));
    lines.push(`  ${rowCells.join("    ").trimEnd()}`);
  }

  return lines.join("\n");
}

function renderKeyValueList(rows: Array<[string, string]>): string {
  const labelWidth = Math.max(...rows.map(([label]) => label.length));
  return rows.map(([label, value]) => `  ${label.padEnd(labelWidth)}  ${value}`).join("\n");
}

function renderTable(headers: string[], rows: string[][], theme: Theme): string {
  const widths = headers.map((header, index) =>
    Math.max(header.length, ...rows.map((tableRow) => tableRow[index]?.length ?? 0)),
  );
  const renderRow = (cells: string[]) => cells.map((cell, index) => cell.padEnd(widths[index])).join("  ").trimEnd();
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
    const score = `${String(metric.score).padStart(3)}/100`;
    return `  ${label.padEnd(labelWidth)}  ${theme.bar(metric.score)}  ${score}  ${theme.tone(metric.label, scoreTone(metric.score))}`;
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

function formatRelease(snapshot: RepoSnapshot): string {
  if (!snapshot.activity.latestReleaseAt) {
    return "n/a";
  }

  const label = snapshot.activity.latestReleaseName || snapshot.activity.latestReleaseTag || "latest";
  return `${label} - ${formatDateWithAge(snapshot.activity.latestReleaseAt, snapshot.activity.daysSinceLatestRelease)}`;
}

function formatDocumentation(signal: DocumentationSignal): string {
  return signal.present ? `present (${signal.path})` : "missing";
}

function formatTopContributor(snapshot: RepoSnapshot): string {
  if (!snapshot.contributors.topContributor) {
    return "n/a";
  }

  return `${snapshot.contributors.topContributor.login} (${formatInteger(snapshot.contributors.topContributor.contributions)})`;
}

function formatContributorCount(snapshot: RepoSnapshot): string {
  return `${formatInteger(snapshot.contributors.fetchedCount)}${snapshot.contributors.truncated ? " first page" : ""}`;
}

function formatMetricCompact(metric: CompositeMetric): string {
  return `${metric.score} ${metric.label}`;
}

function documentationCount(snapshot: RepoSnapshot): number {
  return Object.values(snapshot.documentation).filter((signal) => signal.present).length;
}

function formatState(snapshot: RepoSnapshot): string {
  const states = [
    snapshot.repository.archived ? "archived" : null,
    snapshot.repository.disabled ? "disabled" : null,
    snapshot.repository.fork ? "fork" : null,
    snapshot.repository.template ? "template" : null,
  ].filter((state): state is string => Boolean(state));

  return states.length > 0 ? states.join(", ") : "active";
}

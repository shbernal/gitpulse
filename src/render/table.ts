import { buildComparisonSummary } from "../metrics/compare";
import type { DocumentationSignal, RepoSnapshot, SnapshotResult } from "../types";
import { formatDate, formatDateWithAge, formatRelativeDays } from "../util/dates";
import { formatBool, formatCompactNumber, formatInteger, formatPercent, truncate } from "../util/format";
import { formatRepoRef } from "../util/repo-ref";

type Section = {
  title: string;
  rows: Array<[string, string]>;
};

export function renderRepo(snapshot: RepoSnapshot): string {
  const sections: Section[] = [
    {
      title: "Repository",
      rows: [
        ["Name", snapshot.repository.fullName],
        ["Description", snapshot.repository.description ? truncate(snapshot.repository.description, 100) : "n/a"],
        ["URL", snapshot.repository.url],
        ["Created", formatDateWithAge(snapshot.repository.createdAt, snapshot.activity.ageDays)],
        ["Updated", formatDate(snapshot.repository.updatedAt)],
        ["Last push", formatDateWithAge(snapshot.repository.pushedAt, snapshot.activity.daysSinceLastPush)],
        ["Default branch", snapshot.repository.defaultBranch],
        ["Primary language", snapshot.repository.primaryLanguage ?? "n/a"],
        ["Language mix", formatLanguageMix(snapshot)],
        ["License", snapshot.repository.license ?? "n/a"],
        ["Topics", snapshot.repository.topics.length > 0 ? snapshot.repository.topics.join(", ") : "n/a"],
        ["Archived", formatBool(snapshot.repository.archived)],
        ["Fork", formatBool(snapshot.repository.fork)],
        ["Template", formatBool(snapshot.repository.template)],
        ["Size", `${formatInteger(snapshot.repository.sizeKb)} KB`],
      ],
    },
    {
      title: "Adoption",
      rows: [
        ["Stars", formatCompactNumber(snapshot.repository.stars)],
        ["Forks", formatCompactNumber(snapshot.repository.forks)],
        ["Watchers", formatCompactNumber(snapshot.repository.watchers)],
        ["Open issues", formatInteger(snapshot.repository.openIssues)],
        ["Open pull requests", formatInteger(snapshot.repository.openPullRequests)],
      ],
    },
    {
      title: "Activity",
      rows: [
        ["Latest commit", formatDateWithAge(snapshot.activity.latestCommitAt, snapshot.activity.daysSinceLatestCommit)],
        ["Latest release", formatRelease(snapshot)],
        ["Release count", formatInteger(snapshot.activity.releaseCount)],
      ],
    },
    {
      title: "Documentation",
      rows: [
        ["README", formatDocumentation(snapshot.documentation.readme)],
        ["Changelog", formatDocumentation(snapshot.documentation.changelog)],
        ["Contributing", formatDocumentation(snapshot.documentation.contributing)],
        ["Code of conduct", formatDocumentation(snapshot.documentation.codeOfConduct)],
        ["Security policy", formatDocumentation(snapshot.documentation.security)],
      ],
    },
    {
      title: "Contributors",
      rows: [
        [
          "Fetched contributors",
          `${formatInteger(snapshot.contributors.fetchedCount)}${snapshot.contributors.truncated ? " (first page)" : ""}`,
        ],
        ["Top contributor", formatTopContributor(snapshot)],
        ["Top contributor share", formatPercent(snapshot.contributors.topContributorShare)],
      ],
    },
    {
      title: "Signals",
      rows: [
        ["Activity freshness", formatMetric(snapshot.metrics.activityFreshness.score, snapshot.metrics.activityFreshness.label)],
        ["Community footprint", formatMetric(snapshot.metrics.communityFootprint.score, snapshot.metrics.communityFootprint.label)],
        [
          "Maintenance visibility",
          formatMetric(snapshot.metrics.maintenanceVisibility.score, snapshot.metrics.maintenanceVisibility.label),
        ],
      ],
    },
  ];

  const output = [
    `gitpulse: ${formatRepoRef(snapshot.ref)}`,
    `Fetched: ${snapshot.fetchedAt}`,
    "",
    ...sections.flatMap((section) => [section.title, renderKeyValueTable(section.rows), ""]),
  ];

  if (snapshot.warnings.length > 0) {
    output.push("Warnings", ...snapshot.warnings.map((warning) => `- ${warning}`), "");
  }

  return output.join("\n").trimEnd();
}

export function renderComparison(results: SnapshotResult[]): string {
  const snapshots = results.filter((result): result is { ok: true; snapshot: RepoSnapshot } => result.ok);
  const failures = results.filter((result) => !result.ok);

  if (snapshots.length === 0) {
    return [
      "gitpulse compare",
      "",
      "No repository data could be fetched.",
      "",
      ...failures.map((failure) => `- ${failure.input}: ${failure.error.message}`),
    ].join("\n");
  }

  const headers = ["Metric", ...snapshots.map(({ snapshot }) => snapshot.repository.fullName)];
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
    "gitpulse compare",
    "",
    ...sections.flatMap((section) => [section.title, renderTable(headers, section.rows), ""]),
  ];

  const summary = buildComparisonSummary(results);
  if (summary.length > 0) {
    output.push("Summary", ...summary.map((line) => `- ${line}`), "");
  }

  const warnings = snapshots.flatMap(({ snapshot }) =>
    snapshot.warnings.map((warning) => `${snapshot.repository.fullName}: ${warning}`),
  );
  if (warnings.length > 0) {
    output.push("Warnings", ...warnings.map((warning) => `- ${warning}`), "");
  }

  if (failures.length > 0) {
    output.push("Fetch errors", ...failures.map((failure) => `- ${failure.input}: ${failure.error.message}`), "");
  }

  return output.join("\n").trimEnd();
}

function renderKeyValueTable(rows: Array<[string, string]>): string {
  return renderTable(["Metric", "Value"], rows);
}

function renderTable(headers: string[], rows: string[][]): string {
  const widths = headers.map((header, index) =>
    Math.max(header.length, ...rows.map((tableRow) => tableRow[index]?.length ?? 0)),
  );
  const border = `+-${widths.map((width) => "-".repeat(width)).join("-+-")}-+`;
  const renderRow = (cells: string[]) =>
    `| ${cells.map((cell, index) => cell.padEnd(widths[index])).join(" | ")} |`;

  return [border, renderRow(headers), border, ...rows.map(renderRow), border].join("\n");
}

function row(
  label: string,
  snapshots: Array<{ ok: true; snapshot: RepoSnapshot }>,
  selector: (item: { ok: true; snapshot: RepoSnapshot }) => string,
): string[] {
  return [label, ...snapshots.map(selector)];
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
  return signal.present ? `yes (${signal.path})` : "no";
}

function formatTopContributor(snapshot: RepoSnapshot): string {
  if (!snapshot.contributors.topContributor) {
    return "n/a";
  }

  return `${snapshot.contributors.topContributor.login} (${formatInteger(snapshot.contributors.topContributor.contributions)})`;
}

function formatMetric(score: number, label: string): string {
  return `${score}/100 (${label})`;
}

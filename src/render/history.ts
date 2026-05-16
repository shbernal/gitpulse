import type { HistoryEvent } from "../cache/history";
import { createTheme, padVisibleEnd, type RenderOptions, visibleLength } from "./terminal";

export function renderHistory(events: HistoryEvent[], options: RenderOptions = {}): string {
  const theme = createTheme(options);
  const rows = latestHistoryRows(events);

  if (rows.length === 0) {
    return "No history yet.";
  }

  const headers = ["Repository", "Last consulted", "Command", "Source", "Status"];
  const tableRows = rows.slice(0, 25).map((row) => [
    theme.repo(row.repository),
    theme.value(formatHistoryTimestamp(row.timestamp)),
    row.command,
    formatHistorySource(row.source, theme),
    row.ok ? theme.tone("ok", "good") : theme.tone("failed", "bad"),
  ]);

  return [theme.bold("gitpulse history"), "", renderPlainTable(headers, tableRows)].join("\n");
}

function latestHistoryRows(events: HistoryEvent[]): Array<{
  repository: string;
  timestamp: string;
  command: string;
  source: string;
  ok: boolean;
}> {
  const rows = new Map<string, { repository: string; timestamp: string; command: string; source: string; ok: boolean }>();

  for (const event of [...events].reverse()) {
    for (const entry of event.entries) {
      const repository = entry.repository ?? entry.input;

      if (!rows.has(repository)) {
        rows.set(repository, {
          repository,
          timestamp: event.timestamp,
          command: event.command,
          source: entry.source,
          ok: entry.ok,
        });
      }
    }
  }

  return [...rows.values()];
}

function renderPlainTable(headers: string[], rows: string[][]): string {
  const widths = headers.map((header, index) =>
    Math.max(visibleLength(header), ...rows.map((row) => visibleLength(row[index] ?? ""))),
  );
  const renderRow = (cells: string[]) => cells.map((cell, index) => padVisibleEnd(cell, widths[index])).join("  ").trimEnd();
  const separator = widths.map((width) => "-".repeat(width)).join("  ");

  return [renderRow(headers), separator, ...rows.map(renderRow)].join("\n");
}

function formatHistoryTimestamp(timestamp: string): string {
  const date = new Date(timestamp);

  if (Number.isNaN(date.getTime())) {
    return timestamp;
  }

  return date.toISOString().replace("T", " ").slice(0, 16);
}

function formatHistorySource(source: string, theme: ReturnType<typeof createTheme>): string {
  if (source === "api") {
    return theme.tone(source, "info");
  }

  if (source === "cache") {
    return theme.tone(source, "info");
  }

  if (source === "stale-cache") {
    return theme.tone(source, "warn");
  }

  return theme.muted(source);
}

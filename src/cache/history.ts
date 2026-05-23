import { appendFile, mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import type { SnapshotSource, SnapshotWithSource, UserProfileWithSource } from "../types";
import { historyPath } from "./paths";

type Env = Record<string, string | undefined>;

export type HistoryCommand = "repo" | "compare" | "docs" | "user";

export type HistoryEntry = {
  input: string;
  repository: string | null;
  user?: string | null;
  source: SnapshotSource["kind"];
  ok: boolean;
};

export type HistoryEvent = {
  timestamp: string;
  command: HistoryCommand;
  entries: HistoryEntry[];
  ok: boolean;
};

export async function appendHistoryEvent(event: HistoryEvent, env: Env = process.env): Promise<void> {
  const filePath = historyPath(env);
  await mkdir(path.dirname(filePath), { recursive: true });
  await appendFile(filePath, `${JSON.stringify(event)}\n`, "utf8");
}

export async function readHistoryEvents(env: Env = process.env): Promise<HistoryEvent[]> {
  const filePath = historyPath(env);

  try {
    const raw = await readFile(filePath, "utf8");
    return raw
      .split("\n")
      .filter((line) => line.trim().length > 0)
      .map((line) => safeParseHistoryEvent(line))
      .filter((event): event is HistoryEvent => Boolean(event));
  } catch (error) {
    if (isNotFound(error)) {
      return [];
    }

    throw error;
  }
}

export async function clearHistory(env: Env = process.env): Promise<string> {
  const filePath = historyPath(env);
  await rm(filePath, { force: true });
  return filePath;
}

export function buildHistoryEvent(
  command: HistoryCommand,
  inputs: string[],
  snapshots: Array<SnapshotWithSource | UserProfileWithSource>,
  now = new Date(),
): HistoryEvent {
  const entries = snapshots.map((snapshot, index) => {
    const entry: HistoryEntry = {
      input: inputs[index] ?? "",
      repository: snapshot.result.ok && "repository" in snapshot.result.snapshot ? snapshot.result.snapshot.repository.fullName : null,
      source: snapshot.source.kind,
      ok: snapshot.result.ok,
    };

    if (snapshot.result.ok && "profile" in snapshot.result.snapshot) {
      entry.user = snapshot.result.snapshot.profile.login;
    }

    return entry;
  });

  return {
    timestamp: now.toISOString(),
    command,
    entries,
    ok: entries.every((entry) => entry.ok),
  };
}

function safeParseHistoryEvent(line: string): HistoryEvent | null {
  try {
    const value = JSON.parse(line) as unknown;
    return isHistoryEvent(value) ? value : null;
  } catch {
    return null;
  }
}

function isHistoryEvent(value: unknown): value is HistoryEvent {
  if (!isRecord(value) || typeof value.timestamp !== "string" || typeof value.command !== "string") {
    return false;
  }

  if (value.command !== "repo" && value.command !== "compare" && value.command !== "docs" && value.command !== "user") {
    return false;
  }

  if (!Array.isArray(value.entries) || typeof value.ok !== "boolean") {
    return false;
  }

  return value.entries.every(
    (entry) =>
      isRecord(entry) &&
      typeof entry.input === "string" &&
      (typeof entry.repository === "string" || entry.repository === null) &&
      (entry.user === undefined || typeof entry.user === "string" || entry.user === null) &&
      typeof entry.source === "string" &&
      typeof entry.ok === "boolean",
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNotFound(error: unknown): boolean {
  return isRecord(error) && error.code === "ENOENT";
}

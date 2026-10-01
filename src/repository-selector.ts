import { spawn } from "node:child_process";
import { accessSync, constants } from "node:fs";
import { delimiter, join } from "node:path";
import { padVisibleEnd, visibleLength } from "./render/terminal";
import type { SearchRepositorySummary, StarredRepositorySummary } from "./types";
import { formatCompactNumber } from "./util/format";

type Env = Record<string, string | undefined>;

export type StarredRepositorySelector = (repositories: StarredRepositorySummary[]) => Promise<string | null>;
export type SearchRepositorySelector = (repositories: SearchRepositorySummary[]) => Promise<string | null>;

export async function selectStarredRepository(
  repositories: StarredRepositorySummary[],
  env: Env = process.env,
): Promise<string | null> {
  const rows = repositories.map((repository) => [repository.fullName]);

  return selectRepository(rows, "starred", "Filter starred repositories", env, "gitpulse starred --list");
}

export async function selectSearchRepository(
  repositories: SearchRepositorySummary[],
  env: Env = process.env,
): Promise<string | null> {
  const rows = repositories.map(searchRepositoryRow);

  return selectRepository(rows, "search", "Filter search results", env, "gitpulse search <query> --list or --lucky");
}

type SelectionResult = { kind: "selected"; value: string } | { kind: "cancelled" } | { kind: "failed"; reason: string };

/** Each row's first cell is the `owner/name` handed back; the rest is context for the picker. */
async function selectRepository(
  rows: string[][],
  prompt: string,
  placeholder: string,
  env: Env,
  fallbackCommand: string,
): Promise<string | null> {
  const selector = selectorCommand(prompt, placeholder, env);

  if (!selector) {
    throw new Error(`No selector found. Install fzf or gum, or use ${fallbackCommand}.`);
  }

  const result = await runSelectionCommand(selector.command, selector.args, alignRows(rows), env);

  if (result.kind === "failed") {
    throw new Error(`${selector.command} failed with ${result.reason}.`);
  }

  return result.kind === "selected" ? result.value.split(/\s/, 1)[0] : null;
}

function selectorCommand(prompt: string, placeholder: string, env: Env): { command: string; args: string[] } | null {
  if (commandExists("fzf", env)) {
    return {
      command: "fzf",
      args: ["--height=40%", "--layout=reverse", "--border", `--prompt=${prompt}> `, "--select-1", "--exit-0"],
    };
  }

  if (commandExists("gum", env)) {
    return {
      command: "gum",
      args: ["filter", "--placeholder", placeholder, "--height", "20", "--limit", "1", "--select-if-one"],
    };
  }

  return null;
}

function alignRows(rows: string[][]): string {
  const widths = rows.reduce<number[]>(
    (current, row) => row.map((cell, index) => Math.max(current[index] ?? 0, visibleLength(cell))),
    [],
  );

  return rows
    .map((row) =>
      row.map((cell, index) => (index === row.length - 1 ? cell : padVisibleEnd(cell, widths[index]))).join("  "),
    )
    .join("\n");
}

function searchRepositoryRow(repository: SearchRepositorySummary): string[] {
  return [
    repository.fullName,
    `${formatCompactNumber(repository.stars)} stars`,
    repository.primaryLanguage ?? "-",
    formatShortDate(repository.pushedAt ?? repository.updatedAt),
    sanitizeDescription(repository.description),
  ];
}

function sanitizeDescription(description: string | null): string {
  return (description ?? "").replace(/\s+/g, " ").trim();
}

function formatShortDate(value: string | null): string {
  return value ? value.slice(0, 10) : "-";
}

function commandExists(command: string, env: Env): boolean {
  const extensions = process.platform === "win32" ? (env.PATHEXT ?? ".EXE;.CMD;.BAT").split(";") : [""];

  return (env.PATH ?? "")
    .split(delimiter)
    .filter((directory) => directory !== "")
    .some((directory) =>
      extensions.some((extension) => {
        try {
          accessSync(join(directory, `${command}${extension}`), constants.X_OK);
          return true;
        } catch {
          return false;
        }
      }),
    );
}

// fzf and gum both exit 1 when nothing was chosen and 130 on Ctrl-C.
const cancelExitCodes = new Set([1, 130]);

function runSelectionCommand(command: string, args: string[], input: string, env: Env): Promise<SelectionResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env,
      stdio: ["pipe", "pipe", "inherit"],
    });
    const output: Buffer[] = [];
    let settled = false;

    const settle = (fn: () => void) => {
      if (settled) {
        return;
      }

      settled = true;
      fn();
    };

    child.stdout?.on("data", (chunk: Buffer) => {
      output.push(chunk);
    });

    child.once("error", (error) => {
      settle(() => {
        reject(error);
      });
    });

    child.once("close", (code, signal) => {
      settle(() => {
        if (code === 0) {
          const selected = Buffer.concat(output).toString("utf8").trim();
          resolve(selected.length > 0 ? { kind: "selected", value: selected } : { kind: "cancelled" });
          return;
        }

        if (signal === "SIGINT" || (code !== null && cancelExitCodes.has(code))) {
          resolve({ kind: "cancelled" });
          return;
        }

        resolve({ kind: "failed", reason: code === null ? `signal ${signal}` : `exit code ${code}` });
      });
    });

    child.stdin?.end(input.length > 0 ? `${input}\n` : "");
  });
}

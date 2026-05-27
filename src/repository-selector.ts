import { spawn } from "node:child_process";
import type { SearchRepositorySummary, StarredRepositorySummary } from "./types";
import { formatCompactNumber } from "./util/format";

type Env = Record<string, string | undefined>;

export type StarredRepositorySelector = (repositories: StarredRepositorySummary[]) => Promise<string | null>;
export type SearchRepositorySelector = (repositories: SearchRepositorySummary[]) => Promise<string | null>;

export async function selectStarredRepository(
  repositories: StarredRepositorySummary[],
  env: Env = process.env,
): Promise<string | null> {
  const input = repositories.map((repository) => repository.fullName).join("\n");

  return selectRepository(input, "starred", "Filter starred repositories", env, "gitpulse starred --list");
}

export async function selectSearchRepository(
  repositories: SearchRepositorySummary[],
  env: Env = process.env,
): Promise<string | null> {
  const input = repositories.map(formatSearchRepositoryRow).join("\n");
  const selected = await selectRepository(input, "search", "Filter search results", env, "gitpulse search <query> --list or --lucky");

  return selected ? selected.split("\t")[0] : null;
}

async function selectRepository(
  input: string,
  prompt: string,
  placeholder: string,
  env: Env,
  fallbackCommand: string,
): Promise<string | null> {
  if (await commandExists("fzf", env)) {
    return runSelectionCommand(
      "fzf",
      [
        "--height=40%",
        "--layout=reverse",
        "--border",
        `--prompt=${prompt}> `,
        "--select-1",
        "--exit-0",
        "--delimiter=\t",
        "--with-nth=1,2,3,4,5",
      ],
      input,
      env,
    );
  }

  if (await commandExists("gum", env)) {
    return runSelectionCommand(
      "gum",
      [
        "filter",
        "--placeholder",
        placeholder,
        "--height",
        "20",
        "--limit",
        "1",
        "--select-if-one",
      ],
      input,
      env,
    );
  }

  throw new Error(`No selector found. Install fzf or gum, or use ${fallbackCommand}.`);
}

function formatSearchRepositoryRow(repository: SearchRepositorySummary): string {
  return [
    repository.fullName,
    `${formatCompactNumber(repository.stars)} stars`,
    repository.primaryLanguage ?? "-",
    formatShortDate(repository.pushedAt ?? repository.updatedAt),
    sanitizeDescription(repository.description),
  ].join("\t");
}

function sanitizeDescription(description: string | null): string {
  return (description ?? "").replace(/\s+/g, " ").trim();
}

function formatShortDate(value: string | null): string {
  return value ? value.slice(0, 10) : "-";
}

function commandExists(command: string, env: Env): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(command, ["--version"], { env, stdio: "ignore" });

    child.once("error", () => {
      resolve(false);
    });

    child.once("close", (code) => {
      resolve(code === 0);
    });
  });
}

function runSelectionCommand(command: string, args: string[], input: string, env: Env): Promise<string | null> {
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

    child.once("close", (code) => {
      settle(() => {
        if (code === 0) {
          const selected = Buffer.concat(output).toString("utf8").trim();
          resolve(selected.length > 0 ? selected : null);
          return;
        }

        resolve(null);
      });
    });

    child.stdin?.end(input.length > 0 ? `${input}\n` : "");
  });
}

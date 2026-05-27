import { spawn } from "node:child_process";
import type { StarredRepositorySummary } from "./types";

type Env = Record<string, string | undefined>;

export type StarredRepositorySelector = (repositories: StarredRepositorySummary[]) => Promise<string | null>;

export async function selectStarredRepository(
  repositories: StarredRepositorySummary[],
  env: Env = process.env,
): Promise<string | null> {
  const input = repositories.map((repository) => repository.fullName).join("\n");

  if (await commandExists("fzf", env)) {
    return runSelectionCommand(
      "fzf",
      [
        "--height=40%",
        "--layout=reverse",
        "--border",
        "--prompt=starred> ",
        "--select-1",
        "--exit-0",
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
        "Filter starred repositories",
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

  throw new Error("No selector found. Install fzf or gum, or use gitpulse starred --list.");
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

import { spawn } from "node:child_process";
import { parseGitHubLogin } from "./util/github-login";
import { formatRepoRef, parseRepoRef } from "./util/repo-ref";

export type UrlOpener = (url: string) => Promise<void>;

export type BrowserOpenCommand = {
  command: string;
  args: string[];
};

export function githubRepoUrl(input: string): string {
  const ref = parseRepoRef(input);
  return `https://github.com/${formatRepoRef(ref)}`;
}

export function githubUserUrl(input: string): string {
  return `https://github.com/${parseGitHubLogin(input)}`;
}

export function browserOpenCommand(url: string, platform = process.platform): BrowserOpenCommand {
  if (platform === "darwin") {
    return { command: "open", args: [url] };
  }

  if (platform === "win32") {
    return { command: "cmd", args: ["/c", "start", "", url] };
  }

  return { command: "xdg-open", args: [url] };
}

export async function openUrlInBrowser(url: string): Promise<void> {
  const { command, args } = browserOpenCommand(url);

  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { stdio: "ignore" });
    let settled = false;

    const settle = (fn: () => void) => {
      if (settled) {
        return;
      }

      settled = true;
      fn();
    };

    child.once("error", (error) => {
      settle(() => {
        reject(new Error(`Could not open ${url}: ${error.message}`));
      });
    });

    child.once("close", (code, signal) => {
      settle(() => {
        if (code === 0) {
          resolve();
          return;
        }

        const reason = signal ? `signal ${signal}` : `exit code ${code ?? "unknown"}`;
        reject(new Error(`Could not open ${url}: ${command} exited with ${reason}.`));
      });
    });
  });
}

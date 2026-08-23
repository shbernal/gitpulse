import { spawn } from "node:child_process";
import { formatRepoRef, parseRepoRef } from "./repo-ref";

export type GitHubRemote = {
  name: string;
  fullName: string;
};

export type GitRepositoryInference =
  | { kind: "inferred"; fullName: string; remote: string; upstreamFullName?: string }
  | { kind: "outside-checkout" }
  | { kind: "no-github-remote" }
  | { kind: "ambiguous"; candidates: GitHubRemote[] };

export type GitRunner = (args: string[], cwd: string) => Promise<{ ok: boolean; stdout: string }>;

export type GitRemoteInferenceOptions = {
  cwd?: string;
  run?: GitRunner;
};

const githubHosts = new Set(["github.com", "www.github.com", "ssh.github.com"]);

export async function inferRepositoryFromGitRemotes(
  options: GitRemoteInferenceOptions = {},
): Promise<GitRepositoryInference> {
  const run = options.run ?? runGit;
  const result = await run(["remote", "--verbose"], options.cwd ?? process.cwd());

  if (!result.ok) {
    return { kind: "outside-checkout" };
  }

  return selectGitHubRemote(parseGitRemoteOutput(result.stdout));
}

export function parseGitRemoteOutput(output: string): GitHubRemote[] {
  const remotes: GitHubRemote[] = [];
  const seen = new Set<string>();

  for (const line of output.split("\n")) {
    const match = /^(\S+)\s+(\S+)\s+\(fetch\)$/.exec(line.trim());

    if (!match) {
      continue;
    }

    const [, name, url] = match;
    const fullName = parseGitHubRemoteUrl(url);

    if (!fullName || seen.has(name)) {
      continue;
    }

    seen.add(name);
    remotes.push({ name, fullName });
  }

  return remotes;
}

export function parseGitHubRemoteUrl(url: string): string | null {
  const location = splitRemoteUrl(url.trim());

  if (!location || !githubHosts.has(location.host.toLowerCase())) {
    return null;
  }

  const path = location.path.replace(/^\/+/, "").replace(/\/+$/, "").replace(/\.git$/, "");

  try {
    return formatRepoRef(parseRepoRef(path));
  } catch {
    return null;
  }
}

export function selectGitHubRemote(remotes: GitHubRemote[]): GitRepositoryInference {
  if (remotes.length === 0) {
    return { kind: "no-github-remote" };
  }

  const preferred = findRemote(remotes, "origin") ?? findRemote(remotes, "upstream");

  if (preferred) {
    return withUpstreamHint(preferred, remotes);
  }

  const distinct = new Set(remotes.map((remote) => remote.fullName.toLowerCase()));

  if (distinct.size === 1) {
    return { kind: "inferred", fullName: remotes[0].fullName, remote: remotes[0].name };
  }

  return { kind: "ambiguous", candidates: remotes };
}

export function formatInferenceFailure(inference: GitRepositoryInference): string {
  if (inference.kind === "ambiguous") {
    const candidates = inference.candidates
      .map((remote) => `  ${remote.name}\t${remote.fullName}`)
      .join("\n");

    return `several GitHub remotes in this checkout, none named origin or upstream:\n${candidates}\nPass owner/name.`;
  }

  return "no GitHub remote in this checkout. Pass owner/name.";
}

function withUpstreamHint(preferred: GitHubRemote, remotes: GitHubRemote[]): GitRepositoryInference {
  const upstream = preferred.name === "origin" ? findRemote(remotes, "upstream") : null;
  const differs = upstream && upstream.fullName.toLowerCase() !== preferred.fullName.toLowerCase();

  return {
    kind: "inferred",
    fullName: preferred.fullName,
    remote: preferred.name,
    ...(differs ? { upstreamFullName: upstream.fullName } : {}),
  };
}

function findRemote(remotes: GitHubRemote[], name: string): GitHubRemote | null {
  return remotes.find((remote) => remote.name === name) ?? null;
}

function splitRemoteUrl(url: string): { host: string; path: string } | null {
  if (url.includes("://")) {
    try {
      const parsed = new URL(url);
      return { host: parsed.hostname, path: parsed.pathname };
    } catch {
      return null;
    }
  }

  const match = /^(?:[^@\s]+@)?([^:\s]+):(.+)$/.exec(url);

  return match ? { host: match[1], path: match[2] } : null;
}

function runGit(args: string[], cwd: string): Promise<{ ok: boolean; stdout: string }> {
  return new Promise((resolve) => {
    const child = spawn("git", args, { cwd, stdio: ["ignore", "pipe", "ignore"] });
    const output: Buffer[] = [];
    let settled = false;

    const settle = (value: { ok: boolean; stdout: string }) => {
      if (settled) {
        return;
      }

      settled = true;
      resolve(value);
    };

    child.stdout?.on("data", (chunk: Buffer) => {
      output.push(chunk);
    });

    child.once("error", () => {
      settle({ ok: false, stdout: "" });
    });

    child.once("close", (code) => {
      settle({ ok: code === 0, stdout: Buffer.concat(output).toString("utf8") });
    });
  });
}

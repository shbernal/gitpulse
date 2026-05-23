import { homedir } from "node:os";
import path from "node:path";
import type { RepoRef } from "../types";

type Env = Record<string, string | undefined>;

export function gitpulseCacheDir(env: Env = process.env): string {
  return path.join(xdgDir("XDG_CACHE_HOME", ".cache", env), "gitpulse");
}

export function gitpulseStateDir(env: Env = process.env): string {
  return path.join(xdgDir("XDG_STATE_HOME", ".local/state", env), "gitpulse");
}

export function snapshotCachePath(ref: RepoRef, env: Env = process.env): string {
  return path.join(gitpulseCacheDir(env), "snapshots", "github", safeSegment(ref.owner), `${safeSegment(ref.name)}.json`);
}

export function userProfileCachePath(login: string, env: Env = process.env): string {
  return path.join(gitpulseCacheDir(env), "snapshots", "github-users", `${safeSegment(login)}.json`);
}

export function historyPath(env: Env = process.env): string {
  return path.join(gitpulseStateDir(env), "history.jsonl");
}

function xdgDir(variable: "XDG_CACHE_HOME" | "XDG_STATE_HOME", fallback: string, env: Env): string {
  const configured = env[variable];

  if (configured) {
    return configured;
  }

  return path.join(env.HOME || homedir(), fallback);
}

function safeSegment(value: string): string {
  return value
    .toLowerCase()
    .replace(/%/g, "%25")
    .replace(/\./g, "%2e");
}

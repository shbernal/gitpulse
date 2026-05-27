import { createHash } from "node:crypto";
import { homedir } from "node:os";
import path from "node:path";
import type {
  RepoRef,
  SearchRepositoryOrder,
  SearchRepositorySort,
  StarredRepositoryDirection,
  StarredRepositorySort,
} from "../types";

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

export function starredRepositoriesCachePath(
  options: { sort: StarredRepositorySort; direction: StarredRepositoryDirection },
  env: Env = process.env,
): string {
  return path.join(gitpulseCacheDir(env), "snapshots", "github-starred", `self-${options.sort}-${options.direction}.json`);
}

export function searchRepositoriesCachePath(
  options: { query: string; sort: SearchRepositorySort; order: SearchRepositoryOrder; limit: number },
  env: Env = process.env,
): string {
  const key = `${options.query}\0${options.sort}\0${options.order}\0${options.limit}`;
  const hash = createHash("sha256").update(key).digest("hex").slice(0, 16);
  const label = safeSearchLabel(options.query);

  return path.join(gitpulseCacheDir(env), "snapshots", "github-search", `${hash}-${label}.json`);
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

function safeSearchLabel(value: string): string {
  const label = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

  return label || "query";
}

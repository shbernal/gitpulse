import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { parseRepoRef } from "../util/repo-ref";
import { readHistoryEvents } from "./history";
import { gitpulseCacheDir } from "./paths";

type Env = Record<string, string | undefined>;

export type KnownRepoSource = "history" | "cache";

export type KnownRepo = {
  fullName: string;
  owner: string;
  name: string;
  lastSeenAt?: string;
  cachedAt?: string;
  sources: KnownRepoSource[];
};

export type ShorthandErrorKind = "ambiguous" | "unknown";

export class RepositoryShorthandError extends Error {
  readonly kind: ShorthandErrorKind;
  readonly input: string;
  readonly candidates: string[];

  constructor(kind: ShorthandErrorKind, input: string, candidates: string[] = []) {
    super(shorthandErrorMessage(kind, input, candidates));
    this.name = "RepositoryShorthandError";
    this.kind = kind;
    this.input = input;
    this.candidates = candidates;
  }
}

type MutableKnownRepo = Omit<KnownRepo, "sources"> & {
  sources: Set<KnownRepoSource>;
  canonicalFromCache: boolean;
};

export async function readKnownRepos(env: Env = process.env): Promise<KnownRepo[]> {
  const repos = new Map<string, MutableKnownRepo>();

  await mergeHistoryRepos(repos, env);
  await mergeCacheRepos(repos, env);

  return [...repos.values()]
    .map((repo) => ({
      fullName: repo.fullName,
      owner: repo.owner,
      name: repo.name,
      lastSeenAt: repo.lastSeenAt,
      cachedAt: repo.cachedAt,
      sources: sortSources([...repo.sources]),
    }))
    .sort(compareKnownRepos);
}

export function resolveKnownRepoShorthand(input: string, knownRepos: KnownRepo[]): string {
  if (input.includes("/")) {
    return input;
  }

  const normalized = input.toLowerCase();
  const matches = uniqueRepos(
    knownRepos.filter((repo) => repo.owner.toLowerCase() === normalized || repo.name.toLowerCase() === normalized),
  );

  if (matches.length === 1) {
    return matches[0].fullName;
  }

  if (matches.length > 1) {
    throw new RepositoryShorthandError(
      "ambiguous",
      input,
      matches.map((repo) => repo.fullName).sort((left, right) => left.localeCompare(right)),
    );
  }

  throw new RepositoryShorthandError("unknown", input);
}

export function completeKnownRepos(current: string, knownRepos: KnownRepo[]): string[] {
  const normalized = current.toLowerCase();
  const hasSlash = current.includes("/");
  const seen = new Set<string>();

  return knownRepos
    .map((repo) => ({ repo, quality: matchQuality(repo, normalized, hasSlash) }))
    .filter((match): match is { repo: KnownRepo; quality: number } => match.quality !== null)
    .sort((left, right) => {
      if (left.quality !== right.quality) {
        return left.quality - right.quality;
      }

      return compareKnownRepos(left.repo, right.repo);
    })
    .flatMap(({ repo }) => {
      const key = repo.fullName.toLowerCase();

      if (seen.has(key)) {
        return [];
      }

      seen.add(key);
      return [repo.fullName];
    });
}

async function mergeHistoryRepos(repos: Map<string, MutableKnownRepo>, env: Env): Promise<void> {
  let events;

  try {
    events = await readHistoryEvents(env);
  } catch {
    return;
  }

  for (const event of events) {
    for (const entry of event.entries) {
      if (!entry.ok || !entry.repository) {
        continue;
      }

      mergeRepo(repos, entry.repository, {
        source: "history",
        lastSeenAt: event.timestamp,
      });
    }
  }
}

async function mergeCacheRepos(repos: Map<string, MutableKnownRepo>, env: Env): Promise<void> {
  const root = path.join(gitpulseCacheDir(env), "snapshots", "github");
  const files = await listJsonFiles(root);

  for (const filePath of files) {
    try {
      const raw = await readFile(filePath, "utf8");
      const parsed = JSON.parse(raw) as unknown;
      const cached = cachedRepoMetadata(parsed);

      if (!cached) {
        continue;
      }

      mergeRepo(repos, cached.fullName, {
        source: "cache",
        cachedAt: cached.cachedAt,
        preferCanonical: true,
      });
    } catch {
      continue;
    }
  }
}

async function listJsonFiles(root: string): Promise<string[]> {
  let entries;

  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }

  const files = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(root, entry.name);

      if (entry.isDirectory()) {
        return listJsonFiles(entryPath);
      }

      return entry.isFile() && entry.name.endsWith(".json") ? [entryPath] : [];
    }),
  );

  return files.flat();
}

function cachedRepoMetadata(value: unknown): { fullName: string; cachedAt: string } | null {
  if (!isRecord(value) || typeof value.cachedAt !== "string" || !isRecord(value.snapshot)) {
    return null;
  }

  const snapshot = value.snapshot;

  if (!isRecord(snapshot.repository) || typeof snapshot.repository.fullName !== "string") {
    return null;
  }

  return {
    fullName: snapshot.repository.fullName,
    cachedAt: value.cachedAt,
  };
}

function mergeRepo(
  repos: Map<string, MutableKnownRepo>,
  fullName: string,
  options: { source: KnownRepoSource; lastSeenAt?: string; cachedAt?: string; preferCanonical?: boolean },
): void {
  let ref;

  try {
    ref = parseRepoRef(fullName);
  } catch {
    return;
  }

  const key = `${ref.owner.toLowerCase()}/${ref.name.toLowerCase()}`;
  const existing = repos.get(key);

  if (!existing) {
    repos.set(key, {
      fullName,
      owner: ref.owner,
      name: ref.name,
      lastSeenAt: options.lastSeenAt,
      cachedAt: options.cachedAt,
      sources: new Set([options.source]),
      canonicalFromCache: Boolean(options.preferCanonical),
    });
    return;
  }

  existing.sources.add(options.source);

  if (options.lastSeenAt && isNewer(options.lastSeenAt, existing.lastSeenAt)) {
    existing.lastSeenAt = options.lastSeenAt;
  }

  if (options.cachedAt && isNewer(options.cachedAt, existing.cachedAt)) {
    existing.cachedAt = options.cachedAt;
  }

  if (options.preferCanonical && !existing.canonicalFromCache) {
    existing.fullName = fullName;
    existing.owner = ref.owner;
    existing.name = ref.name;
    existing.canonicalFromCache = true;
  }
}

function matchQuality(repo: KnownRepo, current: string, hasSlash: boolean): number | null {
  const fullName = repo.fullName.toLowerCase();
  const owner = repo.owner.toLowerCase();
  const name = repo.name.toLowerCase();

  if (current.length === 0) {
    return 0;
  }

  if (hasSlash) {
    return fullName.startsWith(current) ? 1 : null;
  }

  if (fullName.startsWith(current)) {
    return 1;
  }

  if (owner.startsWith(current)) {
    return 2;
  }

  if (name.startsWith(current)) {
    return 3;
  }

  return null;
}

function uniqueRepos(repos: KnownRepo[]): KnownRepo[] {
  const seen = new Set<string>();
  const unique: KnownRepo[] = [];

  for (const repo of repos) {
    const key = repo.fullName.toLowerCase();

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    unique.push(repo);
  }

  return unique;
}

function compareKnownRepos(left: KnownRepo, right: KnownRepo): number {
  const recency = repoRecency(right) - repoRecency(left);

  if (recency !== 0) {
    return recency;
  }

  return left.fullName.localeCompare(right.fullName);
}

function repoRecency(repo: Pick<KnownRepo, "lastSeenAt" | "cachedAt">): number {
  return Math.max(timestamp(repo.lastSeenAt), timestamp(repo.cachedAt));
}

function isNewer(candidate: string, existing: string | undefined): boolean {
  return timestamp(candidate) > timestamp(existing);
}

function timestamp(value: string | undefined): number {
  if (!value) {
    return 0;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function sortSources(sources: KnownRepoSource[]): KnownRepoSource[] {
  const order: Record<KnownRepoSource, number> = {
    history: 0,
    cache: 1,
  };

  return sources.sort((left, right) => order[left] - order[right]);
}

function shorthandErrorMessage(kind: ShorthandErrorKind, input: string, candidates: string[]): string {
  if (kind === "ambiguous") {
    return [
      `Ambiguous repository shorthand "${input}".`,
      "",
      "Known matches:",
      ...candidates.map((candidate) => `  ${candidate}`),
      "",
      "Use owner/name.",
    ].join("\n");
  }

  return `Unknown repository shorthand "${input}".\nUse owner/name once to fetch and record it.`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

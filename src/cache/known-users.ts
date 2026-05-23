import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { parseGitHubLogin } from "../util/github-login";
import { readHistoryEvents } from "./history";
import { gitpulseCacheDir } from "./paths";

type Env = Record<string, string | undefined>;

export type KnownUserSource = "history" | "cache";

export type KnownUser = {
  login: string;
  lastSeenAt?: string;
  cachedAt?: string;
  sources: KnownUserSource[];
};

type MutableKnownUser = Omit<KnownUser, "sources"> & {
  sources: Set<KnownUserSource>;
  canonicalFromCache: boolean;
};

export async function readKnownUsers(env: Env = process.env): Promise<KnownUser[]> {
  const users = new Map<string, MutableKnownUser>();

  await mergeHistoryUsers(users, env);
  await mergeCacheUsers(users, env);

  return [...users.values()]
    .map((user) => ({
      login: user.login,
      lastSeenAt: user.lastSeenAt,
      cachedAt: user.cachedAt,
      sources: sortSources([...user.sources]),
    }))
    .sort(compareKnownUsers);
}

export function completeKnownUsers(current: string, knownUsers: KnownUser[]): string[] {
  const normalized = current.toLowerCase();
  const seen = new Set<string>();

  return knownUsers
    .filter((user) => normalized.length === 0 || user.login.toLowerCase().startsWith(normalized))
    .sort(compareKnownUsers)
    .flatMap((user) => {
      const key = user.login.toLowerCase();

      if (seen.has(key)) {
        return [];
      }

      seen.add(key);
      return [user.login];
    });
}

async function mergeHistoryUsers(users: Map<string, MutableKnownUser>, env: Env): Promise<void> {
  let events;

  try {
    events = await readHistoryEvents(env);
  } catch {
    return;
  }

  for (const event of events) {
    if (event.command !== "user") {
      continue;
    }

    for (const entry of event.entries) {
      const login = entry.user ?? entry.input;

      if (!entry.ok || !login) {
        continue;
      }

      mergeUser(users, login, {
        source: "history",
        lastSeenAt: event.timestamp,
      });
    }
  }
}

async function mergeCacheUsers(users: Map<string, MutableKnownUser>, env: Env): Promise<void> {
  const root = path.join(gitpulseCacheDir(env), "snapshots", "github-users");
  const files = await listJsonFiles(root);

  for (const filePath of files) {
    try {
      const raw = await readFile(filePath, "utf8");
      const parsed = JSON.parse(raw) as unknown;
      const cached = cachedUserMetadata(parsed);

      if (!cached) {
        continue;
      }

      mergeUser(users, cached.login, {
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

function cachedUserMetadata(value: unknown): { login: string; cachedAt: string } | null {
  if (!isRecord(value) || typeof value.cachedAt !== "string" || !isRecord(value.snapshot)) {
    return null;
  }

  const snapshot = value.snapshot;

  if (!isRecord(snapshot.profile) || typeof snapshot.profile.login !== "string") {
    return null;
  }

  return {
    login: snapshot.profile.login,
    cachedAt: value.cachedAt,
  };
}

function mergeUser(
  users: Map<string, MutableKnownUser>,
  login: string,
  options: { source: KnownUserSource; lastSeenAt?: string; cachedAt?: string; preferCanonical?: boolean },
): void {
  let parsedLogin;

  try {
    parsedLogin = parseGitHubLogin(login);
  } catch {
    return;
  }

  const key = parsedLogin.toLowerCase();
  const existing = users.get(key);

  if (!existing) {
    users.set(key, {
      login: parsedLogin,
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
    existing.login = parsedLogin;
    existing.canonicalFromCache = true;
  }
}

function compareKnownUsers(left: KnownUser, right: KnownUser): number {
  const recency = userRecency(right) - userRecency(left);

  if (recency !== 0) {
    return recency;
  }

  return left.login.localeCompare(right.login);
}

function userRecency(user: Pick<KnownUser, "lastSeenAt" | "cachedAt">): number {
  return Math.max(timestamp(user.lastSeenAt), timestamp(user.cachedAt));
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

function sortSources(sources: KnownUserSource[]): KnownUserSource[] {
  const order: Record<KnownUserSource, number> = {
    history: 0,
    cache: 1,
  };

  return sources.sort((left, right) => order[left] - order[right]);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

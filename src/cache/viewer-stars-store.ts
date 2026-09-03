import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { RepoRef } from "../types";
import { viewerStarsCachePath } from "./paths";

export const viewerStarsCacheSchemaVersion = 1 as const;
const viewerStarsCacheKey = "github:viewer-stars:self";

// Probe results accumulate one entry per inspected repository between full list syncs.
const maxProbeEntries = 1000;

type Env = Record<string, string | undefined>;

export type ViewerStarEntry = {
  starred: boolean;
  checkedAt: string;
};

export type CachedViewerStars = {
  schemaVersion: typeof viewerStarsCacheSchemaVersion;
  forge: "github";
  key: typeof viewerStarsCacheKey;
  // Set when the full starred list was fetched. Any repository missing from `entries` was not
  // starred at that moment, which turns a list sync into a cached answer for the negative case too.
  listSyncedAt: string | null;
  entries: Record<string, ViewerStarEntry>;
};

export class ViewerStarsCacheError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ViewerStarsCacheError";
  }
}

export function viewerStarKey(ref: RepoRef): string {
  return `${ref.owner.toLowerCase()}/${ref.name.toLowerCase()}`;
}

export function lookupViewerStar(cache: CachedViewerStars | null, ref: RepoRef): ViewerStarEntry | null {
  if (!cache) {
    return null;
  }

  const entry = cache.entries[viewerStarKey(ref)];

  if (entry) {
    return entry;
  }

  return cache.listSyncedAt ? { starred: false, checkedAt: cache.listSyncedAt } : null;
}

export async function readCachedViewerStars(env: Env = process.env): Promise<CachedViewerStars | null> {
  const filePath = viewerStarsCachePath(env);

  try {
    const parsed = JSON.parse(await readFile(filePath, "utf8")) as unknown;

    if (!isCachedViewerStars(parsed)) {
      throw new ViewerStarsCacheError(`Invalid viewer star cache entry at ${filePath}.`);
    }

    return parsed;
  } catch (error) {
    if (isNotFound(error)) {
      return null;
    }

    if (error instanceof SyntaxError) {
      throw new ViewerStarsCacheError(`Could not parse viewer star cache entry at ${filePath}.`);
    }

    throw error;
  }
}

export async function writeViewerStarProbe(
  ref: RepoRef,
  starred: boolean,
  now = new Date(),
  env: Env = process.env,
): Promise<CachedViewerStars> {
  const current = await readCachedViewerStarsOrEmpty(env);
  const entries = { ...current.entries, [viewerStarKey(ref)]: { starred, checkedAt: now.toISOString() } };

  return writeCache({ ...current, entries: prune(entries) }, env);
}

// A full starred list replaces every known entry: it is authoritative for the positives, and it
// makes previously probed repositories answerable from `listSyncedAt` alone.
export async function syncViewerStarsFromList(
  fullNames: string[],
  now = new Date(),
  env: Env = process.env,
): Promise<CachedViewerStars> {
  const checkedAt = now.toISOString();
  const entries: Record<string, ViewerStarEntry> = {};

  for (const fullName of fullNames) {
    entries[fullName.toLowerCase()] = { starred: true, checkedAt };
  }

  return writeCache(
    {
      schemaVersion: viewerStarsCacheSchemaVersion,
      forge: "github",
      key: viewerStarsCacheKey,
      listSyncedAt: checkedAt,
      entries,
    },
    env,
  );
}

async function readCachedViewerStarsOrEmpty(env: Env): Promise<CachedViewerStars> {
  try {
    return (
      (await readCachedViewerStars(env)) ?? {
        schemaVersion: viewerStarsCacheSchemaVersion,
        forge: "github",
        key: viewerStarsCacheKey,
        listSyncedAt: null,
        entries: {},
      }
    );
  } catch {
    return {
      schemaVersion: viewerStarsCacheSchemaVersion,
      forge: "github",
      key: viewerStarsCacheKey,
      listSyncedAt: null,
      entries: {},
    };
  }
}

async function writeCache(cache: CachedViewerStars, env: Env): Promise<CachedViewerStars> {
  const filePath = viewerStarsCachePath(env);
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;

  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(tempPath, `${JSON.stringify(cache, null, 2)}\n`, "utf8");
  await rename(tempPath, filePath);

  return cache;
}

function prune(entries: Record<string, ViewerStarEntry>): Record<string, ViewerStarEntry> {
  const keys = Object.keys(entries);

  if (keys.length <= maxProbeEntries) {
    return entries;
  }

  const kept = keys
    .sort((left, right) => entries[right].checkedAt.localeCompare(entries[left].checkedAt))
    .slice(0, maxProbeEntries);

  return Object.fromEntries(kept.map((key) => [key, entries[key]]));
}

function isCachedViewerStars(value: unknown): value is CachedViewerStars {
  if (!isRecord(value)) {
    return false;
  }

  return (
    value.schemaVersion === viewerStarsCacheSchemaVersion &&
    value.forge === "github" &&
    value.key === viewerStarsCacheKey &&
    (value.listSyncedAt === null || typeof value.listSyncedAt === "string") &&
    isRecord(value.entries) &&
    Object.values(value.entries).every(
      (entry) => isRecord(entry) && typeof entry.starred === "boolean" && typeof entry.checkedAt === "string",
    )
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNotFound(error: unknown): boolean {
  return isRecord(error) && error.code === "ENOENT";
}

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { RepoRef, RepoSnapshot } from "../types";
import { snapshotCachePath } from "./paths";

export const cacheSchemaVersion = 3 as const;

type Env = Record<string, string | undefined>;

export type CachedSnapshot = {
  schemaVersion: typeof cacheSchemaVersion;
  forge: "github";
  key: string;
  cachedAt: string;
  snapshot: RepoSnapshot;
};

export class CacheError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CacheError";
  }
}

export async function readCachedSnapshot(ref: RepoRef, env: Env = process.env): Promise<CachedSnapshot | null> {
  const filePath = snapshotCachePath(ref, env);

  try {
    const raw = await readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as unknown;

    if (!isCachedSnapshot(parsed)) {
      throw new CacheError(`Invalid cache entry at ${filePath}.`);
    }

    return parsed;
  } catch (error) {
    if (isNotFound(error)) {
      return null;
    }

    if (error instanceof SyntaxError) {
      throw new CacheError(`Could not parse cache entry at ${filePath}.`);
    }

    throw error;
  }
}

export async function writeCachedSnapshot(
  ref: RepoRef,
  snapshot: RepoSnapshot,
  now = new Date(),
  env: Env = process.env,
): Promise<CachedSnapshot> {
  const filePath = snapshotCachePath(ref, env);
  const entry: CachedSnapshot = {
    schemaVersion: cacheSchemaVersion,
    forge: "github",
    key: cacheKey(ref),
    cachedAt: now.toISOString(),
    snapshot,
  };
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;

  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(tempPath, `${JSON.stringify(entry, null, 2)}\n`, "utf8");
  await rename(tempPath, filePath);

  return entry;
}

export function cacheKey(ref: RepoRef): string {
  return `github:${ref.owner.toLowerCase()}/${ref.name.toLowerCase()}`;
}

function isCachedSnapshot(value: unknown): value is CachedSnapshot {
  if (!isRecord(value)) {
    return false;
  }

  return (
    value.schemaVersion === cacheSchemaVersion &&
    value.forge === "github" &&
    typeof value.key === "string" &&
    typeof value.cachedAt === "string" &&
    isRecord(value.snapshot)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNotFound(error: unknown): boolean {
  return isRecord(error) && error.code === "ENOENT";
}

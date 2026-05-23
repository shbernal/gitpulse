import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { UserProfileSnapshot } from "../types";
import { userProfileCachePath } from "./paths";
import { cacheSchemaVersion, CacheError } from "./store";

type Env = Record<string, string | undefined>;

export type CachedUserProfileSnapshot = {
  schemaVersion: typeof cacheSchemaVersion;
  forge: "github";
  key: string;
  cachedAt: string;
  snapshot: UserProfileSnapshot;
};

export async function readCachedUserProfileSnapshot(
  login: string,
  env: Env = process.env,
): Promise<CachedUserProfileSnapshot | null> {
  const filePath = userProfileCachePath(login, env);

  try {
    const raw = await readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as unknown;

    if (!isCachedUserProfileSnapshot(parsed)) {
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

export async function writeCachedUserProfileSnapshot(
  login: string,
  snapshot: UserProfileSnapshot,
  now = new Date(),
  env: Env = process.env,
): Promise<CachedUserProfileSnapshot> {
  const filePath = userProfileCachePath(login, env);
  const entry: CachedUserProfileSnapshot = {
    schemaVersion: cacheSchemaVersion,
    forge: "github",
    key: userProfileCacheKey(login),
    cachedAt: now.toISOString(),
    snapshot,
  };
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;

  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(tempPath, `${JSON.stringify(entry, null, 2)}\n`, "utf8");
  await rename(tempPath, filePath);

  return entry;
}

export function userProfileCacheKey(login: string): string {
  return `github:user:${login.toLowerCase()}`;
}

function isCachedUserProfileSnapshot(value: unknown): value is CachedUserProfileSnapshot {
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

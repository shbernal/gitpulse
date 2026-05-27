import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type {
  StarredRepositoryDirection,
  StarredRepositoryList,
  StarredRepositorySort,
} from "../types";
import { starredRepositoriesCachePath } from "./paths";

export const starredRepositoriesCacheSchemaVersion = 1 as const;

type Env = Record<string, string | undefined>;

export type StarredRepositoriesCacheOptions = {
  sort: StarredRepositorySort;
  direction: StarredRepositoryDirection;
};

export type CachedStarredRepositories = {
  schemaVersion: typeof starredRepositoriesCacheSchemaVersion;
  forge: "github";
  key: string;
  cachedAt: string;
  sort: StarredRepositorySort;
  direction: StarredRepositoryDirection;
  list: StarredRepositoryList;
};

export class StarredRepositoriesCacheError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StarredRepositoriesCacheError";
  }
}

export async function readCachedStarredRepositories(
  options: StarredRepositoriesCacheOptions,
  env: Env = process.env,
): Promise<CachedStarredRepositories | null> {
  const filePath = starredRepositoriesCachePath(options, env);

  try {
    const raw = await readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as unknown;

    if (!isCachedStarredRepositories(parsed, options)) {
      throw new StarredRepositoriesCacheError(`Invalid starred repository cache entry at ${filePath}.`);
    }

    return parsed;
  } catch (error) {
    if (isNotFound(error)) {
      return null;
    }

    if (error instanceof SyntaxError) {
      throw new StarredRepositoriesCacheError(`Could not parse starred repository cache entry at ${filePath}.`);
    }

    throw error;
  }
}

export async function writeCachedStarredRepositories(
  options: StarredRepositoriesCacheOptions,
  list: StarredRepositoryList,
  now = new Date(),
  env: Env = process.env,
): Promise<CachedStarredRepositories> {
  const filePath = starredRepositoriesCachePath(options, env);
  const entry: CachedStarredRepositories = {
    schemaVersion: starredRepositoriesCacheSchemaVersion,
    forge: "github",
    key: cacheKey(options),
    cachedAt: now.toISOString(),
    sort: options.sort,
    direction: options.direction,
    list,
  };
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;

  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(tempPath, `${JSON.stringify(entry, null, 2)}\n`, "utf8");
  await rename(tempPath, filePath);

  return entry;
}

function cacheKey(options: StarredRepositoriesCacheOptions): string {
  return `github:starred:self:${options.sort}:${options.direction}`;
}

function isCachedStarredRepositories(
  value: unknown,
  options: StarredRepositoriesCacheOptions,
): value is CachedStarredRepositories {
  if (!isRecord(value)) {
    return false;
  }

  return (
    value.schemaVersion === starredRepositoriesCacheSchemaVersion &&
    value.forge === "github" &&
    value.key === cacheKey(options) &&
    value.sort === options.sort &&
    value.direction === options.direction &&
    typeof value.cachedAt === "string" &&
    isRecord(value.list) &&
    value.list.sort === options.sort &&
    value.list.direction === options.direction &&
    typeof value.list.fetchedAt === "string" &&
    Array.isArray(value.list.repositories)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNotFound(error: unknown): boolean {
  return isRecord(error) && error.code === "ENOENT";
}

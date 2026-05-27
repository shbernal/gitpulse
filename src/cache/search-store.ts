import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type {
  SearchRepositoryList,
  SearchRepositoryOrder,
  SearchRepositorySort,
} from "../types";
import { searchRepositoriesCachePath } from "./paths";

export const searchRepositoriesCacheSchemaVersion = 1 as const;

type Env = Record<string, string | undefined>;

export type SearchRepositoriesCacheOptions = {
  query: string;
  sort: SearchRepositorySort;
  order: SearchRepositoryOrder;
  limit: number;
};

export type CachedSearchRepositories = {
  schemaVersion: typeof searchRepositoriesCacheSchemaVersion;
  forge: "github";
  key: string;
  cachedAt: string;
  query: string;
  sort: SearchRepositorySort;
  order: SearchRepositoryOrder;
  limit: number;
  list: SearchRepositoryList;
};

export class SearchRepositoriesCacheError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SearchRepositoriesCacheError";
  }
}

export async function readCachedSearchRepositories(
  options: SearchRepositoriesCacheOptions,
  env: Env = process.env,
): Promise<CachedSearchRepositories | null> {
  const filePath = searchRepositoriesCachePath(options, env);

  try {
    const raw = await readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as unknown;

    if (!isCachedSearchRepositories(parsed, options)) {
      throw new SearchRepositoriesCacheError(`Invalid repository search cache entry at ${filePath}.`);
    }

    return parsed;
  } catch (error) {
    if (isNotFound(error)) {
      return null;
    }

    if (error instanceof SyntaxError) {
      throw new SearchRepositoriesCacheError(`Could not parse repository search cache entry at ${filePath}.`);
    }

    throw error;
  }
}

export async function writeCachedSearchRepositories(
  options: SearchRepositoriesCacheOptions,
  list: SearchRepositoryList,
  now = new Date(),
  env: Env = process.env,
): Promise<CachedSearchRepositories> {
  const filePath = searchRepositoriesCachePath(options, env);
  const entry: CachedSearchRepositories = {
    schemaVersion: searchRepositoriesCacheSchemaVersion,
    forge: "github",
    key: cacheKey(options),
    cachedAt: now.toISOString(),
    query: options.query,
    sort: options.sort,
    order: options.order,
    limit: options.limit,
    list,
  };
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;

  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(tempPath, `${JSON.stringify(entry, null, 2)}\n`, "utf8");
  await rename(tempPath, filePath);

  return entry;
}

function cacheKey(options: SearchRepositoriesCacheOptions): string {
  return `github:search:${options.query}:${options.sort}:${options.order}:${options.limit}`;
}

function isCachedSearchRepositories(
  value: unknown,
  options: SearchRepositoriesCacheOptions,
): value is CachedSearchRepositories {
  if (!isRecord(value)) {
    return false;
  }

  return (
    value.schemaVersion === searchRepositoriesCacheSchemaVersion &&
    value.forge === "github" &&
    value.key === cacheKey(options) &&
    value.query === options.query &&
    value.sort === options.sort &&
    value.order === options.order &&
    value.limit === options.limit &&
    typeof value.cachedAt === "string" &&
    isRecord(value.list) &&
    value.list.query === options.query &&
    value.list.sort === options.sort &&
    value.list.order === options.order &&
    value.list.limit === options.limit &&
    typeof value.list.fetchedAt === "string" &&
    typeof value.list.totalCount === "number" &&
    typeof value.list.incompleteResults === "boolean" &&
    Array.isArray(value.list.repositories)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNotFound(error: unknown): boolean {
  return isRecord(error) && error.code === "ENOENT";
}

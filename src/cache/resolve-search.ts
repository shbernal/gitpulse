import type { GitHubClient } from "../github/client";
import { collectSearchRepositories } from "../metrics/search";
import type {
  SearchRepositoriesWithSource,
  SearchRepositoryOrder,
  SearchRepositoryResult,
  SearchRepositorySort,
  SnapshotError,
} from "../types";
import { cacheAgeHours, cacheSource, isFreshCache, type CacheMode } from "./policy";
import {
  readCachedSearchRepositories,
  writeCachedSearchRepositories,
  type CachedSearchRepositories,
} from "./search-store";

type Env = Record<string, string | undefined>;

export type SearchRepositoriesResolverOptions = {
  cacheEnabled: boolean;
  maxCacheHours: number;
  staleIfError: boolean;
  mode: CacheMode;
  query: string;
  sort: SearchRepositorySort;
  order: SearchRepositoryOrder;
  limit: number;
  now?: Date;
  env?: Env;
};

export async function resolveSearchRepositories(
  client: GitHubClient,
  options: SearchRepositoriesResolverOptions,
): Promise<SearchRepositoriesWithSource> {
  const now = options.now ?? new Date();
  const shouldReadCache = options.mode !== "refresh" && (options.cacheEnabled || options.mode === "offline");
  const cached = shouldReadCache ? await tryReadCache(options, options.env) : { entry: null, failure: null };

  if (cached.failure && options.mode === "offline") {
    return {
      result: cached.failure,
      source: { kind: "none" },
    };
  }

  if (cached.entry) {
    const source = cacheSource(cached.entry.cachedAt, options.maxCacheHours, now);

    if (options.mode === "offline" || isFreshCache(cached.entry.cachedAt, options.maxCacheHours, now)) {
      return {
        result: { ok: true, list: cached.entry.list },
        source,
      };
    }
  }

  if (options.mode === "offline") {
    return {
      result: {
        ok: false,
        error: {
          message: "No cached repository search results. Run without --offline first.",
          code: "missing_cache",
        },
      },
      source: { kind: "none" },
    };
  }

  const apiResult = await collectSearchRepositories(client, now, {
    query: options.query,
    sort: options.sort,
    order: options.order,
    limit: options.limit,
  });

  if (apiResult.ok) {
    if (options.cacheEnabled) {
      await tryWriteCache(options, apiResult.list, now, options.env);
    }

    return {
      result: apiResult,
      source: { kind: "api" },
    };
  }

  if (cached.entry && options.staleIfError && options.mode !== "refresh") {
    return {
      result: { ok: true, list: cached.entry.list },
      source: {
        kind: "stale-cache",
        cachedAt: cached.entry.cachedAt,
        ageHours: cacheAgeHours(cached.entry.cachedAt, now),
        refreshError: apiResult.error,
      },
    };
  }

  return {
    result: apiResult,
    source: { kind: "api" },
  };
}

async function tryWriteCache(
  options: SearchRepositoriesResolverOptions,
  list: Extract<SearchRepositoryResult, { ok: true }>["list"],
  now: Date,
  env: Env | undefined,
): Promise<void> {
  try {
    await writeCachedSearchRepositories(
      { query: options.query, sort: options.sort, order: options.order, limit: options.limit },
      list,
      now,
      env,
    );
  } catch {
    // Cache writes must not prevent a live API result from being shown.
  }
}

async function tryReadCache(
  options: SearchRepositoriesResolverOptions,
  env: Env | undefined,
): Promise<{ entry: CachedSearchRepositories | null; failure: SearchRepositoryResult | null }> {
  try {
    return {
      entry: await readCachedSearchRepositories(
        { query: options.query, sort: options.sort, order: options.order, limit: options.limit },
        env,
      ),
      failure: null,
    };
  } catch (error) {
    const snapshotError = errorToSnapshotError(error);

    return {
      entry: null,
      failure: {
        ok: false,
        error: {
          ...snapshotError,
          message: `Could not read cached repository search results: ${snapshotError.message}`,
        },
      },
    };
  }
}

function errorToSnapshotError(error: unknown): SnapshotError {
  if (error instanceof Error) {
    return {
      message: error.message,
      code: error.name,
    };
  }

  return {
    message: "Unknown error.",
    code: "unknown",
  };
}

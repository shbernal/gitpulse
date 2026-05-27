import type { GitHubClient } from "../github/client";
import { collectStarredRepositories } from "../metrics/starred";
import type {
  SnapshotError,
  StarredRepositoriesWithSource,
  StarredRepositoryDirection,
  StarredRepositoryResult,
  StarredRepositorySort,
} from "../types";
import { cacheAgeHours, cacheSource, isFreshCache, type CacheMode } from "./policy";
import {
  readCachedStarredRepositories,
  writeCachedStarredRepositories,
  type CachedStarredRepositories,
} from "./starred-store";

type Env = Record<string, string | undefined>;

export type StarredRepositoriesResolverOptions = {
  cacheEnabled: boolean;
  maxCacheHours: number;
  staleIfError: boolean;
  mode: CacheMode;
  sort: StarredRepositorySort;
  direction: StarredRepositoryDirection;
  now?: Date;
  env?: Env;
};

export async function resolveStarredRepositories(
  client: GitHubClient,
  options: StarredRepositoriesResolverOptions,
): Promise<StarredRepositoriesWithSource> {
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
          message: "No cached starred repository list. Run without --offline first.",
          code: "missing_cache",
        },
      },
      source: { kind: "none" },
    };
  }

  const apiResult = await collectStarredRepositories(client, now, {
    sort: options.sort,
    direction: options.direction,
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
  options: StarredRepositoriesResolverOptions,
  list: Extract<StarredRepositoryResult, { ok: true }>["list"],
  now: Date,
  env: Env | undefined,
): Promise<void> {
  try {
    await writeCachedStarredRepositories(
      { sort: options.sort, direction: options.direction },
      list,
      now,
      env,
    );
  } catch {
    // Cache writes must not prevent a live API result from being shown.
  }
}

async function tryReadCache(
  options: StarredRepositoriesResolverOptions,
  env: Env | undefined,
): Promise<{ entry: CachedStarredRepositories | null; failure: StarredRepositoryResult | null }> {
  try {
    return {
      entry: await readCachedStarredRepositories({ sort: options.sort, direction: options.direction }, env),
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
          message: `Could not read cached starred repository list: ${snapshotError.message}`,
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
